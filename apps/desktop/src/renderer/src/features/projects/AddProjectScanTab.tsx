import { CircleAlert, Radar } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderField } from "@/components/FolderField";
import { InlineNotice } from "@/components/InlineNotice";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useScanProjects } from "@/hooks/mutations/add-project";
import { errorMessage } from "@/lib/toast";
import type { AddProjectTabProps } from "./AddProjectFolderTab";
import {
  AddProjectsFooter,
  AddProjectsOutcome,
  ProjectPickList,
  useAddPickedProjects,
} from "./ProjectPickList";

const SCAN_ITEM_ID_PREFIX = "scan-project-";

/** Look under a root folder for projects that already hold agent skills, and link the chosen ones. */
export function AddProjectScanTab({ onCancel, onAdded }: AddProjectTabProps): ReactNode {
  const { t } = useTranslation();
  const scan = useScanProjects();
  const addPicked = useAddPickedProjects(onAdded);
  const [root, setRoot] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  const runScan = (event: FormEvent): void => {
    event.preventDefault();
    if (!root.trim()) return;
    addPicked.reset();
    scan.mutate(root.trim(), {
      onSuccess: (paths) => {
        setFound(paths);
        // Everything found starts ticked; unticking is the exception.
        setPicked(new Set(paths));
      },
    });
  };

  return (
    <>
      <form onSubmit={runScan} className="contents">
        <Field>
          <FieldLabel htmlFor="scan-root">{t("addProject.scan.label")}</FieldLabel>
          <FolderField
            id="scan-root"
            value={root}
            onChange={setRoot}
            placeholder={t("addProject.scan.placeholder")}
            pickerTitle={t("addProject.scan.pickerTitle")}
          />
          <FieldDescription>{t("addProject.scan.hint")}</FieldDescription>
        </Field>
        <Button
          type="submit"
          variant="outline"
          className="self-start"
          disabled={!root.trim() || scan.isPending}
        >
          {scan.isPending ? <Spinner /> : <Radar />}
          {t("addProject.scan.run")}
        </Button>
      </form>

      {scan.error ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          {errorMessage(scan.error, "addProject.errors.scan")}
        </InlineNotice>
      ) : null}

      {found !== null && found.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("addProject.scan.none")}</p>
      ) : null}

      {found !== null && found.length > 0 ? (
        <ProjectPickList
          items={found.map((path) => ({
            path,
            content: <PathText path={path} copy={false} reveal={false} />,
          }))}
          picked={picked}
          onPickedChange={setPicked}
          countLabel={t("addProject.scan.found", { count: found.length })}
          idPrefix={SCAN_ITEM_ID_PREFIX}
        />
      ) : null}

      <AddProjectsOutcome outcome={addPicked.outcome} error={addPicked.error} />

      <AddProjectsFooter
        outcome={addPicked.outcome}
        pickedCount={picked.size}
        pending={addPicked.pending}
        onSubmit={() => addPicked.add((found ?? []).filter((path) => picked.has(path)))}
        onCancel={onCancel}
        onAdded={onAdded}
      />
    </>
  );
}
