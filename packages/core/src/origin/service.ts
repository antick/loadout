import { isAbsolute } from "node:path";
import {
  type MarketListing,
  type Skill,
  type SourceCandidate,
  type SourceChoice,
  type SourceEvidence,
  type SourceSearch,
  canLinkSource,
  normalizeSourceUrl,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, errorMessage, invalid } from "../errors";
import { type GitClient, marketSourceToUrl } from "../install";
import type { SkillStore } from "../skills/store";
import { mapLimit } from "../util/async";
import { fileDigests, hashDir } from "../util/hash";
import { createSerialQueue } from "../util/queue";
import { type ComparedLead, compareLead } from "./compare";
import { type SourceLead, gitFolderLead, linkLeads } from "./evidence";
import { lockFileLead } from "./lock";

export interface OriginDeps {
  store: SkillStore;
  git: GitClient;
  /** Marketplace search; absent where there is no marketplace (tests that do not need one). */
  searchMarket?: (query: string, limit?: number) => Promise<MarketListing>;
}

export interface OriginFinder {
  find(skillId: string): Promise<SourceSearch>;
  lookUp(skillId: string, input: string): Promise<SourceCandidate>;
  attach(skillId: string, choice: SourceChoice): Promise<Skill>;
  /**
   * After a skill was imported from `sourcePath`: link it to where it came from when this
   * machine says so (a Git checkout, a link in its document) and the repository holds exactly
   * the same files. Anything less is left for the user to look at. Never throws.
   */
  linkIfExact(skillId: string, sourcePath: string): Promise<Skill | null>;
}

/** Candidates are looked at a few at a time: each may clone a repository. */
const MAX_CONCURRENT_COMPARES = 3;
/** Marketplace listings of the same name looked at, most installed first. */
const MAX_MARKET_LEADS = 3;
const MARKET_SEARCH_LIMIT = 20;
/**
 * A marketplace listing only shares the name. Below this likeness it is another skill that
 * happens to be called the same, and showing it would only mislead.
 */
const MARKET_MIN_SIMILARITY = 0.5;
/** Stronger evidence first; a repository found twice keeps the stronger reason. */
const EVIDENCE_ORDER: readonly SourceEvidence[] = [
  "pasted",
  "skills_lock",
  "git_folder",
  "skill_link",
  "marketplace",
];
const HAS_SOURCE = "This skill already follows a source. Detach it first to link another one.";
const CHANGED_WHILE_LINKING = "The skill changed while it was being compared. Try again.";

function candidateKey(candidate: SourceCandidate): string {
  return `${normalizeSourceUrl(candidate.url)}\n${candidate.branch ?? ""}\n${candidate.subpath ?? ""}`;
}

function byBestMatch(a: SourceCandidate, b: SourceCandidate): number {
  return (
    Number(b.match === "identical") - Number(a.match === "identical") ||
    b.similarity - a.similarity ||
    EVIDENCE_ORDER.indexOf(a.evidence) - EVIDENCE_ORDER.indexOf(b.evidence)
  );
}

/** Where the skill was imported or installed from, when that is a folder on this machine. */
function importedFrom(skill: Skill): string | null {
  const ref = skill.sourceRef;
  return ref && isAbsolute(ref) ? ref : null;
}

