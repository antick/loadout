import { formatRelative, type Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@/components/PageSection";
import { SourceBadge } from "@/components/SourceBadge";
import { RECENT_SKILLS_LIMIT } from "./constants";

/** The skills touched most recently; each opens its detail in the library. */
export function RecentSkills({ skills }: { skills: readonly Skill[] }): ReactNode {
  const { t } = useTranslation();
  const recent = [...skills]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECENT_SKILLS_LIMIT);

  return (
    <PageSection title={t("dashboard.recent.title")}>
      <ul className="flex flex-col divide-y overflow-hidden rounded-lg border bg-card">
        {recent.map((skill) => (
          <li key={skill.id}>
            <Link
              to="/library"
              search={{ skill: skill.id }}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{skill.name}</span>
                  <SourceBadge source={skill.sourceType} compact />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {skill.description ?? t("skills.noDescription")}
                </p>
              </div>
              <time className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {formatRelative(skill.updatedAt)}
              </time>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
