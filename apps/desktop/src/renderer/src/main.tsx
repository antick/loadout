import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/components/providers/AppProviders";
import { applyAppearance, restoreAppearance } from "@/lib/appearance";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Colours of the last run, before anything is drawn; settings confirm them once they load.
applyAppearance(restoreAppearance());

async function start(): Promise<void> {
  // Plain-browser preview only: the guard lets the bundler drop the mock from production builds.
  if (import.meta.env.DEV && !window.loadout) {
    const { installDevMock } = await import("@/lib/dev-mock");
    installDevMock();
  }

  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element.");
  createRoot(root).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void start();
