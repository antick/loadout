import {
  Bot,
  CloudUpload,
  HardDrive,
  Info,
  type LucideIcon,
  Network,
  RefreshCw,
  Settings2,
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
  safety: ShieldCheck,
  backup: CloudUpload,
  cli: TerminalSquare,
  about: Info,
};
