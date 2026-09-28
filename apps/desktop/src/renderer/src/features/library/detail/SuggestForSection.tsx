import {
  SUGGEST_FOR_MAX_LENGTH,
  SUGGEST_FOR_MAX_PATTERNS,
  type Skill,
  suggestPatternProblem,
} from "@loadout/shared";
import { Plus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetSuggestFor } from "@/hooks/mutations/project-suggestions";

/**
 * The file patterns of projects this skill is suggested for (`Cargo.toml`, `*.rs`). A project
 * page lists it under "Suggested for this project" when one matches.
 */
export function SuggestForSection({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const save = useSetSuggestFor();
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [tried, setTried] = useState(false);

  const pattern = draft.trim();
  const problem = pattern
    ? (suggestPatternProblem(pattern) ?? (skill.suggestFor.includes(pattern) ? "taken" : null))
    : null;
  const full = skill.suggestFor.length >= SUGGEST_FOR_MAX_PATTERNS;

  const write = (patterns: string[]): void => save.mutate({ skillId: skill.id, patterns });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setTried(true);
    if (!pattern || problem || full) return;
    write([...skill.suggestFor, pattern]);
    setDraft("");
    setTried(false);
  };

  return (
    <PageSection
      title={t("library.suggestFor.title")}
      description={t("library.suggestFor.description")}
    >
      {skill.suggestFor.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("library.suggestFor.title")}>
          {skill.suggestFor.map((entry) => (
            <li
              key={entry}
              className="inline-flex h-6 items-center gap-1 rounded-md border bg-card pr-0.5 pl-2 font-mono text-xs"
            >
              {entry}
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={t("library.suggestFor.remove", { pattern: entry })}
                disabled={save.isPending}
                onClick={() => write(skill.suggestFor.filter((kept) => kept !== entry))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-1.5" noValidate>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            value={draft}
            maxLength={SUGGEST_FOR_MAX_LENGTH * 2}
            spellCheck={false}
            autoComplete="off"
            disabled={full}
            aria-label={t("library.suggestFor.add")}
            aria-invalid={Boolean(tried && problem)}
            placeholder={t("library.suggestFor.placeholder")}
            className="h-8 flex-1 font-mono text-xs"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!pattern || full || save.isPending}
          >
            <Plus />
            {t("library.suggestFor.add")}
          </Button>
        </div>
        {tried && problem ? (
          <p className="text-xs text-danger">
            {t(`library.suggestFor.problem.${problem}`, { max: SUGGEST_FOR_MAX_LENGTH })}
          </p>
        ) : full ? (
          <p className="text-xs text-muted-foreground">
            {t("library.suggestFor.full", { max: SUGGEST_FOR_MAX_PATTERNS })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("library.suggestFor.hint")}</p>
        )}
      </form>
    </PageSection>
  );
}
