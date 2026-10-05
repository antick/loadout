import {
  FEEDBACK_HAPPENED_MAX,
  FEEDBACK_PROPOSAL_MAX,
  type FeedbackInputProblem,
  type Skill,
  buildSkillFeedback,
  feedbackInputProblem,
} from "@loadout/shared";
import { Copy, ExternalLink, ShieldAlert } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
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
import { Textarea } from "@/components/ui/textarea";
import { useCopyText, useOpenExternal } from "@/hooks/mutations/app";
import { useAppInfo } from "@/hooks/queries/app";

export interface ReportProblemDialogProps {
  /** The skill to report on; null keeps the dialog closed. */
  skill: Skill | null;
  onOpenChange: (open: boolean) => void;
}

const HAPPENED_ROWS = 4;
const PROPOSAL_ROWS = 3;

/** The form lives in its own component so every opening starts empty. */
function ReportProblemForm({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const happenedId = useId();
  const proposalId = useId();
  const { data: info } = useAppInfo();
  const copy = useCopyText();
  const copyReport = useCopyText(() => t("feedback.opening"));
  const openExternal = useOpenExternal();
  const [happened, setHappened] = useState("");
  const [proposal, setProposal] = useState("");

  const problem: FeedbackInputProblem | null = feedbackInputProblem({ happened, proposal });
  const draft = useMemo(
    () => buildSkillFeedback(skill, { happened, proposal }, { loadoutVersion: info?.version }),
    [skill, happened, proposal, info?.version],
  );
  const site = draft.target ? t(`feedback.sites.${draft.target.host}`) : null;
  const ready = problem === null;

  const open = async (): Promise<void> => {
    if (!draft.url) return;
    if (!draft.urlHasBody) {
      // The link cannot carry the whole report, so it travels on the clipboard.
      // The hook toasts a failure; the report then stays on screen.
      const copied = await copyReport.mutateAsync(draft.body).then(
        () => true,
        () => false,
      );
      if (!copied) return;
    }
    openExternal.mutate(draft.url);
  };

  const showHappenedLimit = problem === "happened_too_long";
  const showProposalLimit = problem === "proposal_too_long";

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("feedback.title", { name: skill.name })}</DialogTitle>
        <DialogDescription>
          {site ? t("feedback.description", { site }) : t("feedback.descriptionNoSite")}
        </DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {draft.target ? (
          <p className="text-sm font-medium" data-selectable>
            {t("feedback.goesTo", { repository: draft.target.repository })}
          </p>
        ) : null}
        <InlineNotice tone="warning" icon={ShieldAlert}>
          {t("feedback.public")}
        </InlineNotice>

        <Field data-invalid={showHappenedLimit || undefined}>
          <FieldLabel htmlFor={happenedId}>{t("feedback.happened")}</FieldLabel>
          <Textarea
            id={happenedId}
            rows={HAPPENED_ROWS}
            value={happened}
            aria-invalid={showHappenedLimit}
            placeholder={t("feedback.happenedPlaceholder")}
            onChange={(event) => setHappened(event.target.value)}
          />
          {showHappenedLimit ? (
            <FieldError>{t("feedback.tooLong", { max: FEEDBACK_HAPPENED_MAX })}</FieldError>
          ) : (
            <FieldDescription>{t("feedback.happenedHint")}</FieldDescription>
          )}
        </Field>

        <Field data-invalid={showProposalLimit || undefined}>
          <FieldLabel htmlFor={proposalId}>
            {t("feedback.proposal")}
            <span className="font-normal text-muted-foreground">{t("feedback.optional")}</span>
          </FieldLabel>
          <Textarea
            id={proposalId}
            rows={PROPOSAL_ROWS}
            value={proposal}
            aria-invalid={showProposalLimit}
            onChange={(event) => setProposal(event.target.value)}
          />
          {showProposalLimit ? (
            <FieldError>{t("feedback.tooLong", { max: FEEDBACK_PROPOSAL_MAX })}</FieldError>
          ) : (
            <FieldDescription>{t("feedback.proposalHint")}</FieldDescription>
          )}
        </Field>

        {ready ? (
          <section className="flex flex-col gap-1.5" aria-label={t("feedback.preview")}>
            <h3 className="text-xs font-medium text-muted-foreground">{t("feedback.preview")}</h3>
            <p className="text-xs text-muted-foreground">{t("feedback.previewHint")}</p>
            <pre
              data-selectable
              className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap"
            >
              {`${draft.title}\n\n${draft.body}`}
            </pre>
          </section>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          disabled={!ready || copy.isPending}
          onClick={() => copy.mutate(`${draft.title}\n\n${draft.body}`)}
        >
          <Copy />
          {t("feedback.copy")}
        </Button>
        {draft.url && site ? (
          <Button disabled={!ready || openExternal.isPending} onClick={() => void open()}>
            <ExternalLink />
            {t("feedback.open", { site })}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

/**
 * Prepare an issue about a skill for the repository it came from. The person reads the exact
 * text, then opens the repository's new-issue page with it filled in, or copies it. Nothing is
 * sent by the app.
 */
export function ReportProblemDialog({ skill, onOpenChange }: ReportProblemDialogProps): ReactNode {
  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {skill ? <ReportProblemForm key={skill.id} skill={skill} /> : null}
      </DialogContent>
    </Dialog>
  );
}
