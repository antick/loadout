import { useNavigate } from "@tanstack/react-router";
import {
  FilePlus2,
  ShieldCheck,
  CloudUpload,
  Download,
  Folder,
  FolderSearch,
  LifeBuoy,
  PencilLine,
  Package,
  Plus,
  Settings,
  SunMoon,
} from "lucide-react";
import { matchesSkillQuery } from "@loadout/shared";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useScanLibrary } from "@/hooks/mutations/safety";
import { useShell } from "@/components/layout/shell-context";
import { PresetIcon } from "@/components/PresetIcon";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useSyncFlow } from "@/features/backup/sync-flow";
import { useSetSetting } from "@/hooks/mutations/settings";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { usePresets } from "@/hooks/queries/presets";
import { useProjects } from "@/hooks/queries/projects";
import { useSkills } from "@/hooks/queries/skills";
import { COMMAND_PALETTE_MAX_SKILLS } from "@/lib/constants";
import { useShortcutLabel } from "@/hooks/use-shortcut-label";

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** ⌘K: jump to a skill, preset, project or agent, or run a common action. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shell = useShell();
  const { resolvedTheme } = useTheme();
  const setSetting = useSetSetting();
  const sync = useSyncFlow();
  const scanLibrary = useScanLibrary();
  const skills = useSkills();
  const presets = usePresets();
  const projects = useProjects();
  const agents = useAvailableAgents();
  const settingsLabel = useShortcutLabel("settings");
  const quickOpenLabel = useShortcutLabel("quickOpen");
  const [search, setSearch] = useState("");

  // The whole library is searched with the library's own matcher, then the first matches shown;
  // taking the first skills before searching would hide every skill past them.
  const skillMatches = useMemo(
    () =>
      (skills.data ?? [])
        .filter((skill) => matchesSkillQuery(skill, search))
        .slice(0, COMMAND_PALETTE_MAX_SKILLS),
    [skills.data, search],
  );

  const changeOpen = (next: boolean): void => {
    if (!next) setSearch("");
    onOpenChange(next);
  };

  const run = (action: () => void): void => {
    changeOpen(false);
    action();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      title={t("palette.title")}
      description={t("palette.description")}
    >
      <CommandInput
        placeholder={t("palette.placeholder")}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>

        <CommandGroup heading={t("palette.actions")}>
          <CommandItem
            onSelect={() => run(() => void navigate({ to: "/install", search: { tab: "market" } }))}
          >
            <Download />
            {t("palette.install")}
          </CommandItem>
          <CommandItem
            onSelect={() => run(() => void navigate({ to: "/install", search: { tab: "scan" } }))}
          >
            <FolderSearch />
            {t("palette.scan")}
          </CommandItem>
          <CommandItem onSelect={() => run(() => shell.openNewSkill())}>
            <FilePlus2 />
            {t("palette.newSkill")}
          </CommandItem>
          <CommandItem onSelect={() => run(() => shell.openSkillPicker())}>
            <PencilLine />
            {t("palette.editSkill")}
            <CommandShortcut>{quickOpenLabel}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => void scanLibrary(false))}>
            <ShieldCheck />
            {t("palette.safetyScan")}
          </CommandItem>
          <CommandItem onSelect={() => run(() => sync.start())}>
            <CloudUpload />
            {t("palette.backupNow")}
          </CommandItem>
          <CommandItem onSelect={() => run(() => shell.openPresetDialog())}>
            <Plus />
            {t("palette.newPreset")}
          </CommandItem>
          <CommandItem
            onSelect={() =>
              run(() =>
                setSetting.mutate({
                  key: "theme",
                  value: resolvedTheme === "dark" ? "light" : "dark",
                }),
              )
            }
          >
            <SunMoon />
            {t("palette.toggleTheme")}
          </CommandItem>
          <CommandItem onSelect={() => run(() => void navigate({ to: "/settings" }))}>
            <Settings />
            {t("palette.settings")}
            <CommandShortcut>{settingsLabel}</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => shell.openHelp())}>
            <LifeBuoy />
            {t("palette.help")}
          </CommandItem>
        </CommandGroup>

        {skillMatches.length > 0 ? (
          <CommandGroup heading={t("palette.skills")}>
            {skillMatches.map((skill) => (
              <CommandItem
                key={skill.id}
                value={`skill ${skill.name} ${skill.tags.join(" ")} ${skill.id}`}
                // Already matched above; the search as a keyword keeps the palette from hiding it.
                keywords={[search]}
                onSelect={() =>
                  run(() => void navigate({ to: "/library", search: { skill: skill.id } }))
                }
              >
                <Package />
                <span className="truncate">{skill.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {(presets.data?.length ?? 0) > 0 ? (
          <CommandGroup heading={t("palette.presets")}>
            {presets.data?.map((preset) => (
              <CommandItem
                key={preset.id}
                value={`preset ${preset.name} ${preset.id}`}
                onSelect={() =>
                  run(
                    () =>
                      void navigate({ to: "/presets/$presetId", params: { presetId: preset.id } }),
                  )
                }
              >
                <PresetIcon icon={preset.icon} size="sm" />
                <span className="truncate">{preset.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {(projects.data?.length ?? 0) > 0 ? (
          <CommandGroup heading={t("palette.projects")}>
            {projects.data?.map((project) => (
              <CommandItem
                key={project.id}
                value={`project ${project.name} ${project.id}`}
                onSelect={() =>
                  run(
                    () =>
                      void navigate({
                        to: "/projects/$projectId",
                        params: { projectId: project.id },
                      }),
                  )
                }
              >
                <Folder />
                <span className="truncate">{project.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {(agents.data?.length ?? 0) > 0 ? (
          <CommandGroup heading={t("palette.agents")}>
            {agents.data?.map((agent) => (
              <CommandItem
                key={agent.key}
                value={`agent ${agent.displayName} ${agent.key}`}
                onSelect={() =>
                  run(
                    () =>
                      void navigate({ to: "/agents/$agentKey", params: { agentKey: agent.key } }),
                  )
                }
              >
                <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" />
                <span className="truncate">{agent.displayName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
