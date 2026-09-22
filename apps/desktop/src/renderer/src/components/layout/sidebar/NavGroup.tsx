import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { type SidebarGroupId, STORAGE_KEYS } from "@/lib/constants";

export interface NavGroupProps {
  id: SidebarGroupId;
  label: string;
  /** "+" style button at the right of the label. */
  action?: { label: string; icon: ReactNode; onClick: () => void };
  children: ReactNode;
}

type GroupState = Partial<Record<SidebarGroupId, boolean>>;

/** Collapsible sidebar group whose open state is remembered across restarts. */
export function NavGroup({ id, label, action, children }: NavGroupProps): ReactNode {
  const [groups, setGroups] = usePersistedState<GroupState>(STORAGE_KEYS.sidebarGroups, {});
  const open = groups[id] ?? true;

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setGroups((previous) => ({ ...previous, [id]: next }))}
      className="group/nav-group"
    >
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="gap-1 hover:text-sidebar-foreground">
            <ChevronRight className="size-3! transition-transform duration-150 group-data-[state=open]/nav-group:rotate-90" />
            {label}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        {action ? (
          <SidebarGroupAction
            aria-label={action.label}
            title={action.label}
            onClick={action.onClick}
            className="top-2.5"
          >
            {action.icon}
          </SidebarGroupAction>
        ) : null}
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
