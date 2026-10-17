import type { ProjectDuplicatePlan } from "@loadout/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffView } from "@/components/DiffView";
import { ErrorState } from "@/components/ErrorState";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useProjectDocument } from "./project-queries";

/** File comparison includes supporting files; the document diff reuses the project's reader. */
export function ProjectDuplicateComparison({
  plan,
  projectId,
  skill,
}: {
  plan: ProjectDuplicatePlan;
  projectId: string;
  skill: string;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<string | null>(null);
  const base = plan.copies.find((copy) => copy.path === plan.canonicalPath);
  const others = plan.copies.filter((copy) => copy.path !== base?.path);
  const other = others.find((copy) => copy.path === chosen) ?? others[0];
  const before = useProjectDocument(projectId, skill, base?.agentKey);
  const after = useProjectDocument(projectId, skill, other?.agentKey);
  const paths = [...new Set(plan.copies.flatMap((copy) => copy.files.map((file) => file.path)))];
  const changed = paths.filter(
    (path) =>
      new Set(
        plan.copies.map((copy) => copy.files.find((file) => file.path === path)?.hash ?? null),
      ).size > 1,
  );
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-medium">{t("projectDuplicates.changedFiles")}</h3>
      <ul className="list-inside list-disc text-xs break-all">
        {changed.map((path) => (
          <li key={path} className="font-mono">
            {path || "/"}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">{t("projectDuplicates.compareDocument")}</p>
      <div className="flex flex-wrap gap-2">
        {others.map((copy) => (
          <Button
            key={copy.path}
            size="sm"
            variant={copy === other ? "secondary" : "outline"}
            onClick={() => setChosen(copy.path)}
            className="h-auto whitespace-normal break-all"
          >
            {copy.agentName}
          </Button>
        ))}
      </div>
      <p className="text-xs break-all text-muted-foreground">
        {base?.agentName} → {other?.agentName}
      </p>
      {before.error || after.error ? (
        <ErrorState error={before.error ?? after.error} />
      ) : before.isPending || after.isPending ? (
        <Spinner />
      ) : (
        <DiffView before={before.data?.content ?? ""} after={after.data?.content ?? ""} />
      )}
    </section>
  );
}
