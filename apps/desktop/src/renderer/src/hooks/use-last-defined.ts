import { useState } from "react";

/**
 * The value, or the last non-null one once it turns null. Lets a sheet keep drawing its content
 * while it slides out, after the page has already cleared "what is open".
 */
export function useLastDefined<T>(value: T | null): T | null {
  const [last, setLast] = useState(value);
  // Adjusting state while rendering (not in an effect) avoids a frame with the stale value.
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
