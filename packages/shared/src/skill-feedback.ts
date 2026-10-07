import { formatRevision } from "./format";
import { normalizeSourceUrl } from "./sources";
import type { Skill } from "./types";

/**
 * A report about a skill that went wrong, for the people who keep its source repository: what
 * happened, and optionally what `SKILL.md` should say instead. Loadout only prepares it. The
 * person reads it, then opens the repository's new-issue page with it filled in, or copies it;
 * nothing is sent from here, and nothing about this computer (paths, user name) goes in.
 */

export const FEEDBACK_HAPPENED_MAX = 4000;
export const FEEDBACK_PROPOSAL_MAX = 6000;
export const FEEDBACK_TITLE_MAX = 100;
/**
 * Longest new-issue address we build. Browsers and the sites take about 8,000 characters; past
 * this the page opens with a note, and the report is pasted in: the app copies it to the
 * clipboard, the CLI prints it.
 */
export const FEEDBACK_URL_MAX = 6000;

export type FeedbackHost = "github" | "gitlab";

/** The public sites whose new-issue page we know how to fill in. */
const HOSTS: Readonly<Record<string, FeedbackHost>> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
};

/** One path part of a repository name: what these sites allow, and nothing that could bend a link. */
const NAME_PART = /^(?!\.+$)[A-Za-z0-9_.-]+$/;

export interface SkillFeedbackInput {
  /** What went wrong, in the reporter's words. Required. */
  happened: string;
  /** The change to `SKILL.md` that would have prevented it. */
  proposal?: string;
}

/** Why a report cannot be made yet; null when it can. */
export type FeedbackInputProblem = "empty" | "happened_too_long" | "proposal_too_long";

export interface SkillFeedbackTarget {
  host: FeedbackHost;
  /** `owner/repo` (GitLab: the full group path). */
  repository: string;
}

export interface SkillFeedbackOptions {
  /** The app's version, for the maintainer. Left out when not given. */
  loadoutVersion?: string;
}

export interface SkillFeedbackDraft {
  title: string;
  /** Markdown, ready to paste. */
  body: string;
  /** Where the issue would go; null when the source is not on a site we know. */
  target: SkillFeedbackTarget | null;
  /** The repository's new-issue page with the report filled in; null without a target. */
  url: string | null;
  /**
   * The whole body is in `url`. False when it was too long: `url` then has the title and a note
   * to paste the report, and the caller should copy `body` first.
   */
  urlHasBody: boolean;
}

/** Whether a skill has a source repository a report can go back to (even one we cannot open). */
export function canReportSkill(skill: Pick<Skill, "sourceType" | "sourceUrl">): boolean {
  return (skill.sourceType === "git" || skill.sourceType === "marketplace") && !!skill.sourceUrl;
}

/** The public issue tracker of a skill's repository; null for any other host or shape of address. */
function feedbackTarget(
  skill: Pick<Skill, "sourceType" | "sourceUrl">,
): SkillFeedbackTarget | null {
  if (!canReportSkill(skill) || !skill.sourceUrl) return null;
  // Anything the address parser would cut short could point at another repository.
  if (/[\s?#]/.test(skill.sourceUrl.trim())) return null;
  const [host = "", ...parts] = normalizeSourceUrl(skill.sourceUrl).split("/");
  const site = HOSTS[host];
  if (!site || parts.length < 2 || !parts.every((part) => NAME_PART.test(part))) return null;
  // GitHub repositories are exactly owner/repo; GitLab ones may sit in nested groups.
  if (site === "github" && parts.length !== 2) return null;
  return { host: site, repository: parts.join("/") };
}

export function feedbackInputProblem(input: SkillFeedbackInput): FeedbackInputProblem | null {
  if (!input.happened.trim()) return "empty";
  if (input.happened.length > FEEDBACK_HAPPENED_MAX) return "happened_too_long";
  if ((input.proposal ?? "").length > FEEDBACK_PROPOSAL_MAX) return "proposal_too_long";
  return null;
}

/** A value inside a Markdown code span: one line, no backticks. */
const codeSpan = (value: string): string => `\`${value.replace(/[`\r\n]+/g, " ").trim()}\``;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

/** `Skill name: first line of what happened`, short enough for an issue title. */
function feedbackTitle(skillName: string, happened: string): string {
  const first =
    happened
      .split(/\r?\n/)
      .find((line) => line.trim())
      ?.trim() ?? "";
  return clip(first ? `${skillName}: ${first}` : skillName, FEEDBACK_TITLE_MAX);
}

function contextLines(skill: Skill, options: SkillFeedbackOptions): string[] {
  const lines = [`- Skill: ${codeSpan(skill.name)}`];
  const where: string[] = [];
  if (skill.sourceSubpath) where.push(`folder ${codeSpan(skill.sourceSubpath)}`);
  if (skill.sourceBranch) where.push(`branch ${codeSpan(skill.sourceBranch)}`);
  if (where.length > 0) lines.push(`- Where in the repository: ${where.join(", ")}`);
  if (skill.sourceRevision) {
    lines.push(`- Installed revision: ${codeSpan(formatRevision(skill.sourceRevision))}`);
  }
  if (skill.editedFiles.length > 0) {
    lines.push(
      `- Edited on the reporter's computer: ${skill.editedFiles.length} file${skill.editedFiles.length === 1 ? "" : "s"}, so this may not be the published text`,
    );
  }
  if (options.loadoutVersion) lines.push(`- Reported from Loadout ${options.loadoutVersion}`);
  return lines;
}

/** The report as Markdown. */
export function feedbackBody(
  skill: Skill,
  input: SkillFeedbackInput,
  options: SkillFeedbackOptions = {},
): string {
  const proposal = (input.proposal ?? "").trim();
  return [
    "### What happened",
    "",
    input.happened.trim(),
    ...(proposal ? ["", "### Proposed change to SKILL.md", "", proposal] : []),
    "",
    "### Context",
    "",
    ...contextLines(skill, options),
    "",
  ].join("\n");
}

/** True whether the app copied the report or the CLI printed it. */
const PASTE_NOTE = "The report is too long for this link. Paste it here.";

/** The new-issue page of `target`, with `title` and `body` filled in. */
function newIssueUrl(target: SkillFeedbackTarget, title: string, body: string): string {
  const query = (titleKey: string, bodyKey: string): string =>
    `${encodeURIComponent(titleKey)}=${encodeURIComponent(title)}&${encodeURIComponent(bodyKey)}=${encodeURIComponent(body)}`;
  return target.host === "github"
    ? `https://github.com/${target.repository}/issues/new?${query("title", "body")}`
    : `https://gitlab.com/${target.repository}/-/issues/new?${query("issue[title]", "issue[description]")}`;
}

/** Everything needed to send the report: its text, where it goes, and the link that fills it in. */
export function buildSkillFeedback(
  skill: Skill,
  input: SkillFeedbackInput,
  options: SkillFeedbackOptions = {},
): SkillFeedbackDraft {
  const title = feedbackTitle(skill.name, input.happened);
  const body = feedbackBody(skill, input, options);
  const target = feedbackTarget(skill);
  if (!target) return { title, body, target: null, url: null, urlHasBody: false };
  const full = newIssueUrl(target, title, body);
  if (full.length <= FEEDBACK_URL_MAX) return { title, body, target, url: full, urlHasBody: true };
  return { title, body, target, url: newIssueUrl(target, title, PASTE_NOTE), urlHasBody: false };
}
