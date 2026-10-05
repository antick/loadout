import {
  CLAWHUB_LICENSE,
  CLAWHUB_NAME,
  CLAWHUB_SLUG_PATTERN,
  CLAWHUB_TOKEN_URL,
  CLAWHUB_VERSION_PATTERN,
  type ClawhubPublishInput,
  type Skill,
  formatBytes,
} from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, ExternalLink, KeyRound } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyableCommand } from "@/components/CopyableCommand";
import { InlineNotice } from "@/components/InlineNotice";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { usePublishToClawhub } from "@/features/library/publish/publish-mutations";
import { canPreviewClawhub, useClawhubPreview } from "@/features/library/publish/publish-queries";
import { useClawhubAccount } from "@/hooks/queries/publish";
import { useOpenExternal } from "@/hooks/mutations/app";
import { errorMessage } from "@/lib/toast";
import { cn } from "@/lib/utils";

export interface ClawhubPublishDialogProps {
  skill: Skill | null;
  onOpenChange: (open: boolean) => void;
}

/** The form lives in its own component so every opening starts from the registry's answer. */
function ClawhubPublishForm({
  skill,
  onOpenChange,
}: {
  skill: Skill;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const slugId = useId();
  const nameId = useId();
  const versionId = useId();
  const changelogId = useId();
  const licenseId = useId();
  const account = useClawhubAccount();
  const preview = useClawhubPreview(skill.id, canPreviewClawhub(account.data));
  const publish = usePublishToClawhub();
  const openExternal = useOpenExternal();
  const [slug, setSlug] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [changelog, setChangelog] = useState("");
  const [acceptLicense, setAcceptLicense] = useState(false);
  const [allowSecrets, setAllowSecrets] = useState(false);

  const plan = preview.data;
  const slugValue = slug ?? plan?.slug ?? "";
  const nameValue = displayName ?? plan?.displayName ?? skill.name;
  const versionValue = version ?? plan?.suggestedVersion ?? "1.0.0";
  const slugOk = CLAWHUB_SLUG_PATTERN.test(slugValue);
  const versionOk = CLAWHUB_VERSION_PATTERN.test(versionValue);
  const held = (plan?.secrets.length ?? 0) > 0 && !allowSecrets;
  const blocked = (plan?.problems.length ?? 0) > 0;
  const ready =
    plan !== undefined &&
    slugOk &&
    versionOk &&
    nameValue.trim() !== "" &&
    acceptLicense &&
    !held &&
    !blocked;
  const result = publish.data;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!ready || publish.isPending) return;
    const input: ClawhubPublishInput = {
      skillId: skill.id,
      slug: slugValue,
      displayName: nameValue,
      version: versionValue,
      changelog,
      acceptLicense,
      allowSecrets,
    };
    publish.mutate(input);
  };

  if (result) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t("publish.clawhub.doneTitle")}</DialogTitle>
          <DialogDescription>
            {t(
              result.status === "pending"
                ? "publish.clawhub.donePending"
                : "publish.clawhub.doneLive",
              { ref: `@${result.handle}/${result.slug}`, version: result.version },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <CopyableCommand
            command={result.installCommand}
            caption={t("publish.clawhub.installWith")}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => openExternal.mutate(result.pageUrl)}
          >
            <ExternalLink />
            {t("publish.clawhub.openPage")}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("publish.done")}</Button>
        </DialogFooter>
      </>
    );
  }

  const noToken = account.data && account.data.handle === null;

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{t("publish.clawhub.title", { name: skill.name })}</DialogTitle>
        <DialogDescription>{t("publish.clawhub.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-0.5 pr-1">
        {account.isPending ? (
          <Spinner className="size-4" />
        ) : noToken ? (
          <InlineNotice
            tone="warning"
            icon={KeyRound}
            actions={
              <Link
                to="/settings"
                search={{ section: "marketplaces" }}
                className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
                onClick={() => onOpenChange(false)}
              >
                {t("publish.clawhub.openSettings")}
              </Link>
            }
          >
            {account.data?.problem
              ? t("publish.clawhub.tokenProblem", { problem: account.data.problem })
              : t("publish.clawhub.noToken")}
          </InlineNotice>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("publish.clawhub.signedInAs", { handle: account.data?.handle ?? "" })}
            {plan?.latestVersion
              ? ` ${t("publish.clawhub.latest", { version: plan.latestVersion })}`
              : plan
                ? ` ${t("publish.clawhub.notYet")}`
                : ""}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={slugId}>{t("publish.clawhub.slug")}</FieldLabel>
            <Input
              id={slugId}
              value={slugValue}
              spellCheck={false}
              autoCapitalize="off"
              aria-invalid={slugValue !== "" && !slugOk}
              className="font-mono text-sm"
              onChange={(event) => setSlug(event.target.value)}
            />
            <FieldDescription>{t("publish.clawhub.slugHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={versionId}>{t("publish.clawhub.version")}</FieldLabel>
            <Input
              id={versionId}
              value={versionValue}
              spellCheck={false}
              aria-invalid={!versionOk}
              className="font-mono text-sm"
              onChange={(event) => setVersion(event.target.value)}
            />
            <FieldDescription>{t("publish.clawhub.versionHint")}</FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor={nameId}>{t("publish.clawhub.displayName")}</FieldLabel>
          <Input
            id={nameId}
            value={nameValue}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={changelogId}>{t("publish.clawhub.changelog")}</FieldLabel>
          <Textarea
            id={changelogId}
            value={changelog}
            placeholder={t("publish.clawhub.changelogPlaceholder")}
            className="min-h-20 text-sm"
            onChange={(event) => setChangelog(event.target.value)}
          />
        </Field>

        {plan ? (
          <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <p className="font-medium">
              {t("publish.clawhub.files", {
                count: plan.files.length,
                size: formatBytes(plan.totalBytes),
              })}
            </p>
            <p className="line-clamp-2 font-mono text-muted-foreground" data-selectable>
              {plan.files.map((file) => file.path).join(", ")}
            </p>
            {plan.topics.length > 0 ? (
              <p className="text-muted-foreground">
                {t("publish.clawhub.topics", { topics: plan.topics.join(", ") })}
              </p>
            ) : null}
          </div>
        ) : preview.isPending && !noToken ? (
          <Spinner className="size-4" />
        ) : null}

        {plan?.problems.map((problem) => (
          <InlineNotice key={problem} tone="danger" icon={AlertTriangle}>
            {problem}
          </InlineNotice>
        ))}
        {plan && plan.secrets.length > 0 ? (
          <InlineNotice
            tone="warning"
            icon={AlertTriangle}
            actions={
              <Button
                type="button"
                variant={allowSecrets ? "outline" : "ghost"}
                size="xs"
                onClick={() => setAllowSecrets((value) => !value)}
              >
                {allowSecrets ? <Check /> : null}
                {t("publish.clawhub.publishAnyway")}
              </Button>
            }
          >
            {t("publish.clawhub.secrets", { count: plan.secrets.length })}{" "}
            <span className="font-mono">
              {plan.secrets.map((secret) => `${secret.file}:${secret.line}`).join(", ")}
            </span>
          </InlineNotice>
        ) : null}
        {publish.error || preview.error ? (
          <InlineNotice tone="danger" icon={AlertTriangle}>
            <span data-selectable>{errorMessage(publish.error ?? preview.error)}</span>
          </InlineNotice>
        ) : null}

        <label htmlFor={licenseId} className="flex items-start gap-2 text-xs">
          <Checkbox
            id={licenseId}
            checked={acceptLicense}
            onCheckedChange={(value) => setAcceptLicense(value === true)}
            className="mt-0.5"
          />
          <span>
            {t("publish.clawhub.license", { license: CLAWHUB_LICENSE, marketplace: CLAWHUB_NAME })}
          </span>
        </label>
      </div>

      <DialogFooter className="items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => openExternal.mutate(CLAWHUB_TOKEN_URL)}
        >
          <ExternalLink />
          {t("publish.clawhub.tokens")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!ready || publish.isPending}>
            {publish.isPending ? <Spinner /> : null}
            {t("publish.clawhub.submit", { version: versionValue })}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/**
 * Publish one library skill as a version on ClawHub, under the token saved in Settings. It shows
 * what would be sent and the version it follows; nothing is uploaded until Publish.
 */
export function ClawhubPublishDialog({
  skill,
  onOpenChange,
}: ClawhubPublishDialogProps): ReactNode {
  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {skill ? (
          <ClawhubPublishForm key={skill.id} skill={skill} onOpenChange={onOpenChange} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
