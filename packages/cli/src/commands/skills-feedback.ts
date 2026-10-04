import { invalid } from "@loadout/core";
import {
  FEEDBACK_HAPPENED_MAX,
  FEEDBACK_PROPOSAL_MAX,
  type FeedbackInputProblem,
  buildSkillFeedback,
  canReportSkill,
  feedbackInputProblem,
  repositoryLabel,
} from "@loadout/shared";
import { UsageError, flagString } from "../args";
import { limitPositionals, positional } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const MESSAGE_FLAG = {
  name: "message",
  short: "m",
  type: "string",
  value: "text",
  description: "What went wrong, in your words. Required.",
} as const;
const PROPOSAL_FLAG = {
  name: "proposal",
  type: "string",
  value: "text",
  description: "The change to SKILL.md that would have prevented it.",
} as const;

const PROBLEMS: Record<FeedbackInputProblem, string> = {
  empty: "Say what went wrong with -m.",
  happened_too_long: `-m is too long: at most ${FEEDBACK_HAPPENED_MAX} characters.`,
  proposal_too_long: `--proposal is too long: at most ${FEEDBACK_PROPOSAL_MAX} characters.`,
};

const HOST_NAMES = { github: "GitHub", gitlab: "GitLab" } as const;

/**
 * Prepare a report about a skill that went wrong, for the repository it came from. Nothing is
 * sent: the person opens the link (or pastes the text), reads it, and files it themselves.
 */
async function feedback({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 1);
  const skill = core.store.resolve(positional(args, 0, "a skill (id, name or folder name)"));
  const input = {
    happened: flagString(args, MESSAGE_FLAG.name) ?? "",
    proposal: flagString(args, PROPOSAL_FLAG.name),
  };
  const problem = feedbackInputProblem(input);
  if (problem) throw new UsageError(PROBLEMS[problem]);
  if (!canReportSkill(skill)) {
    throw invalid(
      `${skill.name} did not come from a Git repository, so there is nowhere to report it.`,
    );
  }

  const draft = buildSkillFeedback(skill, input);
  const value = { skill: skill.name, ...draft };
  const where = draft.target
    ? `${draft.target.repository} on ${HOST_NAMES[draft.target.host]}`
    : repositoryLabel(skill.sourceUrl ?? "");
  const lines = [
    `Report on ${skill.name} for ${where}. Nothing was sent.`,
    "",
    `Title: ${draft.title}`,
    "",
    draft.body.trimEnd(),
    "",
  ];
  if (!draft.url) {
    lines.push(
      `${where} has no issue page this tool can fill in. Copy the text above into its issue tracker.`,
    );
  } else if (draft.urlHasBody) {
    lines.push("Open this link to file it, after reading it over:", draft.url);
  } else {
    lines.push(
      "The report is too long for a link. Open this page, then paste the text above into it:",
      draft.url,
    );
  }
  return { value, text: lines.join("\n") };
}

export const feedbackCommand: CommandSpec = {
  name: "feedback",
  summary: "Prepare a report on a skill that went wrong, for the repository it came from",
  usage: "<ref> -m <text>",
  flags: [MESSAGE_FLAG, PROPOSAL_FLAG],
  notes: [
    "Prints the issue's title and text, and a link to the repository's new-issue page with them filled in (GitHub and GitLab). Nothing is sent and nothing is opened: read it, then follow the link yourself. Nothing from this computer, such as folder paths, is included.",
    "Only for skills installed from a Git repository.",
  ],
  run: feedback,
};
