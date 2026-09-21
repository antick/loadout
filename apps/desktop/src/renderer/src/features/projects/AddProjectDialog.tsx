import type { Project } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toastSuccess } from "@/lib/toast";
import { AddLinkedWorkspaceTab } from "./AddLinkedWorkspaceTab";
import { AddProjectFolderTab } from "./AddProjectFolderTab";
import { AddProjectScanTab } from "./AddProjectScanTab";

export interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a project was linked, e.g. to navigate to it. */
  onAdded?: (project: Project) => void;
}

const ADD_PROJECT_TABS = ["folder", "scan", "linked"] as const;
type AddProjectTab = (typeof ADD_PROJECT_TABS)[number];
const TAB_CONTENT_CLASS = "flex flex-col gap-4";

/** The body lives in its own component so every opening starts on the first tab with empty forms. */
function AddProjectBody({ onOpenChange, onAdded }: Omit<AddProjectDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AddProjectTab>("folder");

  const close = (): void => onOpenChange(false);
  const added = (projects: Project[], summary?: string): void => {
    const first = projects[0];
    if (!first) return;
    toastSuccess(
      projects.length === 1
        ? t("addProject.linkedOne", { name: first.name })
        : t("addProject.linkedMany", { count: projects.length }),
      summary,
    );
    close();
    if (onAdded) onAdded(first);
    else void navigate({ to: "/projects/$projectId", params: { projectId: first.id } });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("projects.linkTitle")}</DialogTitle>
        <DialogDescription>{t("addProject.description")}</DialogDescription>
      </DialogHeader>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          const picked = ADD_PROJECT_TABS.find((entry) => entry === next);
          if (picked) setTab(picked);
        }}
        className="min-h-0 gap-4"
      >
        <TabsList className="w-full">
          {ADD_PROJECT_TABS.map((entry) => (
            <TabsTrigger key={entry} value={entry}>
              {t(`addProject.tabs.${entry}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="folder" className={TAB_CONTENT_CLASS}>
          <AddProjectFolderTab onCancel={close} onAdded={added} />
        </TabsContent>
        <TabsContent value="scan" className={TAB_CONTENT_CLASS}>
          <AddProjectScanTab onCancel={close} onAdded={added} />
        </TabsContent>
        <TabsContent value="linked" className={TAB_CONTENT_CLASS}>
          <AddLinkedWorkspaceTab onCancel={close} onAdded={added} />
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * Link a workspace: one project folder, several found by scanning a root, or a standalone skills
 * folder. Opened from the sidebar and the command palette through `useShell()`.
 */
export function AddProjectDialog({
  open,
  onOpenChange,
  onAdded,
}: AddProjectDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <AddProjectBody onOpenChange={onOpenChange} onAdded={onAdded} />
      </DialogContent>
    </Dialog>
  );
}
