import {
  ApiError,
  type ItemDeployment,
  type ItemPlace,
  type ItemPlaceRef,
  type LibraryItemDetail,
} from "@loadout/shared";
import { Eye, Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { OptionSelect } from "@/components/OptionSelect";
import { PageSection } from "@/components/PageSection";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDeployItem, useUndeployItem } from "@/features/items/item-mutations";
import { useItemPlaces } from "@/features/items/item-queries";
import { useProjects } from "@/hooks/queries/projects";
import { toastError, toastSuccess } from "@/lib/toast";
import { ItemPreviewDialog } from "./ItemPreviewDialog";
import { STATE_TONES } from "./item-text";

type Deploy = (place: ItemPlaceRef, agentName: string) => void;

/** Deploy, asking first before replacing a file Loadout did not write. */
function useDeployAsking(item: LibraryItemDetail): { deploy: Deploy; busy: boolean } {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const mutation = useDeployItem();
  const deploy: Deploy = (place, agentName) => {
    const done = (): void => toastSuccess(t("items.agents.deployed", { agent: agentName }));
    mutation.mutate(
      { ref: item, place },
      {
        onSuccess: done,
        onError: async (error) => {
          const conflict = error instanceof ApiError && error.code === "TARGET_CONFLICT";
          const path = conflict
            ? String((error.details?.conflicts as { path: string }[] | undefined)?.[0]?.path ?? "")
            : "";
          if (!conflict) return toastError(error, "items.errors.deploy");
          const ok = await confirm({
            title: t("items.agents.replaceTitle", { path }),
            description: t("items.agents.replaceDescription", { path }),
            confirmLabel: t("items.agents.replace"),
          });
          if (ok) {
            mutation.mutate(
              { ref: item, place, options: { replace: true } },
              { onSuccess: done, onError: (again) => toastError(again, "items.errors.deploy") },
            );
          }
        },
      },
    );
  };
  return { deploy, busy: mutation.isPending };
}

function StateBadge({ deployment }: { deployment: ItemDeployment | undefined }): ReactNode {
  const { t } = useTranslation();
  if (!deployment) return null;
  return (
    <StatusBadge
      tone={STATE_TONES[deployment.state]}
      label={t(`items.agents.state.${deployment.state}`)}
    />
  );
}

interface GlobalRowProps {
  item: LibraryItemDetail;
  place: ItemPlace;
  deploy: Deploy;
  busy: boolean;
  onPreview: () => void;
}

function GlobalRow({ item, place, deploy, busy, onPreview }: GlobalRowProps): ReactNode {
  const { t } = useTranslation();
  const undeploy = useUndeployItem();
  const ref: ItemPlaceRef = { agentKey: place.agentKey, projectId: null };
  const deployment = item.deployments.find(
    (entry) => entry.agentKey === place.agentKey && entry.projectId === null,
  );
  const usable = place.globalDir !== null && place.installed;
  const note = !place.globalDir
    ? t("items.agents.onlyProjects")
    : !place.installed
      ? t("items.agents.notInstalled")
      : place.globalDir;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <AgentAvatar
        agentKey={place.agentKey}
        name={place.agentName}
        status={deployment ? undefined : "off"}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{place.agentName}</span>
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      </div>
      <StateBadge deployment={deployment} />
      {usable ? (
        <Button size="xs" variant="ghost" onClick={onPreview}>
          <Eye />
          {t("items.agents.preview")}
        </Button>
      ) : null}
      <Switch
        checked={deployment !== undefined}
        disabled={(!usable && !deployment) || busy || undeploy.isPending}
        aria-label={place.agentName}
        onCheckedChange={(on) =>
          on
            ? deploy(ref, place.agentName)
            : undeploy.mutate(
                { ref: item, place: ref },
                {
                  onSuccess: () =>
                    toastSuccess(t("items.agents.removed", { agent: place.agentName })),
                },
              )
        }
      />
    </li>
  );
}

