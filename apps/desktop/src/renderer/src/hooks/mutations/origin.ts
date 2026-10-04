import type { Skill, SourceCandidate, SourceChoice, SourceSearch } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { GENERIC_ERROR_KEY, toastError } from "@/lib/toast";

/** A candidate the user picked, reduced to what linking needs. */
function choiceOf(candidate: SourceCandidate): SourceChoice {
  const { url, branch, subpath, marketRef, evidence } = candidate;
  return { url, branch, subpath, marketRef, evidence };
}

/** Look for where a skill without a source came from. Changes nothing; errors show in place. */
export function useFindSource(): UseMutationResult<SourceSearch, unknown, string> {
  return useApiMutation({ fn: (skillId: string) => api.updates.findSource(skillId), error: false });
}

/** Compare a skill with a repository the user typed. Changes nothing; errors show in place. */
export function useLookUpSource(): UseMutationResult<
  SourceCandidate,
  unknown,
  { skillId: string; input: string }
> {
  return useApiMutation({
    fn: ({ skillId, input }) => api.updates.lookUpSource(skillId, input.trim()),
    error: false,
  });
}

export interface AttachSourceInput {
  skillId: string;
  candidate: SourceCandidate;
  /** Say so in a toast. Off for a batch, which sums up once at the end. */
  announce?: boolean;
}

/** Make a skill follow the chosen repository from now on. */
export function useAttachSource(): UseMutationResult<Skill, unknown, AttachSourceInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, candidate }) => api.updates.attachSource(skillId, choiceOf(candidate)),
    // A batch sums up its failures once at the end.
    error: false,
    onSuccess: (skill, { candidate, announce = true }) => {
      if (!announce) return;
      const differs = candidate.changedFiles.length;
      toast.success(t("origin.linked", { name: skill.name, source: candidate.label }), {
        description:
          candidate.match === "identical"
            ? undefined
            : t("origin.linkedDiffers", { count: Math.max(differs, 1) }),
      });
    },
    onError: (error, { announce = true }) => {
      if (announce) toastError(error);
    },
  });
}

/** Mark a skill as the user's own work, or take that back. Offers an undo. */
export function useSetAuthored(): UseMutationResult<
  Skill,
  unknown,
  { skillId: string; authored: boolean; quiet?: boolean }
> {
  const { t } = useTranslation();
  const mutation = useApiMutation({
    fn: ({ skillId, authored }: { skillId: string; authored: boolean; quiet?: boolean }) =>
      api.skills.setAuthored(skillId, authored),
    onSuccess: (skill, { authored, quiet }) => {
      if (quiet) return;
      toast.success(
        t(authored ? "origin.markedMine" : "origin.unmarkedMine", { name: skill.name }),
        {
          action: {
            label: t("common.undo"),
            onClick: () => mutation.mutate({ skillId: skill.id, authored: !authored, quiet: true }),
          },
        },
      );
    },
    error: GENERIC_ERROR_KEY,
  });
  return mutation;
}
