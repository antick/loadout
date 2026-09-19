import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/features/settings/constants";
import { SettingsPage } from "@/features/settings/SettingsPage";

export interface SettingsSearch {
  section?: SettingsSection;
}

function SettingsRoute(): ReactNode {
  const { section } = Route.useSearch();
  return <SettingsPage section={section ?? DEFAULT_SETTINGS_SECTION} />;
}

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    section: SETTINGS_SECTIONS.find((section) => section === search.section),
  }),
  component: SettingsRoute,
});
