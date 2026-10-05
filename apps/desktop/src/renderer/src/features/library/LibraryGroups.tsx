import type { Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight, FolderOpen, Send } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { BatchDeployDialog } from "@/components/BatchDeployDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { LibraryGroup } from "@/features/library/library-groups";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { SOURCE_KIND_ICONS } from "@/lib/source-icons";
import { cn } from "@/lib/utils";

const OPEN_STORAGE_KEY = "library.groups-open";

export interface LibraryGroupsProps {
  groups: readonly LibraryGroup[];
  /** Grid or list classes for the items of one group. */
  itemsClassName: string;
  renderItem: (skill: Skill) => ReactNode;
}

/**
 * The library by source: a collapsible section per repository, archive or link, with a deploy
 * action for the whole group, and the skills without a source last. Which sections are folded
 * is remembered.
 */
export function LibraryGroups({
  groups,
  itemsClassName,
  renderItem,
}: LibraryGroupsProps): ReactNode {
  const { t } = useTranslation();
  const [folded, setFolded] = usePersistedState<Partial<Record<string, boolean>>>(
    OPEN_STORAGE_KEY,
    {},
  );
  const [deploying, setDeploying] = useState<LibraryGroup | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => {
        const open = !folded[group.key];
        const Icon = group.source ? SOURCE_KIND_ICONS[group.source.kind] : FolderOpen;
        const label = group.source?.label ?? t("library.groups.noSource");
        return (
          <Collapsible
            key={group.key}
            open={open}
            onOpenChange={(next) => setFolded((previous) => ({ ...previous, [group.key]: !next }))}
            className="rounded-lg border bg-card/50"
            asChild
          >
            <section aria-label={label}>
              <div className="flex items-center gap-1 pr-2">
                <CollapsibleTrigger
                  aria-label={t("library.groups.toggle", { name: label })}
                  className="group/trigger flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none" />
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{label}</span>
                  {group.source?.branch ? (
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {group.source.branch}
                    </span>
                  ) : null}
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {t("library.groups.count", { count: group.skills.length })}
                  </span>
                </CollapsibleTrigger>
                {group.source ? (
                  <Link
                    to="/sources"
                    className={cn(buttonVariants({ variant: "ghost", size: "xs" }))}
                  >
                    {t("library.groups.showSource")}
                  </Link>
                ) : null}
                <Button variant="ghost" size="xs" onClick={() => setDeploying(group)}>
                  <Send />
                  {t("library.groups.deploy")}
                </Button>
              </div>
              <CollapsibleContent>
                <div className={cn(itemsClassName, "border-t p-3")}>
                  {group.skills.map(renderItem)}
                </div>
              </CollapsibleContent>
            </section>
          </Collapsible>
        );
      })}
      <BatchDeployDialog
        open={deploying !== null}
        onOpenChange={(open) => (open ? undefined : setDeploying(null))}
        skills={deploying?.skills ?? []}
      />
    </div>
  );
}
