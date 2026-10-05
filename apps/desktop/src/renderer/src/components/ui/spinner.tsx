import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

interface SpinnerProps extends React.ComponentProps<"svg"> {
  /**
   * Translated text for screen readers, for a spinner that is the only sign of loading. Without
   * it the spinner is decoration (inside a button, or next to text that says what is happening),
   * hidden from them so it does not rename what it sits in.
   */
  label?: string;
}

function Spinner({ className, label, ...props }: SpinnerProps) {
  const a11y = label ? { role: "status", "aria-label": label } : { "aria-hidden": true as const };
  return <Loader2Icon {...a11y} className={cn("size-4 animate-spin", className)} {...props} />;
}

export { Spinner };
