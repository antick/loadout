import type { LocalSkill, PluginSkill } from "@loadout/shared";
import { CopyPlus, Plug, PowerOff } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@/components/PageSection";
import { PathActions } from "@/components/PathActions";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { PLUGIN_SKILLS_SHOWN } from "@/lib/constants";

export interface PluginSkillsSectionProps {
  agentName: string;
  /** Undefined while loading; nothing shows until a plugin skill is found. */
  plugins: readonly PluginSkill[] | undefined;
  /** The skills in the agent's own folder, to point out the ones it also gets from a plugin. */
  local: readonly LocalSkill[] | undefined;
}

/**
 * Skills the agent's plugins bring, shown only: the plugin manager owns them. Points out the
 * ones that are also in the agent's folder, which the agent then loads twice.
 */
export function PluginSkillsSection({
  agentName,
  plugins,
  local,
}: PluginSkillsSectionProps): ReactNode {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const localNames = useMemo(
    () =>
      new Set(
        (local ?? [])
          .flatMap((skill) => [skill.name, skill.dirName])
          .map((name) => name.toLowerCase()),
      ),
    [local],
  );
  if (!plugins || plugins.length === 0) return null;

  const shown = expanded ? plugins : plugins.slice(0, PLUGIN_SKILLS_SHOWN);
  const hidden = plugins.length - shown.length;

  return (
    <PageSection
      title={t("agents.plugins.title")}
      description={t("agents.plugins.description", { agent: agentName })}
    >
      <ul className="flex flex-col divide-y rounded-lg border bg-card">
        {shown.map((skill) => {
          const twice = skill.enabled && localNames.has(skill.name.toLowerCase());
          return (
            <li key={skill.path} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span
                    data-selectable
                    className={skill.enabled ? "font-medium" : "font-medium text-muted-foreground"}
                  >
                    {skill.name}
                  </span>
                  <StatusBadge
                    tone="neutral"
                    label={
                      skill.marketplace ? `${skill.plugin}@${skill.marketplace}` : skill.plugin
                    }
                  />
                  {skill.enabled ? null : (
                    <StatusBadge
                      tone="neutral"
                      icon={<PowerOff />}
                      label={t("agents.plugins.off")}
                    />
                  )}
                  {twice ? (
                    <span title={t("agents.plugins.twiceHint", { agent: agentName })}>
                      <StatusBadge
                        tone="warning"
                        icon={<CopyPlus />}
                        label={t("agents.plugins.twice")}
                      />
                    </span>
                  ) : null}
                </div>
                {skill.description ? (
                  <p
                    className="line-clamp-1 text-xs text-muted-foreground"
                    title={skill.description}
                  >
                    {skill.description}
                  </p>
                ) : null}
              </div>
              <PathActions path={skill.path} />
            </li>
          );
        })}
      </ul>
      {hidden > 0 || expanded ? (
        <Button
          size="xs"
          variant="link"
          className="h-auto self-start px-0 text-muted-foreground"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded
            ? t("agents.plugins.showFewer")
            : t("agents.plugins.showAll", { count: hidden })}
        </Button>
      ) : null}
    </PageSection>
  );
}
