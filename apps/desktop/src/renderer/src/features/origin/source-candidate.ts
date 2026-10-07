import type { SourceCandidate, SourceEvidence } from "@loadout/shared";
import type { StatusTone } from "@/components/StatusBadge";
import { PERCENT } from "@/lib/constants";

/** Changed files listed under a candidate before the rest are counted. */
export const CANDIDATE_FILES_SHOWN = 4;

/** Tone of the match chip: same files is safe to link, a changed copy needs a look. */
export function matchTone(candidate: Pick<SourceCandidate, "match">): StatusTone {
  if (candidate.match === "identical") return "success";
  return candidate.match === "similar" ? "warning" : "neutral";
}

/** i18n key and values of the match chip. */
export function matchLabel(
  candidate: Pick<SourceCandidate, "match" | "similarity" | "changedFiles">,
): {
  key: string;
  values: Record<string, number>;
} {
  if (candidate.match === "identical") return { key: "origin.match.identical", values: {} };
  if (candidate.match === "similar") {
    return {
      key: "origin.match.similar",
      values: { count: Math.max(candidate.changedFiles.length, 1) },
    };
  }
  return {
    key: "origin.match.different",
    values: { percent: Math.round(candidate.similarity * PERCENT) },
  };
}

export const evidenceKey = (evidence: SourceEvidence): string => `origin.evidence.${evidence}`;

/** The best candidate is worth linking without a second look only when its files are the same. */
export const isExact = (candidate: SourceCandidate | undefined): boolean =>
  candidate?.match === "identical";