export function createOriginFinder(ctx: CoreContext, deps: OriginDeps): OriginFinder {
  const { store, git } = deps;

  function requireLinkable(skillId: string): Skill {
    const skill = store.get(skillId);
    if (!canLinkSource(skill)) throw invalid(HAS_SOURCE);
    return skill;
  }

  /** What this machine itself says: the `npx skills` lock file, and the folder's own checkout. */
  function machineLeads(skill: Skill, sourcePath: string | null): SourceLead[] {
    const leads: SourceLead[] = [];
    const installed = lockFileLead(skill.name, ctx.homeDir, ctx.env);
    if (installed) leads.push(installed);
    const folder = sourcePath ? gitFolderLead(sourcePath, ctx.homeDir) : null;
    if (folder) leads.push(folder);
    return leads;
  }

  /** Those, then repositories the skill's own document links to. */
  function localLeads(skill: Skill, sourcePath: string | null): SourceLead[] {
    return [...machineLeads(skill, sourcePath), ...linkLeads(skill.libraryPath, skill.name)];
  }

  /**
   * Automatic linking after an import, one skill at a time: an "import all" must not start a
   * clone per skill at once. Settles whatever happened, never rejects.
   */
  const linking = createSerialQueue();

  async function marketLeads(skill: Skill): Promise<SourceLead[]> {
    if (!deps.searchMarket) return [];
    const listing = await deps.searchMarket(skill.name, MARKET_SEARCH_LIMIT);
    const name = skill.name.toLowerCase();
    return listing.skills
      .filter((entry) => entry.skillId.toLowerCase() === name || entry.name.toLowerCase() === name)
      .sort((a, b) => b.installs - a.installs)
      .slice(0, MAX_MARKET_LEADS)
      .map((entry) => ({
        input: marketSourceToUrl(entry.source),
        evidence: "marketplace",
        locator: entry.skillId,
        marketRef: entry.id,
      }));
  }

  /**
   * Link the skill to what `compared` saw, while the library copy is still what it compared.
   * The files stay as they are; what the source holds becomes the "as installed" snapshot, so
   * whatever differs counts as an edit that an update asks about before replacing.
   */
  async function link(skill: Skill, compared: ComparedLead, how: string): Promise<Skill> {
    const { candidate } = compared;
    const identical = candidate.match === "identical";
    const linked = await ctx.lock.run(`link ${skill.name}`, () => {
      const fresh = store.get(skill.id);
      if (!canLinkSource(fresh)) throw invalid(HAS_SOURCE);
      if (hashDir(fresh.libraryPath) !== compared.libraryHash) {
        throw new AppError("CHANGED_ON_DISK", CHANGED_WHILE_LINKING);
      }
      const updated = store.update(fresh.id, {
        sourceType: candidate.marketRef ? "marketplace" : "git",
        sourceRef: candidate.marketRef ?? candidate.url,
        sourceUrl: candidate.url,
        sourceBranch: candidate.marketRef ? null : candidate.branch,
        sourceSubpath: candidate.subpath,
        // Unknown when the files differ: the check then offers the update, and the update asks.
        sourceRevision: identical ? candidate.revision : null,
        remoteRevision: candidate.revision,
        updateStatus: identical ? "up_to_date" : "update_available",
        lastCheckedAt: Date.now(),
        lastCheckError: null,
        authored: false,
      });
      // Identical (perhaps but for line endings): the library copy is what came from the source.
      const snapshot = identical
        ? { hash: compared.libraryHash ?? "", files: fileDigests(fresh.libraryPath) }
        : compared.upstream;
      store.setInstalled(fresh.id, snapshot);
      return updated;
    });
    ctx.activity.record("update", linked.name, `Linked to ${candidate.label}${how}`);
    ctx.touched("skills");
    return linked;
  }

  async function find(skillId: string): Promise<SourceSearch> {
    const skill = requireLinkable(skillId);
    const failures: string[] = [];
    const leads = localLeads(skill, importedFrom(skill));
    try {
      leads.push(...(await marketLeads(skill)));
    } catch (error) {
      failures.push(`Marketplace: ${errorMessage(error)}`);
    }
    const compared = await mapLimit(leads, MAX_CONCURRENT_COMPARES, async (lead) => {
      try {
        return (await compareLead(git, skill, lead)).candidate;
      } catch (error) {
        failures.push(`${lead.input}: ${errorMessage(error)}`);
        return null;
      }
    });
    const seen = new Set<string>();
    const candidates = compared
      .filter((candidate): candidate is SourceCandidate => candidate !== null)
      .filter(
        (candidate) =>
          candidate.evidence !== "marketplace" ||
          candidate.match === "identical" ||
          candidate.similarity >= MARKET_MIN_SIMILARITY,
      )
      .sort(byBestMatch)
      .filter((candidate) => {
        const key = candidateKey(candidate);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return { skillId, candidates, failures };
  }

  /**
   * Only what this machine says is followed here; a link in a document usually points at docs or
   * a library, and following it means a clone. Those wait until the user asks (Find source).
   */
  async function linkByItself(skillId: string, sourcePath: string | null): Promise<Skill | null> {
    try {
      const skill = store.find(skillId);
      if (!skill || !canLinkSource(skill) || skill.authored) return null;
      for (const lead of machineLeads(skill, sourcePath)) {
        let compared: ComparedLead;
        try {
          compared = await compareLead(git, skill, lead);
        } catch {
          continue;
        }
        if (compared.candidate.match !== "identical") continue;
        return await link(skill, compared, " (found automatically)");
      }
    } catch (error) {
      ctx.log.warn(`Looking for the source of an imported skill failed`, error);
    }
    return null;
  }

  return {
    find,

    lookUp: async (skillId, input) => {
      const skill = requireLinkable(skillId);
      return (await compareLead(git, skill, { input, evidence: "pasted" })).candidate;
    },

    attach: async (skillId, choice) => {
      const skill = requireLinkable(skillId);
      const locator = choice.marketRef?.split("/").pop() ?? null;
      const compared = await compareLead(git, skill, {
        input: choice.url,
        evidence: choice.evidence,
        branch: choice.branch,
        subpath: choice.subpath,
        locator,
        marketRef: choice.marketRef,
      });
      return link(skill, compared, "");
    },

    linkIfExact: (skillId, sourcePath) => {
      return linking.run(() => linkByItself(skillId, sourcePath));
    },
  };
}
