import type { ReactNode } from "react";
import { PathActions } from "@/components/PathActions";
import { useAppInfo } from "@/hooks/queries/app";
import { compactHome } from "@/lib/paths";
import { cn } from "@/lib/utils";

export interface PathTextProps {
  path: string;
  /** Show the copy button (default true). */
  copy?: boolean;
  /** Show the "reveal in file manager" button (default true). */
  reveal?: boolean;
  className?: string;
}

/** A filesystem path in mono with the home folder shortened to `~`, plus copy and reveal. */
export function PathText({
  path,
  copy = true,
  reveal = true,
  className,
}: PathTextProps): ReactNode {
  const { data: info } = useAppInfo();

  return (
    <span
      className={cn("group/path inline-flex max-w-full min-w-0 items-center gap-0.5", className)}
    >
      <span
        data-selectable
        title={path}
        className="truncate font-mono text-xs text-muted-foreground"
      >
        {compactHome(path, info?.homeDir)}
      </span>
      <PathActions
        path={path}
        copy={copy}
        reveal={reveal}
        className="opacity-0 transition-opacity group-focus-within/path:opacity-100 group-hover/path:opacity-100"
      />
    </span>
  );
}
