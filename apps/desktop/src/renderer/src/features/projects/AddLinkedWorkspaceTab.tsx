import { CircleAlert } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderField } from "@/components/FolderField";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useAddLinkedWorkspace } from "@/hooks/mutations/add-project";
import { errorMessage } from "@/lib/toast";
import type { AddProjectTabProps } from "./AddProjectFolderTab";

/** Link a standalone skills folder as a workspace of its own, outside any project layout. */
export function AddLinkedWorkspaceTab({ onCancel, onAdded }: AddProjectTabProps): ReactNode {
  const { t } = useTranslation();
  const addLinked = useAddLinkedWorkspace();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [disabledPath, setDisabledPath] = useState("");
  const ready = name.trim().length > 0 && path.trim().length > 0;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready) return;
    addLinked.mutate(
      { name: name.trim(), path: path.trim(), disabledPath: disabledPath.trim() || null },
      { onSuccess: (project) => onAdded([project]) },
    );
  };

  return (
    <form onSubmit={submit} className="contents">
      <p className="text-sm text-muted-foreground">{t("addProject.linked.intro")}</p>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="linked-name">{t("addProject.linked.name")}</FieldLabel>
          <Input
            id="linked-name"
            value={name}
            required
            placeholder={t("addProject.linked.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="linked-path">{t("addProject.linked.path")}</FieldLabel>
          <FolderField
            id="linked-path"
            value={path}
            onChange={setPath}
            placeholder={t("addProject.linked.pathPlaceholder")}
            pickerTitle={t("addProject.linked.path")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="linked-disabled-path">
            {t("addProject.linked.disabledPath")}
          </FieldLabel>
          <FolderField
            id="linked-disabled-path"
            value={disabledPath}
            onChange={setDisabledPath}
            placeholder={t("addProject.linked.disabledPlaceholder")}
            pickerTitle={t("addProject.linked.disabledPath")}
          />
          <FieldDescription>{t("addProject.linked.disabledHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      {addLinked.error ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          {errorMessage(addLinked.error, "addProject.errors.add")}
        </InlineNotice>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!ready || addLinked.isPending}>
          {addLinked.isPending ? <Spinner /> : null}
          {t("addProject.linked.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
