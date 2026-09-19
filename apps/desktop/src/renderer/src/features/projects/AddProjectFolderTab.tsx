import type { Project } from "@skillboard/shared";
import { CircleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderField } from "@/components/FolderField";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useAddProject } from "@/hooks/mutations/add-project";
import { errorMessage } from "@/lib/toast";

export interface AddProjectTabProps {
  onCancel: () => void;
  /** Called with every workspace that was linked; the first one is opened. `summary` replaces the default toast text. */
  onAdded: (projects: Project[], summary?: string) => void;
}

/** Link one project folder: pick it (or paste its path) and add it. */
export function AddProjectFolderTab({ onCancel, onAdded }: AddProjectTabProps): ReactNode {
  const { t } = useTranslation();
  const addProject = useAddProject();
  const [path, setPath] = useState("");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!path.trim()) return;
    addProject.mutate(path.trim(), { onSuccess: (project) => onAdded([project]) });
  };

  return (
    <form onSubmit={submit} className="contents">
      <Field>
        <FieldLabel htmlFor="add-project-folder">{t("addProject.folder.label")}</FieldLabel>
        <FolderField
          id="add-project-folder"
          value={path}
          onChange={(next) => {
            setPath(next);
            addProject.reset();
          }}
          placeholder={t("addProject.folder.placeholder")}
          pickerTitle={t("addProject.folder.pickerTitle")}
        />
        <FieldDescription>{t("addProject.folder.hint")}</FieldDescription>
      </Field>
      {addProject.error ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          {errorMessage(addProject.error, "addProject.errors.add")}
        </InlineNotice>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!path.trim() || addProject.isPending}>
          {addProject.isPending ? <Spinner /> : null}
          {t("addProject.folder.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
