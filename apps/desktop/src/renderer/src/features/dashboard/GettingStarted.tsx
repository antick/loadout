import { useNavigate } from "@tanstack/react-router";
import { CloudUpload, type LucideIcon, PackagePlus, Plug, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Step {
  id: "get" | "deploy" | "backup";
  icon: LucideIcon;
}

const STEPS: readonly Step[] = [
  { id: "get", icon: PackagePlus },
  { id: "deploy", icon: Plug },
  { id: "backup", icon: CloudUpload },
];

/** Shown instead of empty numbers while the library has no skills yet. */
export function GettingStarted(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="type-display text-lg">{t("dashboard.start.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("dashboard.start.body")}</p>
      <ol className="mt-5 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ id, icon: Icon }, index) => (
          <li key={id} className="flex flex-col gap-2 rounded-lg border bg-background p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {t("dashboard.start.step", { number: index + 1 })}
              </span>
            </div>
            <h3 className="text-sm font-medium">{t(`dashboard.start.${id}.title`)}</h3>
            <p className="flex-1 text-sm text-muted-foreground">
              {t(`dashboard.start.${id}.body`)}
            </p>
            {id === "get" ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void navigate({ to: "/install" })}>
                  <PackagePlus />
                  {t("dashboard.actions.install")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void navigate({ to: "/install", search: { tab: "scan" } })}
                >
                  <ScanSearch />
                  {t("dashboard.actions.scan")}
                </Button>
              </div>
            ) : null}
            {id === "backup" ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void navigate({ to: "/backup" })}
              >
                {t("dashboard.start.backup.action")}
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
