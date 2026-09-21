import type { SkillDocument } from "@loadout/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DocumentTabs, type DocumentTab } from "@/components/DocumentTabs";
import { ErrorState } from "@/components/ErrorState";
import { MarkdownView } from "@/components/MarkdownView";
import { PathText } from "@/components/PathText";
import { SkillTags } from "@/components/SkillTags";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkillDocument } from "@/hooks/queries/skills";
import { useLastDefined } from "@/hooks/use-last-defined";
import type { LocalSkillView } from "./local-skill-view";
import { LocalSkillMeta } from "./LocalSkillMeta";

export interface LocalSkillDetailSheetProps {
  /** The entry to show; null closes the sheet. */
  item: LocalSkillView | null;
  onClose: () => void;
  /** Absolute folder of the copy on screen. */
  path?: string;
  /** The local document, loaded by the page (agent folder and project use different calls). */
  document: Pick<UseQueryResult<SkillDocument>, "data" | "error" | "isPending" | "refetch">;
  /** Name of the local tab, e.g. "Project". */
  localLabel?: string;
  badges?: ReactNode;
  /** Buttons under the header: the same actions the card offers. */
  actions?: ReactNode;
  /** Extra sections between the header and the files, e.g. per-agent switches. */
  children?: ReactNode;
}

const SECTION_LABEL_CLASS = "text-xs font-medium tracking-wider text-muted-foreground uppercase";

/** Which tab to land on: the difference when there is one to look at, else the local copy. */
function defaultTab(item: LocalSkillView): DocumentTab {
  return item.syncStatus === "in_sync" ? "local" : "diff";
}

/**
 * Side sheet for one skill on disk: status, folder, files and its document. When the skill is
 * linked to a library skill the document is shown as Local / Diff / Library tabs.
 */
export function LocalSkillDetailSheet({
  item: openItem,
  onClose,
  path,
  document,
  localLabel,
  badges,
  actions,
  children,
}: LocalSkillDetailSheetProps): ReactNode {
  const { t } = useTranslation();
  // Keep drawing the last entry while the sheet slides out, instead of collapsing to nothing.
  const item = useLastDefined(openItem);
  const libraryDocument = useSkillDocument(item?.librarySkillId);
  const files = document.data?.files ?? [];
  // A library document that fails to load reads as "missing" rather than blocking the local one.
  const libraryContent = libraryDocument.isError ? null : libraryDocument.data?.content;

  return (
    <Sheet open={openItem !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="flex w-full flex-col gap-0 sm:max-w-2xl"
        // Focus the sheet itself, not its first button, whose tooltip would pop open unasked.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
      >
        {item ? (
          <>
            <SheetHeader className="gap-2 border-b">
              <SheetTitle className="truncate pr-8">{item.name}</SheetTitle>
              <SheetDescription className="line-clamp-3">
                {item.description ?? t("skills.noDescription")}
              </SheetDescription>
              <LocalSkillMeta item={item} badges={badges} />
              {path ? <PathText path={path} /> : null}
              <SkillTags tags={item.tags} max={8} />
              {actions ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>
              ) : null}
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
              {children}

              <section className="flex flex-col gap-2">
                <h3 className={SECTION_LABEL_CLASS}>{t("localSkills.detail.files")}</h3>
                {document.isPending ? (
                  <Skeleton className="h-5 w-48" />
                ) : files.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("localSkills.detail.noFiles")}</p>
                ) : (
                  <ul data-selectable className="flex flex-wrap gap-1.5">
                    {files.map((file) => (
                      <li
                        key={file}
                        className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                      >
                        {file}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <h3 className={SECTION_LABEL_CLASS}>
                  {document.data?.filename ?? t("localSkills.detail.document")}
                </h3>
                {document.error ? (
                  <ErrorState error={document.error} onRetry={() => void document.refetch()} />
                ) : item.librarySkillId ? (
                  <DocumentTabs
                    // A different skill starts on its own default tab.
                    key={item.id}
                    local={document.isPending ? undefined : (document.data?.content ?? null)}
                    library={libraryContent}
                    localLabel={localLabel}
                    defaultTab={defaultTab(item)}
                  />
                ) : document.isPending ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {t("localSkills.detail.notInLibrary")}
                    </p>
                    <MarkdownView content={document.data?.content ?? ""} />
                  </>
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
