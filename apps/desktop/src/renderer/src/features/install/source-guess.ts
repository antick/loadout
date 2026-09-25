import type { GitPreview } from "@loadout/shared";
import {
  FileArchive,
  FileText,
  GitBranch,
  Globe,
  type LucideIcon,
  SquareTerminal,
} from "lucide-react";
import { ARCHIVE_LINK_PATTERN } from "@/features/install/constants";

/**
 * What typed text probably points at, before the backend has looked. Only picks an icon and
 * wording; the backend decides for real (a site without a skills index is tried as Git).
 */
export type SourceGuess = GitPreview["kind"];

export const SOURCE_KIND_ICONS: Record<SourceGuess, LucideIcon> = {
  repository: GitBranch,
  archive: FileArchive,
  file: FileText,
  site: Globe,
};

const SKILL_FILE_LINK = /^https?:\/\/[^?#\s]+\/skill\.md(?:[?#]\S*)?$/i;
/** Hosts whose links are repositories or pages of one, never a published file or a site. */
const REPOSITORY_HOST = /^https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com|huggingface\.co)\//i;
const WEB_ADDRESS = /^https?:\/\//i;
const GIT_SUFFIX = /\.git\/?$/i;

/** `npx skills add <source> …` and the other runners; the backend reads it for real. */
const SKILLS_COMMAND =
  /^(?:(?:npx|bunx|pnpx|pnpm\s+dlx|yarn\s+dlx)\s+(?:-y\s+)?)?skills(?:@\S+)?\s+(?:add|install|a|i)\s+(?:-\S+\s+)*["']?([^\s"']+)/i;

export const COMMAND_ICON: LucideIcon = SquareTerminal;

/** The source a pasted `skills add` command installs from, or null when it is not one. */
export function commandSource(text: string): string | null {
  return SKILLS_COMMAND.exec(text.trim())?.[1] ?? null;
}

export function guessSource(text: string): SourceGuess {
  const trimmed = commandSource(text) ?? text.trim();
  if (ARCHIVE_LINK_PATTERN.test(trimmed)) return "archive";
  if (REPOSITORY_HOST.test(trimmed)) return "repository";
  if (SKILL_FILE_LINK.test(trimmed)) return "file";
  if (WEB_ADDRESS.test(trimmed) && !GIT_SUFFIX.test(trimmed)) return "site";
  return "repository";
}

/** Host of a web address, for "Fetching example.com"; the text itself when it is not one. */
export function hostOf(text: string): string {
  const source = commandSource(text) ?? text.trim();
  try {
    return new URL(source).host || source;
  } catch {
    return source;
  }
}
