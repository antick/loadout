import type { Project, ProjectTarget } from "@loadout/shared";
import { ArrowDownToLine, ArrowUpFromLine, History, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import type { SkillAction } from "@/features/local-skills/skill-action";
import {
  type ProjectSkillRef,
  useDeleteProjectSkill,
  useExportSkill,
  usePullFromLibrary,
  usePushToLibrary,
  useSetProjectSkillEnabled,
} from "@/hooks/mutations/project-detail";
import {
  isTargetAvailable,
  type ProjectSkillGroup,
  projectSkillRules,
  variantFor,
} from "./project-skill-groups";

const PENDING_SEPARATOR = "::";
export const pendingTargetId = (groupId: string, targetKey: string): string =>
  `${groupId}${PENDING_SEPARATOR}${targetKey}`;

export interface ProjectSkillActions {
  /** Sync and delete actions of one logical skill, per its status. */
  actionsFor(group: ProjectSkillGroup): SkillAction[];
  /** Switch every copy on, unless all of them already are: then switch them off. */
  toggleEnabled(group: ProjectSkillGroup): void;
  /** Add the skill for a target (from the library), or delete that target's copy. */
  toggleTarget(group: ProjectSkillGroup, target: ProjectTarget): void;
  /** `pendingTargetId`s with a copy being added or removed right now. */
  pendingTargets: ReadonlySet<string>;
}

/** Everything a project skill card can do, wired to confirmations and mutations. */
export function useProjectSkillActions(
  project: Project,
  onGone?: (group: ProjectSkillGroup) => void,
): ProjectSkillActions {
  const { t } = useTranslation();
  const confirm = useConfirm();
  // `mutate` is stable across renders; the mutation objects are not.
  const { mutate: push } = usePushToLibrary();
  const { mutate: pull } = usePullFromLibrary();
  const { mutate: setEnabled } = useSetProjectSkillEnabled();
  const { mutate: exportSkill } = useExportSkill();
  const { mutate: deleteSkill } = useDeleteProjectSkill();
  const [pendingTargets, setPendingTargets] = useState<ReadonlySet<string>>(new Set());
  const projectId = project.id;

  const markPending = useCallback((id: string, on: boolean) => {
    setPendingTargets((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const actionsFor = useCallback(
    (group: ProjectSkillGroup): SkillAction[] => {
      const rules = projectSkillRules(group);
      const ref: ProjectSkillRef = {
        projectId,
        relativePath: group.relativePath,
        name: group.name,
      };
      const actions: SkillAction[] = [];

      if (rules.push) {
        actions.push({
          id: "push",
          label: t(
            group.librarySkillId ? "projectPage.actions.push" : "projectPage.actions.import",
          ),
          icon: ArrowUpFromLine,
          primary: true,
          run: () => push(ref),
        });
      }
      if (rules.pull) {
        actions.push({
          id: "pull",
          label: t("projectPage.actions.pull"),
          icon: ArrowDownToLine,
          primary: true,
          run: async () => {
            // A diverged copy has changes of its own that the library version would replace.
            if (group.syncStatus === "diverged") {
              const ok = await confirm({
                title: t("projectPage.confirm.pullTitle", { name: group.name }),
                description: t("projectPage.confirm.pullDescription"),
                items: group.variants.map((variant) => variant.path),
                confirmLabel: t("projectPage.actions.pull"),
                destructive: true,
              });
              if (!ok) return;
            }
            pull(ref);
          },
        });
      }
      if (rules.restore) {
        actions.push({
          id: "restore",
          label: t("projectPage.actions.restore"),
          icon: History,
          run: async () => {
            const ok = await confirm({
              title: t("projectPage.confirm.restoreTitle", { name: group.name }),
              description: t("projectPage.confirm.restoreDescription"),
              items: group.variants.map((variant) => variant.path),
              confirmLabel: t("projectPage.actions.restore"),
              destructive: true,
            });
            if (ok) pull({ ...ref, restore: true });
          },
        });
      }
      actions.push({
        id: "delete",
        label: t("projectPage.actions.delete"),
        icon: Trash2,
        destructive: true,
        run: async () => {
          const ok = await confirm({
            title: t("projectPage.confirm.deleteTitle", { name: group.name }),
            description: t("projectPage.confirm.deleteDescription", {
              count: group.variants.length,
            }),
            items: group.variants.map((variant) => variant.path),
            confirmLabel: t("common.delete"),
            destructive: true,
          });
          if (ok) deleteSkill(ref, { onSuccess: () => onGone?.(group) });
        },
      });
      return actions;
    },
    [t, confirm, push, pull, deleteSkill, projectId, onGone],
  );

  const toggleEnabled = useCallback(
    (group: ProjectSkillGroup) =>
      setEnabled({
        projectId,
        relativePath: group.relativePath,
        name: group.name,
        enabled: group.enabledState !== "all",
      }),
    [setEnabled, projectId],
  );

  const toggleTarget = useCallback(
    async (group: ProjectSkillGroup, target: ProjectTarget): Promise<void> => {
      const pendingId = pendingTargetId(group.id, target.key);
      const settle = { onSettled: () => markPending(pendingId, false) };
      const variant = variantFor(group, target.key);

      if (!variant) {
        if (!isTargetAvailable(target)) {
          toast.info(t("projectPage.targets.unavailable", { target: target.displayName }));
          return;
        }
        if (!group.librarySkillId) {
          toast.info(t("projectPage.targets.needsLibraryTitle", { name: group.name }), {
            description: t("projectPage.targets.needsLibrary"),
          });
          return;
        }
        markPending(pendingId, true);
        exportSkill(
          {
            projectId,
            skillId: group.librarySkillId,
            name: group.name,
            agentKeys: [target.key],
            targetName: target.displayName,
          },
          settle,
        );
        return;
      }

      const last = group.variants.length === 1;
      // Only a copy equal to the library is safe to drop without asking.
      if (last || variant.syncStatus !== "in_sync") {
        const ok = await confirm({
          title: t("projectPage.confirm.removeCopyTitle", {
            name: group.name,
            target: target.displayName,
          }),
          description: t(
            last
              ? "projectPage.confirm.removeLastCopyDescription"
              : "projectPage.confirm.removeCopyDescription",
          ),
          items: [variant.path],
          confirmLabel: t("projectPage.targets.removeCopy"),
          destructive: true,
        });
        if (!ok) return;
      }
      markPending(pendingId, true);
      deleteSkill(
        {
          projectId,
          relativePath: variant.relativePath,
          name: group.name,
          agentKey: target.key,
          targetName: target.displayName,
        },
        {
          ...settle,
          onSuccess: () => {
            if (last) onGone?.(group);
          },
        },
      );
    },
    [t, confirm, exportSkill, deleteSkill, markPending, projectId, onGone],
  );

  return {
    actionsFor,
    toggleEnabled,
    toggleTarget: (group, target) => void toggleTarget(group, target),
    pendingTargets,
  };
}
