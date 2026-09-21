import { PROXY_URL_PATTERN } from "@loadout/shared";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useSetting } from "@/hooks/queries/settings";
import { toastSuccess } from "@/lib/toast";

const APPLIES_TO = ["market", "sources", "github", "updates"] as const;

/** The form is its own component so it starts from the saved value once settings have loaded. */
function ProxyForm({ saved }: { saved: string }): ReactNode {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState(saved);
  const setSetting = useSetSetting();
  const value = draft.trim();
  const valid = value === "" || PROXY_URL_PATTERN.test(value);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!valid) return;
    setSetting.mutate(
      { key: "proxyUrl", value },
      {
        onSuccess: () =>
          toastSuccess(t(value ? "settings.network.saved" : "settings.network.cleared")),
      },
    );
  };

  return (
    <form onSubmit={submit}>
      <Field data-invalid={!valid || undefined}>
        <FieldLabel htmlFor={inputId}>{t("settings.network.proxyUrl")}</FieldLabel>
        <div className="flex max-w-xl gap-2">
          <Input
            id={inputId}
            value={draft}
            spellCheck={false}
            aria-invalid={!valid}
            placeholder={t("settings.network.placeholder")}
            className="font-mono text-sm"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!valid || value === saved || setSetting.isPending}
          >
            {t("common.save")}
          </Button>
        </div>
        {valid ? (
          <FieldDescription>{t("settings.network.hint")}</FieldDescription>
        ) : (
          <FieldError>{t("settings.network.invalid")}</FieldError>
        )}
      </Field>
    </form>
  );
}

/** One proxy for everything the app downloads itself. */
export function NetworkSection(): ReactNode {
  const { t } = useTranslation();
  const saved = useSetting("proxyUrl");
  return (
    <Panel title={t("settings.network.title")} description={t("settings.network.description")}>
      <ProxyForm key={saved} saved={saved} />
      <div className="border-t pt-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("settings.network.appliesTitle")}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {APPLIES_TO.map((item) => (
            <li key={item}>{t(`settings.network.applies.${item}`)}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted-foreground">{t("settings.network.notApplied")}</p>
      </div>
    </Panel>
  );
}
