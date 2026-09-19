import { CircleAlert, CircleCheck, Radar } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderField } from "@/components/FolderField";
import { InlineNotice } from "@/components/InlineNotice";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  type AddScannedResult,
  useAddScannedProjects,
  useScanProjects,
} from "@/hooks/mutations/add-project";
import { errorMessage } from "@/lib/toast";
import type { AddProjectTabProps } from "./AddProjectFolderTab";

const SCAN_ITEM_ID_PREFIX = "scan-project-";

/** Look under a root folder for projects that already hold agent skills, and link the chosen ones. */
export function AddProjectScanTab({ onCancel, onAdded }: AddProjectTabProps): ReactNode {
  const { t } = useTranslation();
  const scan = useScanProjects();
  const addMany = useAddScannedProjects();
  const [root, setRoot] = useState("");
  const [found, setFound] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [outcome, setOutcome] = useState<AddScannedResult | null>(null);

  const summarize = (result: AddScannedResult): string =>
    [
      t("addProject.scan.added", { count: result.added.length }),
      t("addProject.scan.alreadyLinked", { count: result.alreadyLinked }),
      t("addProject.scan.failed", { count: result.failed.length }),
    ].join(" · ");

  const runScan = (event: FormEvent): void => {
    event.preventDefault();
    if (!root.trim()) return;
    setOutcome(null);
    scan.mutate(root.trim(), {
      onSuccess: (paths) => {
        setFound(paths);
        // Everything found starts ticked; unticking is the exception.
        setPicked(new Set(paths));
      },
    });
  };

  const toggle = (path: string): void =>
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const addPicked = (): void => {
    const paths = (found ?? []).filter((path) => picked.has(path));
    addMany.mutate(paths, {
      onSuccess: (result) => {
        setOutcome(result);
        // With nothing left to fix the dialog can go; otherwise stay and show what went wrong.
        if (result.failed.length === 0 && result.added.length > 0) {
          onAdded(result.added, summarize(result));
        }
      },
    });
  };

  const allPicked = found !== null && found.length > 0 && picked.size === found.length;

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
        <div className="flex min-h-0 flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("addProject.scan.found", { count: found.length })}</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setPicked(allPicked ? new Set() : new Set(found))}
            >
              {allPicked ? t("selection.selectNone") : t("selection.selectAll")}
            </Button>
          </div>
          <ul className="max-h-56 overflow-y-auto rounded-lg border">
            {found.map((path, index) => {
              const id = `${SCAN_ITEM_ID_PREFIX}${index}`;
              return (
                <li key={path} className="border-b last:border-b-0">
                  <Label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-1.5 font-normal hover:bg-accent/40"
                  >
                    <Checkbox
                      id={id}
                      checked={picked.has(path)}
                      onCheckedChange={() => toggle(path)}
                    />
                    <PathText path={path} copy={false} reveal={false} className="flex-1" />
                  </Label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {addMany.error ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          {errorMessage(addMany.error, "addProject.errors.add")}
        </InlineNotice>
      ) : null}

      {outcome ? (
        <InlineNotice
          tone={outcome.failed.length > 0 ? "warning" : "success"}
          icon={outcome.failed.length > 0 ? CircleAlert : CircleCheck}
        >
          <p>{summarize(outcome)}</p>
          {outcome.failed.length > 0 ? (
            <ul data-selectable className="mt-1 flex flex-col gap-0.5 text-xs break-all">
              {outcome.failed.map((failure) => (
                <li key={failure.name}>
                  <span className="font-mono">{failure.name}</span>: {failure.message}
                </li>
              ))}
            </ul>
          ) : null}
        </InlineNotice>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          // After a partly failed run, closing still opens what did get linked.
          onClick={() =>
            outcome && outcome.added.length > 0 ? onAdded(outcome.added) : onCancel()
          }
        >
          {t(outcome ? "addProject.close" : "common.cancel")}
        </Button>
        <Button type="button" disabled={picked.size === 0 || addMany.isPending} onClick={addPicked}>
          {addMany.isPending ? <Spinner /> : null}
          {t("addProject.scan.submit", { count: picked.size })}
        </Button>
      </DialogFooter>
    </>
  );
}