/** Where an item is deployed: each agent's own folder, and inside linked projects. */
export function ItemAgentsTab({ item }: { item: LibraryItemDetail }): ReactNode {
  const { t } = useTranslation();
  const places = useItemPlaces(item.kind);
  const projects = useProjects();
  const undeploy = useUndeployItem();
  const { deploy, busy } = useDeployAsking(item);
  const [preview, setPreview] = useState<ItemPlaceRef | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [agentKey, setAgentKey] = useState<string | null>(null);

  if (places.isPending) return <Skeleton className="h-40 w-full" />;
  if (places.isError)
    return <ErrorState error={places.error} onRetry={() => void places.refetch()} />;

  const sorted = [...places.data].sort(
    (a, b) =>
      Number(b.installed && b.globalDir !== null) - Number(a.installed && a.globalDir !== null),
  );
  const projectPlaces = places.data.filter((place) => place.projectDir !== null);
  const linked = (projects.data ?? []).filter((project) => project.type === "project");
  const chosenProject = linked.find((project) => project.id === projectId) ?? linked[0];
  const chosenAgent =
    projectPlaces.find((place) => place.agentKey === agentKey) ?? projectPlaces[0];
  const nameOf = (key: string): string =>
    places.data.find((place) => place.agentKey === key)?.agentName ?? key;
  const projectNameOf = (id: string | null): string =>
    (projects.data ?? []).find((project) => project.id === id)?.name ?? id ?? "";
  const inProjects = item.deployments.filter((entry) => entry.projectId !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageSection title={t("items.agents.global")} description={t("items.agents.globalHint")}>
        <ul className="divide-y rounded-lg border">
          {sorted.map((place) => (
            <GlobalRow
              key={place.agentKey}
              item={item}
              place={place}
              deploy={deploy}
              busy={busy}
              onPreview={() => setPreview({ agentKey: place.agentKey, projectId: null })}
            />
          ))}
        </ul>
      </PageSection>

      <PageSection title={t("items.agents.projects")} description={t("items.agents.projectsHint")}>
        {inProjects.length > 0 ? (
          <ul className="mb-3 divide-y rounded-lg border">
            {inProjects.map((entry) => (
              <li
                key={`${entry.agentKey}/${entry.projectId}`}
                className="flex items-center gap-3 px-3 py-2"
              >
                <AgentAvatar agentKey={entry.agentKey} name={nameOf(entry.agentKey)} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">
                    {projectNameOf(entry.projectId)} · {nameOf(entry.agentKey)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{entry.path}</span>
                </div>
                <StateBadge deployment={entry} />
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={t("items.agents.remove")}
                  disabled={undeploy.isPending}
                  onClick={() => undeploy.mutate({ ref: item, place: entry })}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {projectPlaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("items.agents.noProjectAgents")}</p>
        ) : linked.length === 0 || !chosenProject || !chosenAgent ? (
          <p className="text-sm text-muted-foreground">{t("items.agents.noProjects")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <OptionSelect
              value={chosenProject.id}
              options={linked.map((project) => project.id)}
              labelOf={projectNameOf}
              onChange={setProjectId}
              ariaLabel={t("items.agents.project")}
              className="w-48"
            />
            <OptionSelect
              value={chosenAgent.agentKey}
              options={projectPlaces.map((place) => place.agentKey)}
              labelOf={nameOf}
              onChange={setAgentKey}
              ariaLabel={t("items.agents.agent")}
              className="w-48"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPreview({ agentKey: chosenAgent.agentKey, projectId: chosenProject.id })
              }
            >
              <Eye />
              {t("items.agents.preview")}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                deploy(
                  { agentKey: chosenAgent.agentKey, projectId: chosenProject.id },
                  `${chosenProject.name} · ${chosenAgent.agentName}`,
                )
              }
            >
              <Plus />
              {t("items.agents.add")}
            </Button>
          </div>
        )}
      </PageSection>

      <ItemPreviewDialog
        item={item}
        place={preview}
        agentName={preview ? nameOf(preview.agentKey) : ""}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}
