import { type ItemKind, ITEM_NAME_MAX, itemNameProblem } from "@loadout/shared";
import { type FormEvent, type ReactNode, useId, useState } from "react";
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
import { useCreateItem } from "@/features/items/item-mutations";

export interface NewItemDialogProps {
  kind: ItemKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Names already used by this kind. */
  taken: readonly string[];
  onCreated: (name: string) => void;
}

function NewItemForm({
  kind,
  onOpenChange,
  taken,
  onCreated,
}: Omit<NewItemDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const id = useId();
  const create = useCreateItem();
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const problem = taken.includes(trimmed) ? "taken" : itemNameProblem(trimmed);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (problem || create.isPending) return;
    create.mutate(
      { kind, name: trimmed },
      {
        onSuccess: () => {
          onOpenChange(false);
          onCreated(trimmed);
        },
      },
    );
  };

  const kindLabel = t(`items.kinds.${kind}.one`).toLowerCase();
  return (
    <form onSubmit={submit} className="contents" noValidate>
      <DialogHeader>
        <DialogTitle>{t("items.create.title", { kind: kindLabel })}</DialogTitle>
        <DialogDescription>{t("items.create.description")}</DialogDescription>
      </DialogHeader>
      <Field data-invalid={Boolean(problem && problem !== "empty") || undefined}>
        <FieldLabel htmlFor={id}>{t("items.create.name")}</FieldLabel>
        <Input
          id={id}
          value={name}
          onChange={(event) => setName(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          maxLength={ITEM_NAME_MAX * 2}
          className="font-mono"
        />
        {problem && problem !== "empty" ? (
          <FieldError>
            {t(problem === "taken" ? "items.create.taken" : "items.create.invalid")}
          </FieldError>
        ) : (
          <FieldDescription>{t("items.create.nameHint")}</FieldDescription>
        )}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={Boolean(problem) || create.isPending}>
          {create.isPending ? <Spinner /> : null}
          {t("items.create.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Name a new item; it starts from its kind's template and opens right away. */
export function NewItemDialog({ open, ...props }: NewItemDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? <NewItemForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}
