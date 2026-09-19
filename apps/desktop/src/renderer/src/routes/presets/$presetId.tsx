import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { usePresets } from "@/hooks/queries/presets";

function PresetRoute(): ReactNode {
  const { t } = useTranslation();
  const { presetId } = Route.useParams();
  const preset = usePresets().data?.find((entry) => entry.id === presetId);
  return <PagePlaceholder title={preset?.name ?? t("nav.presets")} />;
}

export const Route = createFileRoute("/presets/$presetId")({ component: PresetRoute });
