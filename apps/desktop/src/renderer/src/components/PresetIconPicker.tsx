import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { PresetIcon } from "@/components/PresetIcon";
import { PRESET_ICONS } from "@/lib/preset-icons";

/** Grid of every preset icon; a native radio group, so arrow keys move between icons. */
export function PresetIconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}): ReactNode {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset aria-label={t("presets.icon")} className="flex min-w-0 flex-wrap gap-1.5">
      {PRESET_ICONS.map(({ id }) => (
        <label key={id} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={id}
            checked={value === id}
            aria-label={id}
            onChange={() => onChange(id)}
            className="peer sr-only"
          />
          <span className="block rounded-md p-0.5 opacity-70 ring-offset-background transition-shadow peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-primary peer-checked:ring-offset-1 peer-focus-visible:ring-2 peer-focus-visible:ring-ring hover:opacity-100">
            <PresetIcon icon={id} />
          </span>
        </label>
      ))}
    </fieldset>
  );
}
