import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffView } from "@/components/DiffView";
import { MarkdownView } from "@/components/MarkdownView";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DocumentTab = "local" | "diff" | "library";

export interface DocumentTabsProps {
  /** The copy on disk (agent folder, project, or upstream source). Undefined while loading. */
  local: string | null | undefined;
  /** The library copy. Undefined while loading. */
  library: string | null | undefined;
  /** Override the default "Local" / "Library" tab names, e.g. "Source". */
  localLabel?: string;
  libraryLabel?: string;
  defaultTab?: DocumentTab;
  /** Diff from local to library instead, for when the "library" side is the newer upstream text. */
  reverseDiff?: boolean;
  className?: string;
}

/** Two versions of a document side by side in tabs: Local, Diff (library → local) and Library. */
export function DocumentTabs({
  local,
  library,
  localLabel,
  libraryLabel,
  defaultTab = "local",
  reverseDiff,
  className,
}: DocumentTabsProps): ReactNode {
  const { t } = useTranslation();
  const [tab, setTab] = useState<DocumentTab>(defaultTab);
  const loading = local === undefined || library === undefined;

  const pane = (content: string | null | undefined): ReactNode => {
    if (content === undefined) return <Skeleton className="h-40 w-full" />;
    if (content === null)
      return (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("documents.missing")}</p>
      );
    return <MarkdownView content={content} />;
  };

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as DocumentTab)} className={className}>
      <TabsList>
        <TabsTrigger value="local">{localLabel ?? t("documents.local")}</TabsTrigger>
        <TabsTrigger value="diff">{t("documents.diff")}</TabsTrigger>
        <TabsTrigger value="library">{libraryLabel ?? t("documents.library")}</TabsTrigger>
      </TabsList>
      <TabsContent value="local">{pane(local)}</TabsContent>
      <TabsContent value="diff">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <DiffView
            before={(reverseDiff ? local : library) ?? ""}
            after={(reverseDiff ? library : local) ?? ""}
          />
        )}
      </TabsContent>
      <TabsContent value="library">{pane(library)}</TabsContent>
    </Tabs>
  );
}
