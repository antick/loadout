import { createFileRoute } from "@tanstack/react-router";
import { PresetsOverviewPage } from "@/features/presets/PresetsOverviewPage";

export const Route = createFileRoute("/presets/")({ component: PresetsOverviewPage });
