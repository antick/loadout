import type { AppEventName } from "@loadout/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { LibraryBanners } from "@/features/library/LibraryBanners";
import { subscribeAppEvents } from "@/lib/events";

const BROWSER_GC_MS = 5 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the background update banner", () => {
  it("shows a round that ran while the Library was not open, even much later", () => {
    vi.useFakeTimers();
    // The main process, as the preload bridge passes its events on.
    let send!: (event: AppEventName, payload: unknown) => void;
    vi.stubGlobal("window", {
      loadout: {
        on: (listener: typeof send) => {
          send = listener;
          return () => undefined;
        },
      },
    });
    // A browser's clean-up time for unused data (a test runs as a server, which never cleans up).
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: BROWSER_GC_MS } } });
    const unsubscribe = subscribeAppEvents(queryClient, () => undefined);

    // On the Dashboard: no banner is mounted when the round reports.
    send("updates:auto-ran", { ranAt: Date.now(), updated: 2, available: 1, failed: 0, added: 0 });
    vi.advanceTimersByTime(HOUR_MS);
    unsubscribe();
    vi.unstubAllGlobals();

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <LibraryBanners duplicateCount={0} onReviewDuplicates={() => undefined} />
      </QueryClientProvider>,
    );
    expect(html).toContain("Background update check ran");
    expect(html).toContain("2 updated, 1 waiting, 0 failed");
  });
});
