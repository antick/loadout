import { type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";
import { PageHeaderSlotsContext } from "@/components/layout/shell-context";
import { useSidebar } from "@/components/ui/sidebar";

export interface SidebarHeaderPortalProps {
  /** Shown in the title-bar cell above the sidebar while the sidebar is open. */
  header: ReactNode;
  /**
   * Shown in the title bar next to the sidebar toggle while the sidebar is folded away, so the
   * section's buttons stay one click away. Usually the header's buttons without its title.
   */
  folded?: ReactNode;
}

/** Where a sidebar section's name and buttons go in the title bar, open or folded. */
export function SidebarHeaderPortal({ header, folded }: SidebarHeaderPortalProps): ReactNode {
  const slots = useContext(PageHeaderSlotsContext);
  const { open } = useSidebar();
  if (open) return slots.sidebarHeader ? createPortal(header, slots.sidebarHeader) : null;
  return slots.sidebarActions && folded ? createPortal(folded, slots.sidebarActions) : null;
}
