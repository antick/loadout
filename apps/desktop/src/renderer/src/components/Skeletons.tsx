import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** `count` placeholder blocks of one shape, while a list loads. The caller lays them out. */
export function Skeletons({ count, className }: { count: number; className?: string }): ReactNode {
  return Array.from({ length: count }, (_, index) => (
    <Skeleton key={index} className={className} />
  ));
}
