import { Link } from "@tanstack/react-router";
import {
  Bot,
  CloudUpload,
  Info,
  type LucideIcon,
  Network,
  RefreshCw,
  Settings2,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { AboutSection } from "./AboutSection";
import { AgentControlSection } from "./AgentControlSection";
import { AgentsSection } from "./AgentsSection";
import { BackupSection } from "./BackupSection";
import { SETTINGS_SECTIONS, type SettingsSection } from "./constants";
import { GeneralSection } from "./GeneralSection";
import { NetworkSection } from "./NetworkSection";
import { UpdatesSection } from "./UpdatesSection";

const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  agents: Bot,
  general: Settings2,
  network: Network,
  updates: RefreshCw,
  backup: CloudUpload,
  cli: TerminalSquare,
  about: Info,
};

const SECTION_VIEWS: Record<SettingsSection, () => ReactNode> = {
  agents: AgentsSection,
  general: GeneralSection,
  network: NetworkSection,
  updates: UpdatesSection,
  backup: BackupSection,
  cli: AgentControlSection,
  about: AboutSection,
};

/** Settings: a section list on the left, one section at a time on the right. */
export function SettingsPage({ section }: { section: SettingsSection }): ReactNode {
  const { t } = useTranslation();
  const View = SECTION_VIEWS[section];

  return (
    <div className="flex min-h-full gap-6 px-6 py-5">
      <PageHeader title={t("nav.settings")} subtitle={t(`settings.sections.${section}.title`)} />
      <nav aria-label={t("settings.navLabel")} className="sticky top-5 w-48 shrink-0 self-start">
        <ul className="flex flex-col gap-0.5">
          {SETTINGS_SECTIONS.map((id) => {
            const Icon = SECTION_ICONS[id];
            const active = id === section;
            return (
              <li key={id}>
                <Link
                  to="/settings"
                  search={{ section: id }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active && "bg-accent font-medium text-accent-foreground",
                  )}
                >
                  <Icon className={cn("size-4", active && "text-primary")} />
                  {t(`settings.sections.${id}.title`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
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
