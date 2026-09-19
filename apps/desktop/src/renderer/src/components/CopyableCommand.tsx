import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { useCopyText } from "@/hooks/mutations/app";
import { cn } from "@/lib/utils";

export interface CopyableCommandProps {
  /** The exact text that is copied. */
  command: string;
  /** What the command does, shown above it. */
  caption?: string;
  className?: string;
}

/** A shell command (or any one-line code) in mono with a copy button. */
export function CopyableCommand({ command, caption, className }: CopyableCommandProps): ReactNode {
  const { t } = useTranslation();
  const copy = useCopyText();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      <div className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2.5">
        <code data-selectable className="min-w-0 flex-1 truncate font-mono text-xs" title={command}>
          {command}
        </code>
        <IconButton
          size="icon-xs"
          label={t("copyable.copy")}
          icon={<Copy />}
          onClick={() => copy.mutate(command)}
        />
      </div>
    </div>
  );
}
