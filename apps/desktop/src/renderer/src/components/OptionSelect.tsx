import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OptionSelectProps<T extends string> {
  id?: string;
  value: T;
  options: readonly T[];
  /** Visible text of an option. */
  labelOf: (option: T) => string;
  onChange: (option: T) => void;
  disabled?: boolean;
  /** Accessible name when there is no `<label htmlFor>`. */
  ariaLabel?: string;
  className?: string;
}

/** A dropdown over a fixed list of string options, typed end to end. */
export function OptionSelect<T extends string>({
  id,
  value,
  options,
  labelOf,
  onChange,
  disabled,
  ariaLabel,
  className,
}: OptionSelectProps<T>): ReactNode {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate === next);
        if (option !== undefined) onChange(option);
      }}
    >
      <SelectTrigger id={id} size="sm" aria-label={ariaLabel} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labelOf(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
