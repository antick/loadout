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
import { PathList } from "@/components/PathList";

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
            <PathList paths={items} max={MAX_LISTED_ITEMS} className="max-h-48 overflow-y-auto" />
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
