import { Suspense, lazy, useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { listen } from "@tauri-apps/api/event";
import { HashRouter, Routes, Route, Navigate, useNavigate } from "react-router";

import { AppHeader } from "./components/app-header";
import { UpdateDialog } from "./components/update-dialog";
import { Toaster } from "./components/ui/toast";
import { TooltipProvider } from "./components/ui/tooltip";
import { useAutoLinkAgents } from "./hooks/use-auto-link-agents";
import { useRegistryRefresh } from "./hooks/use-registry-refresh";
import { useScheduledCheck } from "./hooks/use-scheduled-check";
import { createQueryClient } from "./lib/query-client";
import { checkForUpdate } from "./lib/update-store";
import { isTauri } from "./lib/tauri";
import { storage } from "./lib/storage";
import { InstalledPage } from "./pages/installed/installed-page";
import { POPOVER_NAVIGATE_EVENT } from "./popover/popover-events";

/**
 * Route-level code splitting: every page but the landing one ships as its own
 * chunk, so the first paint carries only the shell plus My Skills (where "/"
 * redirects) and the rest are read from the app bundle on navigation.
 */
const ExplorePage = lazy(() =>
  import("./pages/explore/explore-page").then((m) => ({
    default: m.ExplorePage,
  })),
);
const AgentsPage = lazy(() =>
  import("./pages/agents/agents-page").then((m) => ({
    default: m.AgentsPage,
  })),
);

const queryClient = createQueryClient();

/**
 * Persist the query cache to localStorage so small read queries (installed
 * skills, agent status) survive app restarts. `maxAge: Infinity` mirrors
 * `gcTime` above: persisted entries are never discarded for being old, they
 * are always restored and then revalidated when stale (see `staleTime`).
 *
 * The registry lives in the worker (and its own IndexedDB cache), so it
 * never enters this persister — only the bounded queries — installed
 * skills, agent status — are persisted.
 *
 * Reads and writes go through the shared storage guard (see `lib/storage`),
 * which also means the getter is only ever touched inside a method: Node's
 * experimental global `localStorage` warns when read.
 *
 * This is the only localStorage user besides the settings modules: those hold
 * user configuration, this is React Query's cache journal (keyed by the query
 * client), so the two never hold the same fact.
 */
const persister = createSyncStoragePersister({ storage });

const persistOptions = {
  persister,
  maxAge: Infinity,
};

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      {/* One app-level tooltip delay group: Base UI's provider backs a
          floating-ui FloatingDelayGroup, and more than one of them in a tree
          breaks hover-open for every tooltip but the group's own. */}
      <TooltipProvider delay={300}>
        <HashRouter>
          <PopoverNavigation />
          <AppUpdateWatcher />
          <RegistryAutoRefresh />
          <AgentAutoLink />
          <UpdateDialog />
          <Toaster />
          <div className="flex h-screen w-screen flex-col overflow-hidden bg-secondary text-foreground">
            <AppHeader />
            {/* Each page owns the scroll container of its own list, so the shell
              only has to hand the routes the window's remaining space. */}
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
              <Suspense fallback={null}>
                <Routes>
                  {/* The home is the agents graph: every detected agent drawn
                      into the SkillOne hub — the app's core job made visible,
                      which is what its mark stands for and where the brand in
                      the header leads. */}
                  <Route path="/" element={<AgentsPage />} />
                  <Route path="/explore" element={<ExplorePage />} />
                  {/* Both lists ask their own question from their own first
                      row, and each answers from its own source: the store's
                      field searches the registry, the installed list's searches
                      what this machine has (see `ListToolbar`). */}
                  <Route path="/installed" element={<InstalledPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </main>
          </div>
        </HashRouter>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
}

/**
 * Menu bar popover → main window routing. The popover asks Rust to show +
 * focus this window (native side) and emits the target path; this listener
 * performs the actual navigation.
 */
function PopoverNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<{ path: string }>(POPOVER_NAVIGATE_EVENT, (event) =>
      navigate(event.payload.path),
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [navigate]);
  return null;
}

/**
 * Automatic update check: once on startup, again whenever the window becomes
 * visible again, and hourly as a fallback for a session that stays hidden. The
 * store collapses all three into one request per interval, so the timer costs
 * nothing. Failures stay quiet here — the settings popover surfaces them on an
 * explicit manual check.
 */
function AppUpdateWatcher() {
  useScheduledCheck(() => void checkForUpdate(), {
    immediate: true,
    enabled: isTauri(),
  });
  return null;
}

/**
 * Silent in-session freshness: once the last check has gone stale (the
 * sources publish daily), the registry re-checks the published snapshots and
 * pulls in anything new on its own. Nothing is surfaced — the user is never
 * asked to care about this.
 */
function RegistryAutoRefresh() {
  useRegistryRefresh();
  return null;
}

/**
 * Agent links manage themselves: every agent scan links the detected agents
 * that are not excluded in the agent link settings (each agent is attempted
 * once per session). Nothing renders and a successful pass says nothing — see
 * `useAutoLinkAgents`.
 */
function AgentAutoLink() {
  useAutoLinkAgents();
  return null;
}
