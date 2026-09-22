import type { ThemeSetting } from "@loadout/shared";
import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { STATUS_BAR_ITEM_CLASS } from "@/components/layout/status-bar/StatusBarItem";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { THEME_OPTIONS } from "@/features/settings/constants";
import { useSetSetting } from "@/hooks/mutations/settings";
import { cn } from "@/lib/utils";

const THEME_ICONS: Record<ThemeSetting, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

function isTheme(value: string): value is ThemeSetting {
  return THEME_OPTIONS.some((option) => option === value);
}

/** Theme picker at the right end of the status bar: system, light or dark. */
export function ThemeMenu(): ReactNode {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const setSetting = useSetSetting();
  const Icon = THEME_ICONS[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("statusBar.theme.label")}
        className={cn(STATUS_BAR_ITEM_CLASS, "text-muted-foreground hover:text-foreground")}
      >
        <Icon />
        <span>{t(`statusBar.theme.${theme}`)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-44">
        <DropdownMenuLabel>{t("statusBar.theme.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isTheme(value)) setSetting.mutate({ key: "theme", value });
          }}
        >
          {THEME_OPTIONS.map((option) => {
            const OptionIcon = THEME_ICONS[option];
            return (
              <DropdownMenuRadioItem key={option} value={option}>
                <OptionIcon />
                {t(`statusBar.theme.${option}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
