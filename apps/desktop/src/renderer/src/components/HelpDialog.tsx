import {
  BookOpen,
  Bot,
  CloudUpload,
  Download,
  FolderGit2,
  Keyboard,
  Laptop,
  Layers,
  type LucideIcon,
  Route,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useAppInfo } from "@/hooks/queries/app";
import { type ShortcutId, shortcutLabel } from "@/lib/shortcuts";

/** Quick-start sections; the text lives under `help.sections.<id>` in the locale file. */
const SECTIONS: readonly { id: string; icon: LucideIcon }[] = [
  { id: "library", icon: BookOpen },
  { id: "install", icon: Download },
  { id: "agents", icon: Bot },
  { id: "presets", icon: Layers },
  { id: "projects", icon: FolderGit2 },
  { id: "backup", icon: CloudUpload },
];

/** Step-by-step setups; the text lives under `help.workflows.<id>` (a title and a list of steps). */
const WORKFLOWS: readonly { id: string; icon: LucideIcon }[] = [
  { id: "oneAgent", icon: User },
  { id: "projects", icon: FolderGit2 },
  { id: "devices", icon: Laptop },
];

const SHORTCUT_IDS: readonly ShortcutId[] = [
  "palette",
  "find",
  "sidebar",
  "sectionHome",
  "sectionLibrary",
  "sectionAgents",
  "sectionPresets",
  "sectionProjects",
  "save",
  "settings",
  "escape",
];

/** A workflow's steps; an untranslated key comes back as a string, which shows nothing. */
function workflowSteps(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((step): step is string => typeof step === "string")
    : [];
}

/** Quick-start guide, recommended workflows and keyboard shortcuts. */
export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const platform = useAppInfo().data?.platform;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("help.title")}</DialogTitle>
          <DialogDescription>{t("help.intro")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map(({ id, icon: Icon }) => (
            <section key={id} className="rounded-lg border bg-card p-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4 text-primary" />
                {t(`help.sections.${id}.title`)}
              </h3>
              <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
                {t(`help.sections.${id}.body`)}
              </p>
            </section>
          ))}
        </div>
        <section>
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            <Route className="size-3.5" />
            {t("help.workflowsTitle")}
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {WORKFLOWS.map(({ id, icon: Icon }) => (
              <section key={id} className="rounded-lg border bg-card p-3">
                <h4 className="flex items-center gap-2 text-sm font-medium">
                  <Icon className="size-4 text-primary" />
                  {t(`help.workflows.${id}.title`)}
                </h4>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm leading-5 text-muted-foreground">
                  {workflowSteps(t(`help.workflows.${id}.steps`, { returnObjects: true })).map(
                    (step) => (
                      <li key={step}>{step}</li>
                    ),
                  )}
                </ol>
              </section>
            ))}
          </div>
        </section>
        <section>
          <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            <Keyboard className="size-3.5" />
            {t("help.shortcutsTitle")}
          </h3>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
            {SHORTCUT_IDS.map((id) => (
              <div key={id} className="contents">
                <dt>
                  <Kbd>{shortcutLabel(id, platform)}</Kbd>
                </dt>
                <dd className="text-muted-foreground">{t(`help.shortcuts.${id}`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </DialogContent>
    </Dialog>
  );
}
