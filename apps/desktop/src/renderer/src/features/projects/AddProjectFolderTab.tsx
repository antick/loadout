import type { Project } from "@loadout/shared";
import { CircleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderField } from "@/components/FolderField";
import { InlineNotice } from "@/components/InlineNotice";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useAddProject, useScanProjects } from "@/features/projects/project-mutations";
import { errorMessage } from "@/lib/toast";
import {
  AddProjectsFooter,
  AddProjectsOutcome,
  ProjectPickList,
  useAddPickedProjects,
} from "./ProjectPickList";

export interface AddProjectTabProps {
  onCancel: () => void;
  /** Called with every workspace that was linked; the first one is opened. `summary` replaces the default toast text. */
  onAdded: (projects: Project[], summary?: string) => void;
}

const FOUND_ITEM_ID_PREFIX = "found-project-";

/**
 * Pick a folder: one that holds agent skills is linked as it is; otherwise the projects under it
 * are listed to tick. With none under it either, it can still be linked as a new project.
 */
export function AddProjectFolderTab({ onCancel, onAdded }: AddProjectTabProps): ReactNode {
  const { t } = useTranslation();
  const scan = useScanProjects();
  const addProject = useAddProject();
  const addPicked = useAddPickedProjects(onAdded);
  const [path, setPath] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const folder = path.trim();
  const pending = scan.isPending || addProject.isPending;

  const link = (): void =>
    addProject.mutate(folder, { onSuccess: (project) => onAdded([project]) });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!folder) return;
    if (found?.length === 0) return link();
    scan.mutate(folder, {
      onSuccess: (paths) => {
        // The scan stops at a folder that holds agent skills: the one picked is the project.
        if (paths.length === 1 && paths[0] === folder) return link();
        setFound(paths);
        // Everything found starts ticked; unticking is the exception.
        setPicked(new Set(paths));
      },
    });
  };

  const error = scan.error ?? addProject.error;

  return (
    <form onSubmit={submit} className="contents">
      <Field>
        <FieldLabel htmlFor="add-project-folder">{t("addProject.folder.label")}</FieldLabel>
        <FolderField
          id="add-project-folder"
          value={path}
          onChange={(next) => {
            setPath(next);
            setFound(null);
            scan.reset();
            addProject.reset();
            addPicked.reset();
          }}
          placeholder={t("addProject.folder.placeholder")}
          pickerTitle={t("addProject.folder.pickerTitle")}
        />
        <FieldDescription>{t("addProject.folder.hint")}</FieldDescription>
      </Field>

      {error ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          {errorMessage(error, scan.error ? "addProject.errors.scan" : "addProject.errors.add")}
        </InlineNotice>
      ) : null}

      {found?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("addProject.folder.none")}</p>
      ) : null}

      {found && found.length > 0 ? (
        <>
          <ProjectPickList
            items={found.map((entry) => ({
              path: entry,
              content: <PathText path={entry} copy={false} reveal={false} />,
            }))}
            picked={picked}
            onPickedChange={setPicked}
            countLabel={t("addProject.scan.found", { count: found.length })}
            idPrefix={FOUND_ITEM_ID_PREFIX}
          />
          <AddProjectsOutcome outcome={addPicked.outcome} error={addPicked.error} />
          <AddProjectsFooter
            outcome={addPicked.outcome}
            pickedCount={picked.size}
            pending={addPicked.pending}
            onSubmit={() => addPicked.add(found.filter((entry) => picked.has(entry)))}
            onCancel={onCancel}
            onAdded={onAdded}
          />
        </>
      ) : (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!folder || pending}>
            {pending ? <Spinner /> : null}
            {t(found?.length === 0 ? "addProject.folder.linkAnyway" : "addProject.folder.submit")}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}
