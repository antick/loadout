import type { SkillFileChangeResult, SkillLocation } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAgents } from "@/hooks/queries/agents";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastSuccess } from "@/lib/toast";

export interface SkillPathVariables {
  location: SkillLocation;
  path: string;
}

export interface RenameSkillPathVariables {
  location: SkillLocation;
  from: string;
  to: string;
}

/**
 * One file change (create, rename, delete) with its toasts: what was done, and which deployed
 * copies kept changes of their own and so did not follow.
 */
function useFileChange<Variables>(
  run: (variables: Variables) => Promise<SkillFileChangeResult>,
  done: (result: SkillFileChangeResult, variables: Variables) => string,
  errorKey: string,
): UseMutationResult<SkillFileChangeResult, unknown, Variables> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const agents = useAgents();
  return useApiMutation({
    fn: run,
    onSuccess: (result, variables) => {
      queryClient.setQueryData(keys.skills.detail(result.skill.id), result.skill);
      const title = done(result, variables);
      if (result.copiesKept.length === 0) {
        toastSuccess(title);
        return;
      }
      const names = result.copiesKept.map(
        (key) => agents.data?.find((agent) => agent.key === key)?.displayName ?? key,
      );
      toast.warning(title, {
        description: t("editor.manage.copiesKept", {
          count: names.length,
          agents: names.join(", "),
        }),
      });
    },
    error: errorKey,
  });
}

/** Create an empty file in a library skill. */
export function useCreateSkillFile(): UseMutationResult<
  SkillFileChangeResult,
  unknown,
  SkillPathVariables
> {
  const { t } = useTranslation();
  return useFileChange(
    ({ location, path }: SkillPathVariables) => api.editor.createFile(location, path),
    (result) => t("editor.manage.created", { path: result.path }),
    "editor.manage.errors.create",
  );
}

/** Create a folder in a library skill. */
export function useCreateSkillFolder(): UseMutationResult<
  SkillFileChangeResult,
  unknown,
  SkillPathVariables
> {
  const { t } = useTranslation();
  return useFileChange(
    ({ location, path }: SkillPathVariables) => api.editor.createFolder(location, path),
    (result) => t("editor.manage.created", { path: result.path }),
    "editor.manage.errors.create",
  );
}

/** Rename or move a file or folder of a library skill. */
export function useRenameSkillFile(): UseMutationResult<
  SkillFileChangeResult,
  unknown,
  RenameSkillPathVariables
> {
  const { t } = useTranslation();
  return useFileChange(
    ({ location, from, to }: RenameSkillPathVariables) => api.editor.renameFile(location, from, to),
    (result, variables) => t("editor.manage.renamed", { from: variables.from, to: result.path }),
    "editor.manage.errors.rename",
  );
}

/** Delete a file or folder of a library skill; its files stay in the earlier versions. */
export function useDeleteSkillFile(): UseMutationResult<
  SkillFileChangeResult,
  unknown,
  SkillPathVariables
> {
  const { t } = useTranslation();
  return useFileChange(
    ({ location, path }: SkillPathVariables) => api.editor.deleteFile(location, path),
    (result) => t("editor.manage.deleted", { path: result.path }),
    "editor.manage.errors.delete",
  );
}
