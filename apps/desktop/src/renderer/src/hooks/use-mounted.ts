import { type RefObject, useEffect, useRef } from "react";

/** Whether the component is still on screen, for work that outlives it, such as an awaited call. */
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
