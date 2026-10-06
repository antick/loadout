import {
  DEFAULT_PUBLISH_LAYER,
  PUBLISH_LAYERS,
  PUBLISH_LAYER_DIRS,
  type PublishInput,
  type PublishLayer,
  type Skill,
} from "@loadout/shared";
import { AlertTriangle } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { OptionSelect } from "@/components/OptionSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePublishSkills, usePublishPreview } from "@/features/library/publish/publish-mutations";
import { usePublishDefaults } from "@/features/library/publish/publish-queries";
import { errorMessage } from "@/lib/toast";
import { PublishPlanList } from "./PublishPlanList";
import { PublishResultView } from "./PublishResultView";
import { DIALOG_BODY_SCROLL_CLASS } from "@/lib/styles";
import { cn } from "@/lib/utils";

export interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: readonly Skill[];
  /** Leave selection mode after skills went out. */
  onDone?: () => void;
}

/** The form lives in its own component so every opening starts from the last used target. */
function PublishForm({
  skills,
  onOpenChange,
  onDone,
}: Omit<PublishDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const repoId = useId();
  const branchId = useId();
  const layerId = useId();
  const defaults = usePublishDefaults();
  const preview = usePublishPreview();
  const publish = usePublishSkills();
  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [layer, setLayer] = useState<PublishLayer | null>(null);
  const [allowSecrets, setAllowSecrets] = useState(false);

  const repoValue = repo ?? defaults.data?.repo ?? "";
  const branchValue = branch ?? defaults.data?.branch ?? "";
  const layerValue = layer ?? defaults.data?.layer ?? DEFAULT_PUBLISH_LAYER;
  const input: PublishInput = {
    skillIds: skills.map((skill) => skill.id),
    repo: repoValue.trim(),
    branch: branchValue.trim() || null,
    layer: layerValue,
    allowSecrets,
  };

  /** Any change to the form makes what was shown stale. */
  const edited = (change: () => void): void => {
    change();
    preview.reset();
    publish.reset();
    setAllowSecrets(false);
  };

  const plan = preview.data;
  const result = publish.data;
  const toPublish = plan?.skills.filter((s) => s.status === "new" || s.status === "changed") ?? [];
  const held = (plan?.secrets.length ?? 0) > 0 && !allowSecrets;
  const busy = preview.isPending || publish.isPending;
  const failure = publish.error ?? preview.error;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (busy || input.repo === "") return;
    if (!plan) {
      preview.mutate(input);
    } else if (toPublish.length > 0 && !held) {
      publish.mutate(input);
    }
  };

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("publish.result.title")}</DialogTitle>
        </DialogHeader>
        <PublishResultView result={result} />
        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
              // Leaving selection mode closes this dialog's parent, so it waits until here.
              if (result.commit) onDone?.();
            }}
          >
            {t("publish.done")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{t("publish.title", { count: skills.length })}</DialogTitle>
        <DialogDescription>{t("publish.description")}</DialogDescription>
      </DialogHeader>

      <div className={cn(DIALOG_BODY_SCROLL_CLASS, "flex flex-col gap-4 px-0.5 pr-1")}>
        <Field>
          <FieldLabel htmlFor={repoId}>{t("publish.repo")}</FieldLabel>
          <Input
            id={repoId}
            value={repoValue}
            placeholder={t("publish.repoPlaceholder")}
            spellCheck={false}
            autoCapitalize="off"
            onChange={(event) => edited(() => setRepo(event.target.value))}
          />
          <FieldDescription>{t("publish.repoHint")}</FieldDescription>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={branchId}>{t("publish.branch")}</FieldLabel>
            <Input
              id={branchId}
              value={branchValue}
              placeholder={t("publish.branchPlaceholder")}
              spellCheck={false}
              autoCapitalize="off"
              onChange={(event) => edited(() => setBranch(event.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={layerId}>{t("publish.layer")}</FieldLabel>
            <OptionSelect
              id={layerId}
              value={layerValue}
              options={PUBLISH_LAYERS}
              labelOf={(option) => `${PUBLISH_LAYER_DIRS[option]}/`}
              onChange={(next) => edited(() => setLayer(next))}
            />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t(`publish.layers.${layerValue}`)}</p>

        {failure ? (
          <InlineNotice tone="danger" icon={AlertTriangle}>
            <span data-selectable>{errorMessage(failure)}</span>
          </InlineNotice>
        ) : null}

        {plan ? (
          <PublishPlanList
            plan={plan}
            allowSecrets={allowSecrets}
            onAllowSecrets={setAllowSecrets}
          />
        ) : (
          <p className="text-xs text-muted-foreground">{t("publish.checkHint")}</p>
        )}
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {plan && toPublish.length === 0 ? t("publish.nothingToPublish") : t("publish.private")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={
              busy || input.repo === "" || (plan !== undefined && (toPublish.length === 0 || held))
            }
          >
            {busy ? <Spinner /> : null}
            {plan ? t("publish.submit", { count: toPublish.length }) : t("publish.check")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/**
 * Copy library skills into another Git repository, so anyone can install them with
 * `npx skills add`. It first shows what would change; nothing is pushed until Publish.
 */
export function PublishDialog({
  open,
  onOpenChange,
  skills,
  onDone,
}: PublishDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? <PublishForm skills={skills} onOpenChange={onOpenChange} onDone={onDone} /> : null}
      </DialogContent>
    </Dialog>
  );
}
