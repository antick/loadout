import type { Project, ProjectTarget, SkillVersion } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, History, PencilLine, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import type { SkillAction } from "@/components/skill-action";
import {
  type ProjectSkillRef,
  useDeleteProjectSkills,
  useExportSkills,
  usePullFromLibrary,
  usePushToLibrary,
  useSetProjectSkillsEnabled,
} from "@/features/projects/project-skill-mutations";
import { usePendingSet } from "@/hooks/use-pending-set";
import { editLink } from "@/lib/skill-location";
import type { VersionChoice } from "./PushVersionDialog";
import {
  isTargetAvailable,
  leadVariant,
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
  /** A skill whose copies differ, waiting for the user to pick the one the library gets. */
  versionChoice: VersionChoice | null;
  /** Ask which copy the library gets; for other places that push, such as the batch toolbar. */
  chooseVersion(ref: ProjectSkillRef, versions: SkillVersion[]): void;
  closeVersionChoice(): void;
}

/** Everything a project skill card can do, wired to confirmations and mutations. */
export function useProjectSkillActions(
  project: Project,
  onGone?: (group: ProjectSkillGroup) => void,
): ProjectSkillActions {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  // `mutate` is stable across renders; the mutation objects are not.
  const [versionChoice, setVersionChoice] = useState<VersionChoice | null>(null);
  const chooseVersion = useCallback((ref: ProjectSkillRef, versions: SkillVersion[]) => {
    setVersionChoice({ ref, versions });
  }, []);
  const { mutate: push } = usePushToLibrary(chooseVersion);
  const { mutate: pull } = usePullFromLibrary();
  const { mutate: setEnabled } = useSetProjectSkillsEnabled();
  // `mutateAsync`, not per-call callbacks: TanStack Query only calls those for the latest call of
  // a mutation, so a quick second toggle would leave the first switch spinning for good.
  const { mutateAsync: exportSkills } = useExportSkills();
  const { mutateAsync: deleteSkills } = useDeleteProjectSkills();
  const { pending: pendingTargets, mark: markPending } = usePendingSet();
  const projectId = project.id;

  const actionsFor = useCallback(
    (group: ProjectSkillGroup): SkillAction[] => {
      const rules = projectSkillRules(group);
      const ref: ProjectSkillRef = {
        projectId,
        relativePath: group.relativePath,
        name: group.name,
      };
      const lead = leadVariant(group);
      const actions: SkillAction[] = lead
        ? [
            {
              id: "edit",
              label: t("editor.open"),
              icon: PencilLine,
              run: () =>
                void navigate(
                  editLink({
                    kind: "project",
                    projectId,
                    relativePath: lead.relativePath,
                    agentKey: lead.agentKey,
                  }),
                ),
            },
          ]
        : [];

      if (rules.push) {
        actions.push({
          id: "push",
          label: t(
            group.librarySkillId ? "projectPage.actions.push" : "projectPage.actions.import",
          ),
          icon: ArrowUpFromLine,
          primary: true,
          run: () => push([ref]),
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
            pull([ref]);
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
            if (ok) pull([{ ...ref, restore: true }]);
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
          if (ok) {
            void deleteSkills([ref])
              .then(() => onGone?.(group))
              .catch(() => undefined);
          }
        },
      });
      return actions;
    },
    [t, confirm, navigate, push, pull, deleteSkills, projectId, onGone],
  );

  const toggleEnabled = useCallback(
    (group: ProjectSkillGroup) =>
      setEnabled({
        refs: [{ projectId, relativePath: group.relativePath, name: group.name }],
        enabled: group.enabledState !== "all",
      }),
    [setEnabled, projectId],
  );

  const toggleTarget = useCallback(
    async (group: ProjectSkillGroup, target: ProjectTarget): Promise<void> => {
      const pendingId = pendingTargetId(group.id, target.key);
      // Failures are toasted by the mutation itself; here only the spinner ends.
      const settle = (work: Promise<unknown>): Promise<unknown> =>
        work.catch(() => undefined).finally(() => markPending(pendingId, false));
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
        void settle(
          exportSkills({
            projectId,
            jobs: [
              {
                skillId: group.librarySkillId,
                name: group.name,
                agentKeys: [target.key],
                targetName: target.displayName,
              },
            ],
          }),
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
      void settle(
        deleteSkills([
          {
            projectId,
            relativePath: variant.relativePath,
            name: group.name,
            agentKey: target.key,
            targetName: target.displayName,
          },
        ]).then(() => {
          if (last) onGone?.(group);
        }),
      );
    },
    [t, confirm, exportSkills, deleteSkills, markPending, projectId, onGone],
  );

  return {
    actionsFor,
    toggleEnabled,
    toggleTarget: (group, target) => void toggleTarget(group, target),
    pendingTargets,
    versionChoice,
    chooseVersion,
    closeVersionChoice: () => setVersionChoice(null),
  };
}
