import { DEFAULT_PROJECT_AGENT_KEY, SKILLS_FILE_NAME, type SkillsFileInfo } from "@loadout/shared";
import { FileCode2, FolderOpen, MoreHorizontal, Play, RefreshCw, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useCreateSkillsFile } from "@/features/projects/skills-file-mutations";
import {
  type SkillsFileMode,
  useSkillsFile,
  useSkillsFileSuggestion,
} from "@/features/projects/skills-file-queries";
import { SkillsFilePlanDialog } from "@/features/projects/SkillsFilePlanDialog";
import { useRevealPath } from "@/hooks/mutations/app";
import { errorMessage } from "@/lib/toast";

/** Offer to write `skills.toml` from what the project holds, after showing what it would list. */
function CreateDialog({
  dir,
  open,
  onClose,
}: {
  dir: string;
  open: boolean;
  onClose: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const suggestion = useSkillsFileSuggestion(dir, open);
  const create = useCreateSkillsFile();
  const init = suggestion.data;
  const agents = init && init.agents.length > 0 ? init.agents : [DEFAULT_PROJECT_AGENT_KEY];
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !create.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("skillsFile.createTitle", { file: SKILLS_FILE_NAME })}</DialogTitle>
          <DialogDescription>{t("skillsFile.createDescription")}</DialogDescription>
        </DialogHeader>
        {suggestion.isError ? (
          <ErrorState error={suggestion.error} onRetry={() => void suggestion.refetch()} />
        ) : !init ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner />
            {t("skillsFile.looking")}
          </p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <span className="text-muted-foreground">{t("skillsFile.agents")}: </span>
              <span className="font-mono">{agents.join(", ")}</span>
            </p>
            {init.sources.length === 0 ? (
              <p className="text-muted-foreground">{t("skillsFile.noSources")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {init.sources.map((source) => (
                  <li key={source.url} className="rounded-md border bg-card px-3 py-2">
                    <p className="truncate font-mono text-xs">{source.url}</p>
                    <p className="text-xs text-muted-foreground">{source.skills?.join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!init || create.isPending}
            onClick={() =>
              init && create.mutate({ dir, init: { ...init, agents } }, { onSuccess: onClose })
            }
          >
            {create.isPending ? <Spinner /> : <FileCode2 />}
            {t("skillsFile.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Translate = ReturnType<typeof useTranslation>["t"];

function summary(info: SkillsFileInfo, t: Translate): string {
  const parts = [t("skillsFile.sourceCount", { count: info.spec.sources.length })];
  parts.push(
    info.lock
      ? t("skillsFile.appliedCount", { count: info.lock.folders.length })
      : t("skillsFile.notApplied"),
  );
  return parts.join(" · ");
}

/**
 * The project's `skills.toml`, as a strip under the header: apply it, move it to newer commits,
 * or take its skills out again. Without one, an offer to write it.
 */
export function SkillsFileSection({ dir }: { dir: string }): ReactNode {
  const { t } = useTranslation();
  const file = useSkillsFile(dir);
  const reveal = useRevealPath();
  const [mode, setMode] = useState<SkillsFileMode | null>(null);
  const [creating, setCreating] = useState(false);
  if (file.isPending) return null;
  // A file that cannot be read (a TOML syntax error, a missing key) says why, path included, so
  // the user can fix it and look again.
  if (file.error) {
    return (
      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-danger/40 px-3 py-2">
        <h2 className="font-mono text-xs font-medium text-muted-foreground">{SKILLS_FILE_NAME}</h2>
        <p role="alert" className="min-w-0 flex-1 text-xs break-words text-danger">
          {t("skillsFile.broken", { message: errorMessage(file.error) })}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={file.isFetching}
          onClick={() => void file.refetch()}
        >
          {file.isFetching ? <Spinner /> : <RefreshCw />}
          {t("common.retry")}
        </Button>
      </section>
    );
  }
  const info = file.data;
  // A skills file above the project folder belongs to a bigger project: not this page's to run.
  const own = info !== null && info.root === dir;

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed px-3 py-2">
      <h2 className="font-mono text-xs font-medium text-muted-foreground">{SKILLS_FILE_NAME}</h2>
      {own && info ? (
        <>
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {summary(info, t)}
          </p>
          <Button size="sm" variant="outline" onClick={() => setMode("apply")}>
            <Play />
            {t("skillsFile.apply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("update")}>
            <RefreshCw />
            {t("skillsFile.update")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("skillsFile.more")}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => reveal.mutate(info.path)}>
                <FolderOpen />
                {t("common.reveal")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!info.lock || info.lock.folders.length === 0}
                onSelect={() => setMode("unapply")}
              >
                <Trash2 />
                {t("skillsFile.unapply")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <>
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{t("skillsFile.offer")}</p>
          <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
            <FileCode2 />
            {t("skillsFile.createShort")}
          </Button>
        </>
      )}
      <SkillsFilePlanDialog dir={dir} mode={mode} onClose={() => setMode(null)} />
      <CreateDialog dir={dir} open={creating} onClose={() => setCreating(false)} />
    </section>
  );
}
