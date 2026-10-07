import { CLAWHUB_NAME, CLAWHUB_TOKEN_URL } from "@loadout/shared";
import { ExternalLink, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { PageSection } from "@/components/PageSection";
import { SettingRow } from "@/components/SettingRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useSetClawhubToken } from "@/features/settings/settings-mutations";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useClawhubAccount } from "@/hooks/queries/publish";

/**
 * Marketplaces skills come from and go to. For now, the ClawHub token: who it signs in as, saving
 * a new one, and taking it away.
 */
export function MarketplacesSection(): ReactNode {
  const { t } = useTranslation();
  const account = useClawhubAccount();
  const setToken = useSetClawhubToken();
  const openExternal = useOpenExternal();
  const inputId = useId();
  const [draft, setDraft] = useState("");

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setToken.mutate(value, {
      onSuccess: () => setDraft(""),
      // `reset` lets go of the input, token included; errors are toasted by the mutation.
      onSettled: () => setToken.reset(),
    });
  };

  let status: ReactNode;
  if (account.isPending) status = <Skeleton className="h-10 w-full" />;
  else if (!account.data?.available) {
    status = (
      <InlineNotice tone="warning" icon={ShieldOff}>
        {t("settings.marketplaces.clawhub.noKeychain")}
      </InlineNotice>
    );
  } else if (account.data.handle) {
    status = (
      <InlineNotice
        tone="success"
        icon={ShieldCheck}
        actions={
          <Button
            variant="ghost"
            size="xs"
            disabled={setToken.isPending}
            onClick={() => setToken.mutate(null)}
          >
            {t("settings.marketplaces.clawhub.forget")}
          </Button>
        }
      >
        {t("settings.marketplaces.clawhub.signedIn", { handle: account.data.handle })}
      </InlineNotice>
    );
  } else if (account.data.saved) {
    status = (
      <InlineNotice
        tone="danger"
        icon={KeyRound}
        actions={
          <Button
            variant="ghost"
            size="xs"
            disabled={setToken.isPending}
            onClick={() => setToken.mutate(null)}
          >
            {t("settings.marketplaces.clawhub.forget")}
          </Button>
        }
      >
        {t("settings.marketplaces.clawhub.problem", { problem: account.data.problem ?? "" })}
      </InlineNotice>
    );
  } else {
    status = (
      <InlineNotice tone="neutral" icon={KeyRound}>
        {t("settings.marketplaces.clawhub.none")}
      </InlineNotice>
    );
  }

  return (
    <PageSection
      variant="card"
      title={CLAWHUB_NAME}
      description={t("settings.marketplaces.clawhub.description")}
      actions={
        <Button variant="ghost" size="sm" onClick={() => openExternal.mutate(CLAWHUB_TOKEN_URL)}>
          <ExternalLink />
          {t("settings.marketplaces.clawhub.tokens")}
        </Button>
      }
    >
      {status}
      <form onSubmit={submit}>
        <SettingRow
          label={t("settings.marketplaces.clawhub.token")}
          description={t("settings.marketplaces.clawhub.tokenHint")}
          htmlFor={inputId}
          stacked
        >
          <Input
            id={inputId}
            type="password"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            placeholder="clh_…"
            disabled={!account.data?.available}
            className="max-w-xl font-mono text-sm"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!draft.trim() || setToken.isPending || !account.data?.available}
          >
            {setToken.isPending ? <Spinner /> : null}
            {t("settings.marketplaces.clawhub.save")}
          </Button>
        </SettingRow>
      </form>
    </PageSection>
  );
}
