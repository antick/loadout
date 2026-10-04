import type { Skill, SourceCandidate, SourceChoice, SourceSearch } from "@loadout/shared";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { toastError } from "@/lib/toast";

/** A candidate the user picked, reduced to what linking needs. */
function choiceOf(candidate: SourceCandidate): SourceChoice {
  const { url, branch, subpath, marketRef, evidence } = candidate;
  return { url, branch, subpath, marketRef, evidence };
}

/** Look for where a skill without a source came from. Changes nothing; errors show in place. */
export function useFindSource(): UseMutationResult<SourceSearch, unknown, string> {
  return useMutation({ mutationFn: (skillId: string) => api.updates.findSource(skillId) });
}

/** Compare a skill with a repository the user typed. Changes nothing; errors show in place. */
export function useLookUpSource(): UseMutationResult<
  SourceCandidate,
  unknown,
  { skillId: string; input: string }
> {
  return useMutation({
    mutationFn: ({ skillId, input }) => api.updates.lookUpSource(skillId, input.trim()),
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
  return useMutation({
    mutationFn: ({ skillId, candidate }) => api.updates.attachSource(skillId, choiceOf(candidate)),
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
  const mutation = useMutation({
    mutationFn: ({ skillId, authored }: { skillId: string; authored: boolean; quiet?: boolean }) =>
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
    onError: (error) => toastError(error),
  });
  return mutation;
}
