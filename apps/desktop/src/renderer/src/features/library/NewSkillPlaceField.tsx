import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { AgentTargetChips } from "@/components/AgentTargetChips";
import { OptionSelect } from "@/components/OptionSelect";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { LIBRARY_PLACE } from "./new-skill-place";
import type { NewSkillPlace } from "./use-new-skill-place";

/** "Create in": the library or a project, and for a project the agent folders that get it. */
export function NewSkillPlaceField({ place }: { place: NewSkillPlace }): ReactNode {
  const { t } = useTranslation();
  const id = useId();
  const options = [LIBRARY_PLACE, ...place.projects.map((project) => project.id)];
  const labelOf = (option: string): string =>
    option === LIBRARY_PLACE
      ? t("library.create.place.library")
      : (place.projects.find((project) => project.id === option)?.name ?? option);
  const noAgents = place.project && place.ready && place.targets.length === 0;

  return (
    <Field data-invalid={noAgents || undefined}>
      <FieldLabel htmlFor={id}>{t("library.create.place.label")}</FieldLabel>
      <OptionSelect
        id={id}
        value={place.placeId}
        options={options}
        labelOf={labelOf}
        onChange={place.setPlaceId}
      />
      {place.chips.length > 0 ? (
        <AgentTargetChips
          label={t("library.create.place.agents")}
          chips={place.chips}
          selected={place.selected}
          onChange={place.setSelected}
        />
      ) : null}
      {noAgents ? (
        <FieldError>
          {t(
            place.chips.length > 0
              ? "library.create.place.pickAgent"
              : "library.create.place.noAgents",
          )}
        </FieldError>
      ) : (
        <FieldDescription>
          {t(
            place.project ? "library.create.place.projectHint" : "library.create.place.libraryHint",
          )}
        </FieldDescription>
      )}
    </Field>
  );
}
