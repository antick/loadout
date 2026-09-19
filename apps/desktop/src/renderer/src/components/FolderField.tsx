import { FolderOpen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePickFolder } from "@/hooks/mutations/library";

export interface FolderFieldProps {
  id: string;
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  /** Title of the OS folder dialog. */
  pickerTitle?: string;
  disabled?: boolean;
}

/** A folder path you can type or pick: mono input plus a Browse button that opens the OS dialog. */
export function FolderField({
  id,
  value,
  onChange,
  placeholder,
  pickerTitle,
  disabled,
}: FolderFieldProps): ReactNode {
  const { t } = useTranslation();
  const pickFolder = usePickFolder();
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || pickFolder.isPending}
        onClick={() =>
          pickFolder.mutate(pickerTitle, {
            onSuccess: (path) => {
              if (path) onChange(path);
            },
          })
        }
      >
        {pickFolder.isPending ? <Spinner /> : <FolderOpen />}
        {t("folderField.browse")}
      </Button>
    </div>
  );
}
