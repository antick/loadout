import type { Project } from "@skillboard/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a project was linked, e.g. to navigate to it. */
  onAdded?: (project: Project) => void;
}

/**
 * Link a project folder. Opened from the sidebar and the command palette through `useShell()`.
 * TODO(projects): pick a folder or scan a root for projects, add a linked workspace, then call
 * `onAdded` and close. The shell depends only on the props above.
 */
export function AddProjectDialog({ open, onOpenChange }: AddProjectDialogProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.linkTitle")}</DialogTitle>
          <DialogDescription>{t("projects.linkDescription")}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
