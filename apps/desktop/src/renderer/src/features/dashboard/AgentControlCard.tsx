import { Bot, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentControlSetup } from "@/components/AgentControlSetup";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { useDismissAgentControl } from "@/hooks/mutations/dashboard";
import { useAgentControlStatus } from "@/hooks/queries/dashboard";

/** Suggests letting agents manage skills themselves. Gone once set up or dismissed. */
export function AgentControlCard(): ReactNode {
  const { t } = useTranslation();
  const status = useAgentControlStatus();
  const dismiss = useDismissAgentControl();
  const [expanded, setExpanded] = useState(false);
  if (!status.data || status.data.installed || status.data.dismissed) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("dashboard.agentControl.title")}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.agentControl.body")}</p>
        </div>
        {expanded ? null : (
          <Button size="sm" onClick={() => setExpanded(true)}>
            {t("dashboard.agentControl.start")}
          </Button>
        )}
        <IconButton
          size="icon-sm"
          label={t("dashboard.agentControl.dismiss")}
          icon={<X />}
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate()}
        />
      </div>
      {expanded ? (
        <div className="pl-12">
          <p className="mb-2 text-sm">{t("dashboard.agentControl.pick")}</p>
          <AgentControlSetup
            secondaryAction={
              <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
                {t("common.cancel")}
              </Button>
            }
          />
        </div>
      ) : null}
    </section>
  );
}
