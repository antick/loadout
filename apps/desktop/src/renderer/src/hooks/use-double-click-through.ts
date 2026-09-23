import type { SkillLocation } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { DOUBLE_CLICK_WINDOW_MS } from "@/lib/constants";
import { editLink, locationKey } from "@/lib/skill-location";

/** Radix's pointer-down-outside event. */
interface OutsidePointerEvent {
  preventDefault(): void;
}

/**
 * Double-clicking a skill item opens it in the editor. The first click already opened the
 * skill's detail sheet, so the second one lands on the sheet's backdrop. Give this to the sheet's
 * `onPointerDownOutside`: a click there right after the sheet opened opens the editor instead of
 * closing the sheet. (A pointer-down carries no click count, so timing is the only signal.)
 */
export function useDoubleClickThrough(
  location: SkillLocation | null | undefined,
): (event: OutsidePointerEvent) => void {
  const navigate = useNavigate();
  const openedAt = useRef(0);
  const key = location ? locationKey(location) : null;
  useEffect(() => {
    if (key) openedAt.current = Date.now();
  }, [key]);

  return useCallback(
    (event: OutsidePointerEvent) => {
      if (!location || Date.now() - openedAt.current > DOUBLE_CLICK_WINDOW_MS) return;
      event.preventDefault();
      void navigate(editLink(location));
    },
    [location, navigate],
  );
}
