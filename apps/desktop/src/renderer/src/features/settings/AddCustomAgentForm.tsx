import { FolderOpen, Plus } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { WslFolderNote } from "@/components/WslFolderNote";
import { useAddCustomAgent, usePickFolder } from "@/hooks/mutations/settings-page";
import { errorMessage } from "@/lib/toast";

/** Add an agent the app does not know: a name, its skills folder, optionally a project folder. */
export function AddCustomAgentForm(): ReactNode {
  const { t } = useTranslation();
  const nameId = useId();
  const dirId = useId();
  const projectId = useId();
  const [name, setName] = useState("");
  const [skillsDir, setSkillsDir] = useState("");
  const [projectDir, setProjectDir] = useState("");
  const add = useAddCustomAgent();
  const pickFolder = usePickFolder();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    add.mutate(
      {
        displayName: name.trim(),
        skillsDir: skillsDir.trim(),
        projectSkillsDir: projectDir.trim() || null,
      },
      {
        onSuccess: () => {
          setName("");
          setSkillsDir("");
          setProjectDir("");
        },
      },
    );
  };

  return (
    <Panel
      title={t("settings.agents.custom.title")}
      description={t("settings.agents.custom.description")}
    >
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={nameId}>{t("settings.agents.custom.name")}</FieldLabel>
          <Input
            id={nameId}
            value={name}
            placeholder={t("settings.agents.custom.namePlaceholder")}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={dirId}>{t("settings.agents.custom.skillsDir")}</FieldLabel>
          <div className="flex gap-1">
            <Input
              id={dirId}
              value={skillsDir}
              spellCheck={false}
              placeholder={t("settings.agents.custom.skillsDirPlaceholder")}
              className="font-mono text-sm"
              onChange={(event) => setSkillsDir(event.target.value)}
            />
            <IconButton
              variant="outline"
              size="icon"
              label={t("settings.agents.browse")}
              icon={<FolderOpen />}
              onClick={() =>
                pickFolder.mutate(t("settings.agents.custom.skillsDir"), {
                  onSuccess: (picked) => {
                    if (picked) setSkillsDir(picked);
                  },
                })
              }
            />
          </div>
          <WslFolderNote path={skillsDir} hint />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor={projectId}>{t("settings.agents.custom.projectDir")}</FieldLabel>
          <Input
            id={projectId}
            value={projectDir}
            spellCheck={false}
            placeholder={t("settings.agents.custom.projectDirPlaceholder")}
            className="max-w-md font-mono text-sm"
            onChange={(event) => setProjectDir(event.target.value)}
          />
          <FieldDescription>{t("settings.agents.custom.projectDirHint")}</FieldDescription>
        </Field>
        {add.isError ? (
          <p role="alert" data-selectable className="text-sm text-danger md:col-span-2">
            {errorMessage(add.error)}
          </p>
        ) : null}
        <div className="md:col-span-2">
          <Button
            type="submit"
            size="sm"
            disabled={!name.trim() || !skillsDir.trim() || add.isPending}
          >
            {add.isPending ? <Spinner /> : <Plus />}
            {t("settings.agents.custom.add")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
