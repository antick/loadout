import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/PageHeader";
import { AboutSection } from "./AboutSection";
import { AgentControlSection } from "./AgentControlSection";
import { AgentsSection } from "./AgentsSection";
import { BackupSection } from "./BackupSection";
import type { SettingsSection } from "./constants";
import { GeneralSection } from "./GeneralSection";
import { NetworkSection } from "./NetworkSection";
import { UpdatesSection } from "./UpdatesSection";

const SECTION_VIEWS: Record<SettingsSection, () => ReactNode> = {
  agents: AgentsSection,
  general: GeneralSection,
  network: NetworkSection,
  updates: UpdatesSection,
  backup: BackupSection,
  cli: AgentControlSection,
  about: AboutSection,
};

/** Settings, one section at a time. The section list is the Settings section of the sidebar. */
export function SettingsPage({ section }: { section: SettingsSection }): ReactNode {
  const { t } = useTranslation();
  const View = SECTION_VIEWS[section];

  return (
    <div className="flex min-h-full px-6 py-5">
      <PageHeader title={t("nav.settings")} subtitle={t(`settings.sections.${section}.title`)} />
      <div className="flex min-w-0 max-w-4xl flex-1 flex-col gap-4">
        <header>
          <h2 className="text-base font-semibold tracking-tight">
            {t(`settings.sections.${section}.title`)}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(`settings.sections.${section}.description`)}
          </p>
        </header>
        <View />
      </div>
    </div>
  );
}
