import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PresetPage } from "@/features/presets/PresetPage";

function PresetRoute(): ReactNode {
  const { presetId } = Route.useParams();
  return <PresetPage presetId={presetId} />;
}

export const Route = createFileRoute("/presets/$presetId")({ component: PresetRoute });
