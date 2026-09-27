import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { nameOf, normalizePath, pathProblem } from "@/features/editor/file-tree";

/** What the dialog asks a path for. */
export type NameRequest =
  | { kind: "file"; folder: string }
  | { kind: "folder"; folder: string }
  | { kind: "rename"; path: string; folder: boolean };

export interface FileNameDialogProps {
  /** Null keeps the dialog closed. */
  request: NameRequest | null;
  /** Paths in use, lowercased (see `takenPaths`). */
  taken: ReadonlySet<string>;
  busy: boolean;
  onSubmit(path: string): void;
  onClose(): void;
}

function initialValue(request: NameRequest): string {
  if (request.kind === "rename") return request.path;
  return request.folder ? `${request.folder}/` : "";
}

/** The part of the path to select at first: the name, without a file's extension. */
function nameRange(request: NameRequest, value: string): [number, number] {
  if (request.kind !== "rename") return [value.length, value.length];
  const start = value.length - nameOf(value).length;
  const dot = request.folder ? -1 : value.lastIndexOf(".");
  return [start, dot > start ? dot : value.length];
}

/** The form lives in its own component so every opening starts from the request's own path. */
function FileNameForm({
  request,
  taken,
  busy,
  onSubmit,
  onClose,
}: FileNameDialogProps & { request: NameRequest }): ReactNode {
  const { t } = useTranslation();
  const inputId = useId();
  const [value, setValue] = useState(() => initialValue(request));
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus the path with the name selected, ready to type over. A frame later, so a right-click
  // menu that opened the dialog has let go of the focus by then.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(...nameRange(request, input.value));
    });
    return () => cancelAnimationFrame(frame);
  }, [request]);
  const path = normalizePath(value);
  const current = request.kind === "rename" ? request.path : undefined;
  const unchanged = path === current;
  const problem = path && !unchanged ? pathProblem(path, taken, current) : null;
  const ready = Boolean(path) && !unchanged && !problem && !busy;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (ready) onSubmit(path);
  };

  const title =
    request.kind === "rename"
      ? t("editor.manage.dialog.renameTitle", { name: nameOf(request.path) })
      : t(`editor.manage.dialog.${request.kind}Title`);

  return (
    <form onSubmit={submit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{t("editor.manage.dialog.description")}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={Boolean(problem) || undefined}>
        <FieldLabel htmlFor={inputId}>{t("editor.manage.dialog.label")}</FieldLabel>
        <Input
          ref={inputRef}
          id={inputId}
          value={value}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-sm"
          onChange={(event) => setValue(event.target.value)}
        />
        {problem ? (
          <FieldError>{t(`editor.manage.dialog.problem.${problem}`)}</FieldError>
        ) : (
          <FieldDescription>{t("editor.manage.dialog.hint")}</FieldDescription>
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!ready}>
          {busy ? <Spinner /> : null}
          {t(
            request.kind === "rename"
              ? "editor.manage.dialog.rename"
              : "editor.manage.dialog.create",
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Asks for the path of a new file or folder, or the new path of one being renamed. */
export function FileNameDialog(props: FileNameDialogProps): ReactNode {
  const { request, onClose } = props;
  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        className="sm:max-w-md"
        // The form focuses its path itself, with the name selected.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {request ? <FileNameForm {...props} request={request} /> : null}
      </DialogContent>
    </Dialog>
  );
}
