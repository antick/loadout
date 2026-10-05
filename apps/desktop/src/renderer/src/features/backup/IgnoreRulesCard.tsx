import { CircleAlert } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSetBackupIgnoreRules } from "@/features/backup/backup-mutations";
import { useBackupIgnoreRules } from "@/features/backup/backup-queries";
import { backupErrorText } from "@/features/backup/backup-errors";
import { SECTION_LABEL } from "@/lib/styles";

const toText = (lines: readonly string[]): string => lines.join("\n");

/** Patterns for files that stay on each computer: the app's defaults, and the user's own. */
export function IgnoreRulesCard({ enabled }: { enabled: boolean }): ReactNode {
  const { t } = useTranslation();
  const fieldId = useId();
  const rules = useBackupIgnoreRules(enabled);
  const save = useSetBackupIgnoreRules();
  // Null while not editing, so patterns synced from another device show up as they arrive.
  const [draft, setDraft] = useState<string | null>(null);

  if (!enabled || !rules.data) return null;
  const saved = toText(rules.data.custom);
  const text = draft ?? saved;
  const changed = draft !== null && draft !== saved;

  return (
    <Panel title={t("backupSync.ignore.title")} description={t("backupSync.ignore.description")}>
      <div className="flex flex-col gap-1.5">
        <p className={SECTION_LABEL}>{t("backupSync.ignore.defaults")}</p>
        <ul className="flex flex-wrap gap-1">
          {rules.data.defaults.map((pattern) => (
            <li
              key={pattern}
              data-selectable
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {pattern}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className={SECTION_LABEL}>
          {t("backupSync.ignore.custom")}
        </label>
        <Textarea
          id={fieldId}
          value={text}
          spellCheck={false}
          placeholder={t("backupSync.ignore.placeholder")}
          className="min-h-20 font-mono text-xs md:text-xs"
          aria-invalid={save.isError}
          onChange={(event) => {
            setDraft(event.target.value);
            if (save.isError) save.reset();
          }}
        />
        <p className="text-xs text-muted-foreground">{t("backupSync.ignore.hint")}</p>
      </div>
      {save.isError ? (
        <InlineNotice tone="danger" icon={CircleAlert}>
          <span data-selectable>{backupErrorText(save.error, t)}</span>
        </InlineNotice>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={!changed || save.isPending}
          onClick={() => {
            setDraft(null);
            save.reset();
          }}
        >
          {t("backupSync.ignore.discard")}
        </Button>
        <Button
          size="sm"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate(text.split("\n"), { onSuccess: () => setDraft(null) })}
        >
          {t("backupSync.ignore.save")}
        </Button>
      </div>
    </Panel>
  );
}
