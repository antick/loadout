import { useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShellBanner } from "@/components/ShellBanner";
import { Button } from "@/components/ui/button";
import { useLibraryLocation } from "@/hooks/queries/app";

/** Warns when the library location could not be used as configured. */
export function LibraryWarningBanner(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLibraryLocation();
  const warnings = location.data?.warnings ?? [];
  if (warnings.length === 0) return null;

  return (
    <ShellBanner
      tone="warning"
      icon={TriangleAlert}
      title={t("banners.libraryTitle")}
      description={warnings.map((warning) => t(`banners.libraryWarnings.${warning}`)).join(" ")}
      actions={
        <Button variant="ghost" size="xs" onClick={() => void navigate({ to: "/settings" })}>
          {t("banners.openSettings")}
        </Button>
      }
    />
  );
}
