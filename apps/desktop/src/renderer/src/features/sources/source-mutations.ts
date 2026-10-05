import {
  type BatchResult,
  type Skill,
  type SkillSource,
  type SourceCheckResult,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { usePendingSet } from "@/hooks/use-pending-set";
import { api } from "@/lib/api";
import { toastBatchOutcome } from "@/lib/batch";
import { keys } from "@/lib/query-keys";
import { GENERIC_ERROR_KEY } from "@/lib/toast";

/** What a check of several skills found: the batch outcome, and how many now have an update. */
interface SkillsChecked extends BatchResult {
  updates: number;
}

interface CheckSkillsInput {
  /** The skills to look at; every skill when omitted. */
  skillIds?: readonly string[];
  /** Names the checked sources in the toast. */
  label: string;
}

/**
 * Look upstream for several skills, such as everything from one source, with one toast. One
 * backend round: each repository among them is asked once.
 */
function useCheckSkills(): UseMutationResult<SkillsChecked, unknown, CheckSkillsInput> {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: async ({ skillIds }) => {
      const result = await api.updates.checkAll(
        true,
        skillIds ? { skillIds: [...skillIds] } : undefined,
      );
      const chosen = skillIds ? new Set(skillIds) : null;
      // The check already made the list refetch; waiting for that refetch is the one call needed.
      await queryClient.invalidateQueries({ queryKey: keys.skills.all });
      const skills = queryClient.getQueryData<Skill[]>(keys.skills.all) ?? [];
      const updates = skills.filter(
        (skill) => (!chosen || chosen.has(skill.id)) && skill.updateStatus === "update_available",
      ).length;
      return { ...result, updates };
    },
    onSuccess: (checked, { label }) =>
      toastBatchOutcome(
        t("sources.checkedToast", { source: label, count: checked.updates }),
        checked.failed,
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

/**
 * Look for new skills in repositories: the ones named, or all. Quiet when there is nothing new;
 * says what was found or added otherwise.
 */
export function useCheckSources(): UseMutationResult<
  SourceCheckResult,
  unknown,
  readonly string[] | undefined
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (sourceKeys) => api.updates.checkSources(sourceKeys ? [...sourceKeys] : undefined),
    onSuccess: (result, sourceKeys) => {
      const asked = sourceKeys ? new Set(sourceKeys) : null;
      const found = result.news
        .filter((news) => !asked || asked.has(news.sourceKey))
        .reduce((total, news) => total + news.skills.length, 0);
      if (result.added.length > 0) {
        toast.success(t("sources.news.addedToast", { count: result.added.length }), {
          description: result.added.join(", "),
        });
      }
      if (found > 0) toast.info(t("sources.news.foundToast", { count: found }));
    },
    error: GENERIC_ERROR_KEY,
  });
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
