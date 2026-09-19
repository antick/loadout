import { Search, X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Kbd } from "@/components/ui/kbd";
import { isDialogOpen, useHotkey } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import { useShortcutLabel } from "@/hooks/use-shortcut-label";
import { SHORTCUT_KEYS } from "@/lib/shortcuts";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Focus on ⌘F / Ctrl+F. Turn off for inputs inside sheets, where the page already owns it. */
  focusHotkey?: boolean;
  /** Focus the field when it mounts, e.g. at the top of a sheet. */
  focusOnMount?: boolean;
  className?: string;
}

/** Search field with a clear button. ⌘F focuses it; Escape clears, then blurs. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  focusHotkey = true,
  focusOnMount,
  className,
}: SearchInputProps): ReactNode {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const findLabel = useShortcutLabel("find");

  useEffect(() => {
    if (focusOnMount) input.current?.focus();
  }, [focusOnMount]);

  useHotkey(
    SHORTCUT_KEYS.find,
    (event) => {
      if (isDialogOpen()) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    },
    { enabled: focusHotkey },
  );

  return (
    <InputGroup className={cn("h-8 w-64", className)}>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        ref={input}
        className="[&::-webkit-search-cancel-button]:appearance-none"
        type="search"
        value={value}
        placeholder={placeholder ?? t("common.search")}
        aria-label={placeholder ?? t("common.search")}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          if (value) onChange("");
          else input.current?.blur();
        }}
      />
      <InputGroupAddon align="inline-end">
        {value ? (
          <InputGroupButton
            size="icon-xs"
            aria-label={t("common.clearSearch")}
            onClick={() => onChange("")}
          >
            <X />
          </InputGroupButton>
        ) : focusHotkey ? (
          <Kbd>{findLabel}</Kbd>
        ) : null}
      </InputGroupAddon>
    </InputGroup>
  );
}
