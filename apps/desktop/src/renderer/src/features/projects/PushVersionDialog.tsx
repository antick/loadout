import { type SkillVersion, formatRelative } from "@loadout/shared";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChoiceCards } from "@/components/ChoiceCards";
import { DiffView } from "@/components/DiffView";
import { OptionSelect } from "@/components/OptionSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { type ProjectSkillRef, usePushToLibrary } from "@/hooks/mutations/project-detail";

export interface VersionChoice {
  ref: ProjectSkillRef;
  versions: SkillVersion[];
}

export interface PushVersionDialogProps {
  /** Null keeps the dialog closed. */
  choice: VersionChoice | null;
  onClose(): void;
}

const agentsOf = (version: SkillVersion): string =>
  version.agents.map((agent) => agent.agentName).join(", ");

/** The newest copy that is not already the library's, which is most likely the one meant. */
function preferred(versions: readonly SkillVersion[]): SkillVersion | undefined {
  return versions.find((version) => !version.matchesLibrary) ?? versions[0];
}

function VersionForm({ choice, onClose }: { choice: VersionChoice; onClose(): void }): ReactNode {
  const { t } = useTranslation();
  const realignId = useId();
  const push = usePushToLibrary();
  const { ref, versions } = choice;
  const [chosenId, setChosenId] = useState(() => preferred(versions)?.id ?? "");
  const [otherId, setOtherId] = useState<string | null>(null);
  const [realign, setRealign] = useState(true);

  const chosen = versions.find((version) => version.id === chosenId);
  const others = versions.filter((version) => version.id !== chosenId);
  // Compare with the library's copy when there is one: that is what the push would change.
  const other =
    others.find((version) => version.id === otherId) ??
    others.find((version) => version.matchesLibrary) ??
    others[0];
  const otherAgents = others.map(agentsOf).join(", ");

  const confirm = (): void => {
    push.mutate(
      { ...ref, options: { version: chosenId, realign } },
      { onSuccess: (result) => (result.conflictingVariants === 0 ? onClose() : undefined) },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("projectPage.chooseVersion.title", { name: ref.name })}</DialogTitle>
        <DialogDescription>{t("projectPage.chooseVersion.description")}</DialogDescription>
      </DialogHeader>

      <ChoiceCards
        label={t("projectPage.chooseVersion.label")}
        value={chosenId}
        onChange={setChosenId}
        className="max-h-56 overflow-y-auto"
        choices={versions.map((version) => ({
          value: version.id,
          title: agentsOf(version),
          description: [
            version.changedAt === null
              ? null
              : t("projectPage.chooseVersion.changed", { when: formatRelative(version.changedAt) }),
            t("projectPage.chooseVersion.files", { count: version.fileCount }),
            version.matchesLibrary ? t("projectPage.chooseVersion.sameAsLibrary") : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }))}
      />

      {chosen && other ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="flex gap-4 text-xs text-muted-foreground">
              <span>
                <span className="font-mono text-danger">-</span> {agentsOf(other)}
              </span>
              <span>
                <span className="font-mono text-success">+</span>{" "}
                {t("projectPage.chooseVersion.chosen")}
              </span>
            </p>
            {others.length > 1 ? (
              <OptionSelect
                value={other.id}
                options={others.map((version) => version.id)}
                labelOf={(id) => agentsOf(others.find((version) => version.id === id) ?? other)}
                onChange={setOtherId}
                ariaLabel={t("projectPage.chooseVersion.compare")}
                className="h-7 w-auto max-w-56 text-xs"
              />
            ) : null}
          </div>
          {chosen.document === other.document ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("projectPage.chooseVersion.documentSame", { document: chosen.documentName })}
            </p>
          ) : (
            <DiffView before={other.document} after={chosen.document} className="max-h-[36vh]" />
          )}
        </div>
      ) : null}

      <label htmlFor={realignId} className="flex cursor-pointer items-start gap-3 text-sm">
        <Checkbox
          id={realignId}
          checked={realign}
          onCheckedChange={(checked) => setRealign(checked === true)}
          className="mt-0.5"
        />
        <span className="min-w-0">
          <span className="block font-medium">{t("projectPage.chooseVersion.realign")}</span>
          <span className="block text-muted-foreground">
            {t(
              realign
                ? "projectPage.chooseVersion.realignHint"
                : "projectPage.chooseVersion.keepHint",
              {
                agents: otherAgents,
              },
            )}
          </span>
        </span>
      </label>

      <DialogFooter>
        <Button variant="outline" disabled={push.isPending} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button disabled={push.isPending || !chosen} onClick={confirm}>
          {push.isPending ? <Spinner /> : null}
          {t("projectPage.chooseVersion.confirm")}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * A skill's copies in the project differ, so which one the library gets is the user's call.
 * Lists the versions with the agents that hold each, shows how they differ, and pushes the pick.
 */
export function PushVersionDialog({ choice, onClose }: PushVersionDialogProps): ReactNode {
  return (
    <Dialog open={choice !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="min-w-0 sm:max-w-2xl">
        {choice ? (
          <VersionForm key={choice.ref.relativePath} choice={choice} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
