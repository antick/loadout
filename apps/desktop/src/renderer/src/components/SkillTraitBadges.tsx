import {
  runsCode,
  TRAIT_EXAMPLES_MAX,
  type SkillTrait,
  type SkillTraitCode,
} from "@loadout/shared";
import { type LucideIcon, Plug, Terminal, Webhook, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TRAIT_ICONS: Record<SkillTraitCode, LucideIcon> = {
  scripts: Terminal,
  hooks: Webhook,
  mcp: Plug,
  tool_grants: Wrench,
};

/** One trait in the app's words; the core's English `message` is for the CLI. */
export function useTraitText(): (trait: SkillTrait) => string {
  const { t } = useTranslation();
  return (trait) => {
    const extra = Number(trait.params.count ?? 0) - TRAIT_EXAMPLES_MAX;
    const examples =
      trait.code === "scripts" && extra > 0
        ? t("traits.andMore", { examples: trait.params.examples, count: extra })
        : trait.params.examples;
    return t(`traits.code.${trait.code}`, {
      ...trait.params,
      examples,
      defaultValue: trait.message,
    });
  };
}

/** Every trait of a skill as a short list, one sentence each. */
export function SkillTraitList({
  traits,
  className,
}: {
  traits: readonly SkillTrait[];
  className?: string;
}): ReactNode {
  const textOf = useTraitText();
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {traits.map((trait) => {
        const Icon = TRAIT_ICONS[trait.code];
        return (
          <li key={trait.code} data-selectable className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 break-words">{textOf(trait)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export interface SkillTraitBadgesProps {
  traits: readonly SkillTrait[];
  compact?: boolean;
  /** One badge per trait (detail views). Otherwise a single "Runs code" badge, and only when the skill ships code. */
  showAll?: boolean;
}

/**
 * What a skill can make an agent do: a single "Runs code" badge in lists and previews, one badge
 * per trait in a detail view. Information, never a warning: many good skills ship scripts.
 */
export function SkillTraitBadges({ traits, compact, showAll }: SkillTraitBadgesProps): ReactNode {
  const { t } = useTranslation();
  if (traits.length === 0) return null;
  if (showAll) {
    return (
      <>
        {traits.map((trait) => (
          <TraitBadge key={trait.code} trait={trait} compact={compact} />
        ))}
      </>
    );
  }
  if (!runsCode(traits)) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <StatusBadge
            tone="info"
            icon={<Terminal />}
            label={t("traits.runsCode")}
            compact={compact}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        <p className="mb-1">{t("traits.runsCodeHint")}</p>
        <SkillTraitList traits={traits} />
      </TooltipContent>
    </Tooltip>
  );
}

function TraitBadge({ trait, compact }: { trait: SkillTrait; compact?: boolean }): ReactNode {
  const { t } = useTranslation();
  const textOf = useTraitText();
  const Icon = TRAIT_ICONS[trait.code];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <StatusBadge
            tone="info"
            icon={<Icon />}
            label={t(`traits.label.${trait.code}`)}
            compact={compact}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{textOf(trait)}</TooltipContent>
    </Tooltip>
  );
}
