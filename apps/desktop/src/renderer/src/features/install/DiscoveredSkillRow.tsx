import type { AgentInfo, DiscoveredSkill } from "@loadout/shared";
import { Check, Download } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { InlineEdit } from "@/components/InlineEdit";
import { PathText } from "@/components/PathText";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SCAN_LOCATIONS_MAX_VISIBLE } from "@/features/install/constants";

export interface DiscoveredSkillRowProps {
  skill: DiscoveredSkill;
  agentsByKey: ReadonlyMap<string, AgentInfo>;
  /** Name it will get in the library; starts as the discovered name. */
  importName: string;
  onRename: (name: string) => void;
  onImport: () => void;
  importing: boolean;
  disabled?: boolean;
}

/** One group of identical skill folders found on this computer, with its import action. */
export function DiscoveredSkillRow({
  skill,
  agentsByKey,
  importName,
  onRename,
  onImport,
  importing,
  disabled,
}: DiscoveredSkillRowProps): ReactNode {
  const { t } = useTranslation();
  const shown = skill.locations.slice(0, SCAN_LOCATIONS_MAX_VISIBLE);
  const hidden = skill.locations.length - shown.length;
  // The same agent can hold several copies; one avatar per agent is enough.
  const agentKeys = [...new Set(skill.locations.map((location) => location.agentKey))];

  return (
    <li className="flex items-start gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          {skill.imported ? (
            <h3 className="truncate text-sm font-medium">{skill.name}</h3>
          ) : (
            <InlineEdit
              value={importName}
              label={t("install.scan.renameLabel", { name: skill.name })}
              disabled={importing || disabled}
              className="text-sm font-medium"
              onSubmit={onRename}
            />
          )}
          {importName !== skill.name && !skill.imported ? (
            <span className="shrink-0 truncate font-mono text-xs text-muted-foreground">
              {t("install.scan.renamedFrom", { name: skill.name })}
            </span>
          ) : null}
          <span className="flex shrink-0 items-center gap-1">
            {agentKeys.map((agentKey) => {
              const displayName = agentsByKey.get(agentKey)?.displayName ?? agentKey;
              return (
                <Tooltip key={agentKey}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <AgentAvatar agentKey={agentKey} name={displayName} size="sm" />
                      <span className="sr-only">{displayName}</span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{displayName}</TooltipContent>
                </Tooltip>
              );
            })}
          </span>
          {skill.locations.length > 1 ? (
            <StatusBadge
              tone="neutral"
              label={t("install.scan.locations", { count: skill.locations.length })}
            />
          ) : null}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {skill.description ?? t("skills.noDescription")}
        </p>
        <ul className="flex flex-col">
          {shown.map((location) => (
            <li key={location.path} className="flex min-w-0">
              <PathText path={location.path} copy={false} />
            </li>
          ))}
          {hidden > 0 ? (
            <li className="text-xs text-muted-foreground">
              {t("common.andMore", { count: hidden })}
            </li>
          ) : null}
        </ul>
      </div>

      {skill.imported ? (
        <StatusBadge tone="success" label={t("install.scan.inLibrary")} icon={<Check />} />
      ) : (
        <Button variant="outline" size="sm" disabled={importing || disabled} onClick={onImport}>
          {importing ? <Spinner /> : <Download />}
          {t("install.scan.import")}
        </Button>
      )}
    </li>
  );
}
