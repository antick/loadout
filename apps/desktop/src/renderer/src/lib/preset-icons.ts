import {
  BookOpen,
  Bot,
  Boxes,
  Braces,
  Brush,
  Bug,
  Cloud,
  Code,
  Compass,
  Cpu,
  Database,
  FileText,
  FlaskConical,
  Gauge,
  GitBranch,
  Globe,
  Hammer,
  Layers,
  Lightbulb,
  type LucideIcon,
  Microscope,
  Package,
  PenTool,
  Rocket,
  Search,
  Server,
  Shield,
  Smartphone,
  Sparkles,
  Terminal,
  Wand2,
  Zap,
} from "lucide-react";
import type { StatusTone } from "@/components/StatusBadge";

export interface PresetIconDefinition {
  /** Stored in `Preset.icon`. Never rename an id once shipped. */
  id: string;
  icon: LucideIcon;
  tone: StatusTone;
}

/** Icons a preset can use, each with a tint from the semantic palette. */
export const PRESET_ICONS: readonly PresetIconDefinition[] = [
  { id: "layers", icon: Layers, tone: "brass" },
  { id: "code", icon: Code, tone: "info" },
  { id: "terminal", icon: Terminal, tone: "neutral" },
  { id: "braces", icon: Braces, tone: "primary" },
  { id: "rocket", icon: Rocket, tone: "danger" },
  { id: "sparkles", icon: Sparkles, tone: "warning" },
  { id: "wand", icon: Wand2, tone: "brass" },
  { id: "bot", icon: Bot, tone: "primary" },
  { id: "bug", icon: Bug, tone: "danger" },
  { id: "flask", icon: FlaskConical, tone: "success" },
  { id: "microscope", icon: Microscope, tone: "info" },
  { id: "search", icon: Search, tone: "neutral" },
  { id: "book", icon: BookOpen, tone: "warning" },
  { id: "file", icon: FileText, tone: "neutral" },
  { id: "pen", icon: PenTool, tone: "brass" },
  { id: "brush", icon: Brush, tone: "danger" },
  { id: "globe", icon: Globe, tone: "info" },
  { id: "smartphone", icon: Smartphone, tone: "primary" },
  { id: "server", icon: Server, tone: "neutral" },
  { id: "database", icon: Database, tone: "success" },
  { id: "cloud", icon: Cloud, tone: "info" },
  { id: "cpu", icon: Cpu, tone: "brass" },
  { id: "shield", icon: Shield, tone: "success" },
  { id: "git", icon: GitBranch, tone: "warning" },
  { id: "package", icon: Package, tone: "warning" },
  { id: "boxes", icon: Boxes, tone: "primary" },
  { id: "hammer", icon: Hammer, tone: "neutral" },
  { id: "gauge", icon: Gauge, tone: "success" },
  { id: "zap", icon: Zap, tone: "warning" },
  { id: "lightbulb", icon: Lightbulb, tone: "warning" },
  { id: "compass", icon: Compass, tone: "info" },
];

export const DEFAULT_PRESET_ICON_ID = "layers";

const BY_ID = new Map(PRESET_ICONS.map((definition) => [definition.id, definition]));

/** The icon for a stored id; unknown or missing ids fall back to the default icon. */
export function resolvePresetIcon(id: string | null | undefined): PresetIconDefinition {
  const fallback = BY_ID.get(DEFAULT_PRESET_ICON_ID) ?? PRESET_ICONS[0];
  const found = id ? BY_ID.get(id) : undefined;
  if (found) return found;
  if (!fallback) throw new Error("PRESET_ICONS must not be empty.");
  return fallback;
}
