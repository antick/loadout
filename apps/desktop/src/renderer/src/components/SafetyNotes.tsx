import {
  CloudUpload,
  Copy,
  FolderLock,
  History,
  type LucideIcon,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Each guarantee Loadout keeps about your files; the text lives under `help.safety.<id>`. */
const NOTES: readonly { id: string; icon: LucideIcon }[] = [
  { id: "agentFolders", icon: ShieldCheck },
  { id: "editor", icon: History },
  { id: "copies", icon: Copy },
  { id: "updates", icon: RefreshCw },
  { id: "backup", icon: CloudUpload },
  { id: "library", icon: FolderLock },
];

/** "How your files are kept safe": what Loadout will never do to files it writes near. */
export function SafetyNotes(): ReactNode {
  const { t } = useTranslation();
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        <ShieldCheck className="size-3.5" />
        {t("help.safety.title")}
      </h3>
      <ul className="mt-2 flex flex-col gap-2.5">
        {NOTES.map(({ id, icon: Icon }) => (
          <li key={id} className="flex gap-2.5">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{t(`help.safety.${id}.title`)}</p>
              <p className="text-sm leading-5 text-muted-foreground">
                {t(`help.safety.${id}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
