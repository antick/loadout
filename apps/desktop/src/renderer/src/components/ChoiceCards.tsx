import { type ReactNode, useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

export interface Choice<T extends string> {
  value: T;
  title: string;
  /** What choosing this means, in a sentence. */
  description?: string;
  disabled?: boolean;
}

export interface ChoiceCardsProps<T extends string> {
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
}

/** A radio group where every option explains itself. For settings with two or three modes. */
export function ChoiceCards<T extends string>({
  value,
  choices,
  onChange,
  label,
  className,
}: ChoiceCardsProps<T>): ReactNode {
  const baseId = useId();
  return (
    <RadioGroup
      value={value}
      aria-label={label}
      className={cn("grid gap-2", className)}
      onValueChange={(next) => {
        const choice = choices.find((candidate) => candidate.value === next);
        if (choice) onChange(choice.value);
      }}
    >
      {choices.map((choice) => {
        const id = `${baseId}-${choice.value}`;
        return (
          <label
            key={choice.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40",
              value === choice.value && "border-primary/50 bg-primary/5",
              choice.disabled &&
                "cursor-not-allowed opacity-60 hover:border-border hover:bg-transparent",
            )}
          >
            <RadioGroupItem
              id={id}
              value={choice.value}
              disabled={choice.disabled}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{choice.title}</span>
              {choice.description ? (
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {choice.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
