/** Short product copy shared by the feature and safety sections. */
export const FEATURES = [
  {
    key: "collect",
    title: "Collect your skills",
    body: "From Git, folders, or skills.sh. One library for everything you use.",
  },
  {
    key: "share",
    title: "Share across agents",
    body: "Update once. Every linked agent stays in sync.",
  },
  {
    key: "presets",
    title: "Switch your setup",
    body: "Apply a set of skills to an agent or project in one click.",
  },
] as const;

export const PREVIEW_SKILLS = ["writing-guidelines", "web-design-guidelines", "vercel-optimize"];
export const PREVIEW_PRESETS = ["Frontend", "Code review"];

export const EXTRA_FEATURES = [
  {
    title: "A built-in editor",
    body: "Edit skills and agent instructions beside a live preview. Unsaved drafts and file history stay with you.",
  },
  {
    title: "Updates you control",
    body: "Check for new skill versions, review changes, and protect your local edits before updating.",
  },
  {
    title: "Backup and sync",
    body: "Back up your library to a Git repository you choose and keep your computers in step.",
  },
  {
    title: "A command-line companion",
    body: "Install, enable, and update skills from your terminal, or let your agent do it for you.",
  },
] as const;

export const GUARANTEES = [
  {
    icon: "laptop",
    title: "Stored on your computer",
    body: "Your skills live in your files. Back them up to a Git remote you choose.",
  },
  {
    icon: "lock",
    title: "Edits stay protected",
    body: "Review conflicting edits and file removals before changes are applied.",
  },
  {
    icon: "code",
    title: "Open source",
    body: "Built in the open. Free to use, inspect, and make your own under GPL-3.0.",
  },
] as const;
