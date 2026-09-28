import { MARKETPLACE_NAME, type Skill, type SourceCandidate } from "@loadout/shared";
import { ArrowRightLeft, Link2, Search, SearchX, UserPen } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { InlineNotice } from "@/components/InlineNotice";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  useAttachSource,
  useFindSource,
  useLookUpSource,
  useSetAuthored,
} from "@/hooks/mutations/origin";
import { errorMessage } from "@/lib/toast";
import { SourceCandidateItem } from "./SourceCandidateItem";

/**
 * On a skill without a source: look for where it came from, compare a repository the user names,
 * link the right one, or mark the skill as the user's own so nobody looks again.
 */
export function FindSourceSection({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const find = useFindSource();
  const lookUp = useLookUpSource();
  const attach = useAttachSource();
  const setAuthored = useSetAuthored();
  const [input, setInput] = useState("");

  const busy = find.isPending || lookUp.isPending || attach.isPending;
  const found = find.data?.skillId === skill.id ? find.data : undefined;
  const pasted = lookUp.data;
  const candidates = [
    ...(pasted ? [pasted] : []),
    ...(found?.candidates ?? []).filter(
      (candidate) =>
        !pasted || candidate.url !== pasted.url || candidate.subpath !== pasted.subpath,
    ),
  ];

  const link = async (candidate: SourceCandidate): Promise<void> => {
    if (candidate.match !== "identical") {
      const ok = await confirm({
        title: t("origin.confirmTitle", { name: skill.name, source: candidate.label }),
        description: t("origin.confirmDescription", {
          count: Math.max(candidate.changedFiles.length, 1),
        }),
        confirmLabel: t("origin.link"),
      });
      if (!ok) return;
    }
    attach.mutate({ skillId: skill.id, candidate });
  };

  const compare = (event: FormEvent): void => {
    event.preventDefault();
    if (input.trim()) lookUp.mutate({ skillId: skill.id, input });
  };

  if (skill.authored) {
    return (
      <InlineNotice
        tone="neutral"
        icon={UserPen}
        actions={
          <Button
            variant="ghost"
            size="xs"
            disabled={setAuthored.isPending}
            onClick={() => setAuthored.mutate({ skillId: skill.id, authored: false })}
          >
            {t("origin.notMine")}
          </Button>
        }
      >
        {t("origin.mineNotice")}
      </InlineNotice>
    );
  }

  return (
    <PageSection
      title={t("origin.title")}
      description={t("origin.description")}
      actions={
        <Button
          variant="ghost"
          size="sm"
          title={t("origin.mineHint")}
          disabled={busy || setAuthored.isPending}
          onClick={() => setAuthored.mutate({ skillId: skill.id, authored: true })}
        >
          <UserPen />
          {t("origin.mine")}
        </Button>
      }
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <form className="flex flex-wrap items-center gap-2" onSubmit={compare}>
          <Button
            type="button"
            size="sm"
            variant={found ? "outline" : "default"}
            disabled={busy}
            onClick={() => find.mutate(skill.id)}
          >
            {find.isPending ? <Spinner /> : <Search />}
            {t("origin.find")}
          </Button>
          <Input
            aria-label={t("origin.pasteLabel")}
            placeholder={t("origin.pastePlaceholder")}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="h-8 min-w-60 flex-1 font-mono text-xs"
            spellCheck={false}
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !input.trim()}>
            {lookUp.isPending ? <Spinner /> : <ArrowRightLeft />}
            {t("origin.compare")}
          </Button>
        </form>

        {find.isPending ? (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {t("origin.finding", { marketplace: MARKETPLACE_NAME })}
          </p>
        ) : null}
        {find.error ? <p className="text-sm text-danger">{errorMessage(find.error)}</p> : null}
        {lookUp.error ? <p className="text-sm text-danger">{errorMessage(lookUp.error)}</p> : null}

        {candidates.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-md border">
            {candidates.map((candidate) => (
              <li key={`${candidate.url}\n${candidate.subpath ?? ""}`} className="px-3 py-2.5">
                <SourceCandidateItem
                  candidate={candidate}
                  actions={
                    <Button
                      size="sm"
                      variant={candidate.match === "identical" ? "default" : "outline"}
                      disabled={busy}
                      onClick={() => void link(candidate)}
                    >
                      {attach.isPending && attach.variables?.candidate === candidate ? (
                        <Spinner />
                      ) : (
                        <Link2 />
                      )}
                      {t("origin.link")}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        ) : found && !find.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <SearchX className="size-4 shrink-0" />
            {t("origin.nothingFound")}
          </p>
        ) : null}

        {found && found.failures.length > 0 ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-default">
              {t("origin.failures", { count: found.failures.length })}
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5 font-mono">
              {found.failures.map((failure) => (
                <li key={failure} data-selectable className="break-all">
                  {failure}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </PageSection>
  );
}
