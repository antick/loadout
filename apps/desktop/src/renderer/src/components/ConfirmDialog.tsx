import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  /** Say exactly what will happen or be deleted. */
  description?: ReactNode;
  /** Optional list of the things affected (names, paths). */
  items?: readonly string[];
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for deletes. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const MAX_LISTED_ITEMS = 8;

const ConfirmContext = createContext<Confirm | null>(null);

/** Hosts the one confirm dialog of the app. Mounted by `AppProviders`. */
export function ConfirmProvider({ children }: { children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const items = options?.items ?? [];
  const hiddenItems = items.length - MAX_LISTED_ITEMS;
  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => (next ? undefined : settle(false))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild={Boolean(options?.description)}>
              <div className="text-sm text-muted-foreground">{options?.description}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {items.length > 0 ? (
            <ul
              data-selectable
              className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs leading-5 break-all"
            >
              {items.slice(0, MAX_LISTED_ITEMS).map((item) => (
                <li key={item}>{item}</li>
              ))}
              {hiddenItems > 0 ? (
                <li className="font-sans text-muted-foreground">
                  {t("common.andMore", { count: hiddenItems })}
                </li>
              ) : null}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {options?.cancelLabel ?? t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                options?.destructive ? buttonVariants({ variant: "destructive" }) : undefined
              }
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/** Promise-style confirm: `if (await confirm({ title, description, destructive: true })) …`. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  return confirm;
}
