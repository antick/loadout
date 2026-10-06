import type { CheckAllResult, SkillSource, SourceCheckResult } from "@loadout/shared";
import type { TFunction } from "i18next";
import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { usePendingSet } from "@/hooks/use-pending-set";
import { api } from "@/lib/api";
import { toastBatchOutcome } from "@/lib/batch";
import { GENERIC_ERROR_KEY } from "@/lib/toast";

interface CheckSkillsInput {
  /** The skills to look at; every skill when omitted. */
  skillIds?: readonly string[];
  /** Names the checked sources in the toast. */
  label: string;
}

/** New skills a check found in the repositories, or added by itself, in one line; null for none. */
function newsLine(t: TFunction, sources: SourceCheckResult | undefined): string | null {
  if (!sources) return null;
  const found = sources.news.reduce((total, news) => total + news.skills.length, 0);
  const lines = [
    ...(sources.added.length > 0
      ? [
          `${t("sources.news.addedToast", { count: sources.added.length })}: ${sources.added.join(", ")}.`,
        ]
      : []),
    ...(found > 0 ? [t("sources.news.foundToast", { count: found })] : []),
  ];
  return lines.length > 0 ? lines.join(" ") : null;
}

/**
 * Look upstream for several skills, such as everything from one source, and for skills their
 * repositories gained, with one toast. One backend round: each repository is asked once.
 */
function useCheckSkills(): UseMutationResult<CheckAllResult, unknown, CheckSkillsInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillIds }) =>
      api.updates.checkAll(true, {
        ...(skillIds ? { skillIds: [...skillIds] } : {}),
        newSkills: true,
      }),
    onSuccess: (result, { label }) =>
      toastBatchOutcome(
        t("sources.checkedToast", { source: label, count: result.updateAvailable.length }),
        [...result.failed, ...(result.sources?.failed ?? [])],
        { description: newsLine(t, result.sources) },
      ),
    error: "library.errors.check",
  });
}

export interface SourceChecks {
  /** True while this source is being checked, on its own or as part of "Check all". */
  isChecking(sourceKey: string): boolean;
  checkingAll: boolean;
  check(source: SkillSource): void;
  checkAll(): void;
}

/**
 * Update checks of the Sources page, tracked per source key: two cards checked one after the
 * other each keep their own spinner until their own check ends.
 */
export function useSourceChecks(): SourceChecks {
  const { t } = useTranslation();
  const checkSkills = useCheckSkills();
  const { pending, mark } = usePendingSet();
  const [checkingAll, setCheckingAll] = useState(false);
  // `mutateAsync`, not per-call callbacks: TanStack Query only calls those for the latest call,
  // so a second card checked meanwhile would end the first one's spinner early. A failure is
  // toasted by the mutation itself.
  const run = (input: CheckSkillsInput, done: () => void): void => {
    checkSkills
      .mutateAsync(input)
      .catch(() => undefined)
      .finally(done);
  };
  return {
    isChecking: (sourceKey) => checkingAll || pending.has(sourceKey),
    checkingAll,
    check: (source) => {
      mark(source.key, true);
      run({ skillIds: source.skillIds, label: source.label }, () => mark(source.key, false));
    },
    checkAll: () => {
      setCheckingAll(true);
      run({ label: t("sources.allSources") }, () => setCheckingAll(false));
    },
  };
}

/** Stop showing a repository's new skills (some of them, or all). */
export function useDismissSourceNews(): UseMutationResult<
  void,
  unknown,
  { sourceKey: string; paths?: string[] }
> {
  return useApiMutation({
    fn: ({ sourceKey, paths }) => api.updates.dismissSourceNews(sourceKey, paths),
    error: GENERIC_ERROR_KEY,
  });
}
