import { AGENT_CONTROL_SKILL_NAME, CLI_BINARY_NAME } from "@skillboard/shared";
import { Link } from "@tanstack/react-router";
import { Bot, CircleCheck, TerminalSquare } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentControlSetup } from "@/components/AgentControlSetup";
import { CopyableCommand } from "@/components/CopyableCommand";
import { InlineNotice } from "@/components/InlineNotice";
import { Panel } from "@/components/Panel";
import { PathText } from "@/components/PathText";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentControlStatus } from "@/hooks/queries/dashboard";
import { useCliStatus } from "@/hooks/queries/settings-page";

/** Example invocations, keyed by their caption under `settings.cli.examples.*`. */
const EXAMPLES = {
  list: `${CLI_BINARY_NAME} skills list --json`,
  install: `${CLI_BINARY_NAME} skills install owner/repo`,
  deploy: `${CLI_BINARY_NAME} skills deploy my-skill --agent claude_code`,
  preset: `${CLI_BINARY_NAME} presets deploy "Frontend work"`,
  sync: `${CLI_BINARY_NAME} git sync`,
} as const;

/** The command-line tool and the bundled skill that teaches agents to use it. */
export function AgentControlSection(): ReactNode {
  const { t } = useTranslation();
  const cli = useCliStatus();
  const control = useAgentControlStatus();

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title={t("settings.cli.title")}
        description={t("settings.cli.description")}
        actions={
          cli.data ? (
            <StatusBadge
              tone={cli.data.published ? "success" : "warning"}
              label={t(cli.data.published ? "settings.cli.published" : "settings.cli.notPublished")}
            />
          ) : null
        }
      >
        {cli.data ? (
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-xs text-muted-foreground">{t("settings.cli.path")}</dt>
            <dd className="min-w-0">
              <PathText path={cli.data.path} />
            </dd>
            <dt className="text-xs text-muted-foreground">{t("settings.cli.version")}</dt>
            <dd className="font-mono text-xs">{cli.data.version ?? t("settings.cli.noVersion")}</dd>
          </dl>
        ) : (
          <Skeleton className="h-10 w-full" />
        )}
        {cli.data && !cli.data.published ? (
          <InlineNotice tone="warning" icon={TerminalSquare}>
            {t("settings.cli.notPublishedHint")}
          </InlineNotice>
        ) : null}
        <div className="grid gap-2 border-t pt-3 md:grid-cols-2">
          {Object.entries(EXAMPLES).map(([id, command]) => (
            <CopyableCommand
              key={id}
              command={command}
              caption={t(`settings.cli.examples.${id}`)}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.cli.pathHint")}</p>
      </Panel>

      <Panel
        title={t("settings.cli.control.title")}
        description={t("settings.cli.control.description", { skill: AGENT_CONTROL_SKILL_NAME })}
        actions={
          control.data?.installed ? (
            <StatusBadge
              tone="success"
              icon={<CircleCheck />}
              label={t("settings.cli.control.installed")}
            />
          ) : null
        }
      >
        {control.data?.installed && control.data.skillId ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.cli.control.installedHint")}{" "}
            <Link
              to="/library"
              search={{ skill: control.data.skillId }}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("settings.cli.control.openSkill")}
            </Link>
          </p>
        ) : null}
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Bot className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-sm">
              {t(
                control.data?.installed
                  ? "settings.cli.control.pickMore"
                  : "settings.cli.control.pick",
              )}
            </p>
            <AgentControlSetup />
          </div>
        </div>
      </Panel>
    </div>
  );
}
