import { type ReactNode, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface InlineEditProps {
  value: string;
  /** Called with the trimmed text when it changed. */
  onSubmit: (value: string) => void;
  /** Accessible name of the field, e.g. "Device name". */
  label: string;
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Text that turns into an input on click. Enter or blur saves, Escape cancels. */
export function InlineEdit({
  value,
  onSubmit,
  label,
  placeholder,
  allowEmpty,
  disabled,
  className,
}: InlineEditProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
  }, [editing]);

  const finish = (save: boolean): void => {
    setEditing(false);
    const next = draft.trim();
    if (save && next !== value && (allowEmpty || next)) onSubmit(next);
  };

  if (editing) {
    return (
      <Input
        ref={input}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        className={cn("h-7 px-2", className)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish(true);
          if (event.key === "Escape") {
            event.stopPropagation();
            finish(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(
        "-mx-1 max-w-full truncate rounded px-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none",
        !value && "text-muted-foreground",
        className,
      )}
    >
      {value || placeholder}
    </button>
  );
}
