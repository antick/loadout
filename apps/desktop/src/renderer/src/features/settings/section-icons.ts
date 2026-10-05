import {
  Bot,
  HardDrive,
  Info,
  type LucideIcon,
  Network,
  RefreshCw,
  Settings2,
  Store,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import type { SettingsSection } from "./constants";

/** Icon of each settings section, in the sidebar and anywhere else a section is named. */
export const SETTINGS_SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  agents: Bot,
  general: Settings2,
  storage: HardDrive,
  network: Network,
  updates: RefreshCw,
  marketplaces: Store,
  safety: ShieldCheck,
  cli: TerminalSquare,
  about: Info,
};
