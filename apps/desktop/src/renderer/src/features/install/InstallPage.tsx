import { FolderInput, GitBranch, type LucideIcon, Radar, Store } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INSTALL_TAB_ORDER } from "@/features/install/constants";
import { GitTab } from "@/features/install/GitTab";
import { LocalTab } from "@/features/install/LocalTab";
import { MarketTab } from "@/features/install/MarketTab";
import { ScanTab } from "@/features/install/ScanTab";
import { INSTALL_TABS, type InstallTab } from "@/lib/constants";

const TAB_ICONS: Record<InstallTab, LucideIcon> = {
  market: Store,
  local: FolderInput,
  git: GitBranch,
  scan: Radar,
};

export interface InstallPageProps {
  tab: InstallTab;
  onTabChange: (tab: InstallTab) => void;
}

/** Every way a skill gets into the library: marketplace, this computer, Git, or an agent folder. */
export function InstallPage({ tab, onTabChange }: InstallPageProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col px-6 py-5">
      <PageHeader title={t("install.title")} subtitle={t(`install.tabs.${tab}.subtitle`)} />
      <Tabs
        value={tab}
        className="gap-5"
        onValueChange={(value) => {
          const next = INSTALL_TABS.find((entry) => entry === value);
          if (next) onTabChange(next);
        }}
      >
        <TabsList>
          {INSTALL_TAB_ORDER.map((entry) => {
            const Icon = TAB_ICONS[entry];
            return (
              <TabsTrigger key={entry} value={entry} className="px-3">
                <Icon />
                {t(`install.tabs.${entry}.label`)}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="market">
          <MarketTab />
        </TabsContent>
        <TabsContent value="local">
          <LocalTab />
        </TabsContent>
        <TabsContent value="git">
          <GitTab />
        </TabsContent>
        <TabsContent value="scan">
          <ScanTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
