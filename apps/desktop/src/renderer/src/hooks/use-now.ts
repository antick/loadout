import { useEffect, useState } from "react";
import { RELATIVE_TIME_TICK_MS } from "@/lib/constants";

/**
 * The current time, renewed every `intervalMs`, so text such as "5 minutes ago" keeps up while it
 * stays on screen. Pass it to `formatRelative` as `now`.
 */
export function useNow(intervalMs: number = RELATIVE_TIME_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
