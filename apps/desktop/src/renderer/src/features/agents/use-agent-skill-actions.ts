import type { LocalSkill } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, CircleMinus, PencilLine, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { EDIT_ACTION_ID, type SkillAction } from "@/components/skill-action";
import {
  type LocalSkillRef,
  useDeleteLocalSkill,
  usePullLocalSkill,
  useRemoveFromAgent,
  useUploadLocalSkill,
} from "@/hooks/mutations/workspace";
import { editLink } from "@/lib/skill-location";
import { agentSkillRules } from "./agent-skill-rules";

/**
 * The actions one skill folder of an agent offers, per its sync status, each wired to its
 * confirmation and mutation. `onGone` runs after an action that makes the folder disappear.
 */
export function useAgentSkillActions(
  agentName: string,
  onGone?: (skill: LocalSkill) => void,
): (skill: LocalSkill) => SkillAction[] {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  // `mutate` is stable across renders; the mutation objects are not.
  const { mutate: upload } = useUploadLocalSkill();
  const { mutate: pull } = usePullLocalSkill();
  const { mutate: remove } = useRemoveFromAgent();
  const { mutate: deleteLocal } = useDeleteLocalSkill();

  return useCallback(
    (skill: LocalSkill): SkillAction[] => {
      const rules = agentSkillRules(skill);
      const ref: LocalSkillRef = {
        agentKey: skill.agentKey,
        relativePath: skill.relativePath,
        name: skill.name,
      };
      const actions: SkillAction[] = [
        {
          id: EDIT_ACTION_ID,
          label: t("editor.open"),
          icon: PencilLine,
          // A deployed link is the library skill; the editor opens that one.
          run: () =>
            void navigate(
              editLink({
                kind: "agent",
                agentKey: skill.agentKey,
                relativePath: skill.relativePath,
              }),
            ),
        },
      ];

      if (rules.upload) {
        actions.push({
          id: "upload",
          label: t("agents.actions.upload"),
          icon: ArrowUpFromLine,
          // Overwriting a newer library copy is possible but never the obvious thing to do.
          primary: skill.syncStatus !== "library_newer",
          run: async () => {
            if (rules.uploadNeedsConfirm) {
              const ok = await confirm({
                title: t("agents.confirm.uploadTitle", { name: skill.name }),
                description: t("agents.confirm.uploadDescription"),
                confirmLabel: t("agents.actions.upload"),
              });
              if (!ok) return;
            }
            upload(ref);
          },
        });
      }

      if (rules.pull) {
        actions.push({
          id: "pull",
          label: t("agents.actions.pull"),
          icon: ArrowDownToLine,
          primary: true,
          run: async () => {
            const ok = await confirm({
              title: t("agents.confirm.pullTitle", { name: skill.name }),
              description: t("agents.confirm.pullDescription", { agent: agentName }),
              items: [skill.path],
              confirmLabel: t("agents.actions.pull"),
              destructive: true,
            });
            if (ok) pull(ref);
          },
        });
      }

      const skillId = skill.librarySkillId;
      if (rules.remove && skillId) {
        actions.push({
          id: "remove",
          label: t("agents.actions.remove", { agent: agentName }),
          icon: CircleMinus,
          run: async () => {
            if (rules.removeNeedsConfirm) {
              const ok = await confirm({
                title: t("agents.confirm.removeTitle", { name: skill.name, agent: agentName }),
                description: t("agents.confirm.removeDescription"),
                items: [skill.path],
                confirmLabel: t("agents.actions.removeShort"),
                destructive: true,
              });
              if (!ok) return;
            }
            remove(
              { agentKey: skill.agentKey, skillId, name: skill.name },
              { onSuccess: () => onGone?.(skill) },
            );
          },
        });
      }

      if (rules.deleteLocal) {
        actions.push({
          id: "delete",
          label: t("agents.actions.deleteLocal"),
          icon: Trash2,
          destructive: true,
          run: async () => {
            const ok = await confirm({
              title: t("agents.confirm.deleteTitle", { name: skill.name }),
              description: t("agents.confirm.deleteDescription"),
              items: [skill.path],
              confirmLabel: t("agents.actions.deleteShort"),
              destructive: true,
            });
            if (ok) deleteLocal(ref, { onSuccess: () => onGone?.(skill) });
          },
        });
      }

      return actions;
    },
    [t, confirm, navigate, upload, pull, remove, deleteLocal, agentName, onGone],
  );
}
