import {
  MARKETPLACE_NAME,
  type NewSourceSkill,
  type Skill,
  type SkillSource,
  type SkillSourceKind,
  formatRelative,
} from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import {
  CircleFadingArrowUp,
  Copy,
  FileArchive,
  GitBranch,
  Library,
  Link2,
  type LucideIcon,
  MoreHorizontal,
  PackageSearch,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

const KIND_ICONS: Record<SkillSourceKind, LucideIcon> = {
  repository: GitBranch,
  archive: FileArchive,
  link: Link2,
};

/** Skill names listed on a card before "and N more". */
const NAMES_SHOWN = 6;

export interface SourceCardProps {
  source: SkillSource;
  /** Its skills, in the order of `source.skillIds`. */
  skills: readonly Skill[];
  browsing: boolean;
  checking: boolean;
  onBrowse: () => void;
  onCheck: () => void;
  onUpdate: () => void;
  onShowInLibrary: () => void;
  onCopyLocation: () => void;
  onRemove: () => void;
  /** Skills the repository gained since they were last seen; empty when none. */
  newSkills: readonly NewSourceSkill[];
  /** Open the import list with the new skills ticked. */
  onAddNew: () => void;
  onDismissNew: () => void;
}

/** One source: what came from it, whether it has news, and what can be done with all of it. */
export function SourceCard({
  source,
  skills,
  browsing,
  checking,
  onBrowse,
  onCheck,
  onUpdate,
  onShowInLibrary,
  onCopyLocation,
  onRemove,
  newSkills,
  onAddNew,
  onDismissNew,
}: SourceCardProps): ReactNode {
  const { t } = useTranslation();
  const KindIcon = KIND_ICONS[source.kind];
  const shown = skills.slice(0, NAMES_SHOWN);
  const hidden = skills.length - shown.length;

  return (
    <article
      aria-label={source.label}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors duration-150 hover:border-primary/30"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
          <KindIcon />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold" title={source.label}>
              {source.label}
            </h3>
            {source.branch ? (
              <StatusBadge tone="neutral" icon={<GitBranch />} label={source.branch} />
            ) : null}
            {source.viaMarketplace ? <StatusBadge tone="kit" label={MARKETPLACE_NAME} /> : null}
          </div>
          <p
            className="truncate font-mono text-xs text-muted-foreground"
            title={source.location}
            data-selectable
          >
            {source.location}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("sources.more", { source: source.label })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onShowInLibrary}>
              <Library />
              {t("sources.showInLibrary")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCopyLocation}>
              <Copy />
              {t("sources.copyLocation")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 />
              {t("sources.remove", { count: skills.length })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("sources.skillCount", { count: skills.length })}</span>
        {source.updatesAvailable > 0 ? (
          <StatusBadge
            tone="info"
            icon={<CircleFadingArrowUp />}
            label={t("sources.updates", { count: source.updatesAvailable })}
          />
        ) : null}
        {newSkills.length > 0 ? (
          <StatusBadge
            tone="success"
            icon={<Sparkles />}
            label={t("sources.news.badge", { count: newSkills.length })}
          />
        ) : null}
        {source.problems > 0 ? (
          <StatusBadge
            tone="danger"
            icon={<TriangleAlert />}
            label={t("sources.problems", { count: source.problems })}
          />
        ) : null}
        <span>
          {source.lastCheckedAt
            ? t("sources.checked", { when: formatRelative(source.lastCheckedAt) })
            : t("sources.neverChecked")}
        </span>
      </div>

      <ul
        className="flex flex-wrap gap-1.5"
        aria-label={t("sources.skillsFrom", { source: source.label })}
      >
        {shown.map((skill) => (
          <li key={skill.id}>
            <Link
              to="/library"
              search={{ skill: skill.id }}
              className="inline-flex h-6 max-w-48 items-center truncate rounded-md border bg-background px-2 text-xs hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="truncate">{skill.name}</span>
            </Link>
          </li>
        ))}
        {hidden > 0 ? (
          <li className="inline-flex h-6 items-center px-1 text-xs text-muted-foreground">
            {t("sources.andMore", { count: hidden })}
          </li>
        ) : null}
      </ul>

      {newSkills.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-success/30 bg-success/5 p-3">
          <p className="text-xs">
            {t("sources.news.names", {
              count: newSkills.length,
              names: newSkills.map((skill) => skill.name).join(", "),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onAddNew} disabled={browsing}>
              {browsing ? <Spinner /> : <Sparkles />}
              {t("sources.news.add", { count: newSkills.length })}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismissNew}>
              {t("sources.news.dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onBrowse} disabled={browsing}>
          {browsing ? <Spinner /> : <PackageSearch />}
          {t("sources.browse")}
        </Button>
        {source.updatesAvailable > 0 ? (
          <Button size="sm" variant="outline" onClick={onUpdate}>
            <CircleFadingArrowUp />
            {t("sources.update", { count: source.updatesAvailable })}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onCheck} disabled={checking}>
          {checking ? <Spinner /> : <RefreshCw />}
          {t("sources.check")}
        </Button>
      </div>
    </article>
  );
}
