import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "@/components/providers/AppProviders";
import { routeTree } from "./routeTree.gen";
import "./styles/globals.css";

const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function start(): Promise<void> {
  // Plain-browser preview only: the guard lets the bundler drop the mock from production builds.
  if (import.meta.env.DEV && !window.skillboard) {
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
