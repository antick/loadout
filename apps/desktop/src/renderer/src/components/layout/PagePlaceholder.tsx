import { Construction } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader, type PageHeaderProps } from "@/components/layout/PageHeader";

/** Titled empty page used by routes whose feature has not been built yet. Delete when unused. */
export function PagePlaceholder(props: PageHeaderProps): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col px-6 py-5">
      <PageHeader {...props} />
      <EmptyState
        icon={Construction}
        title={props.title}
        description={t("shell.placeholder")}
        className="flex-1"
      />
    </div>
  );
}
