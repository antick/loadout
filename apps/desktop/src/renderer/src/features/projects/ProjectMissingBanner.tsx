import type { Project } from "@skillboard/shared";
import { FolderX } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";

/** Shown when the workspace folder is gone from disk: say so and offer to drop it from the list. */
export function ProjectMissingBanner({
  project,
  onRemove,
}: {
  project: Project;
  onRemove: () => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <InlineNotice
      tone="warning"
      icon={FolderX}
      actions={
        <Button size="xs" variant="outline" onClick={onRemove}>
          {t("projects.remove")}
        </Button>
      }
    >
      <p className="font-medium">{t("projectPage.missing.title")}</p>
      <p data-selectable className="text-foreground/80">
        {t("projectPage.missing.description", { path: project.path })}
      </p>
    </InlineNotice>
  );
}
