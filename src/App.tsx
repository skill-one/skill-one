import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";

import { TitleBar } from "./components/title-bar";
import { AppSidebar } from "./components/app-sidebar";
import { ExplorePage } from "./components/explore-page";
import { MyAgentsPage } from "./components/my-agents-page";
import { MySkillsPage } from "./components/my-skills-page";
import { PlaceholderPage } from "./components/placeholder-page";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";

/**
 * Cached registry data is served for 10 minutes without re-fetching
 * (`staleTime`); beyond that it is shown first and revalidated in the
 * background, and the UI updates to the fresh data when the request lands.
 * Retries are left to the UI's retry button so a network hiccup doesn't pile
 * up hidden requests.
 *
 * `gcTime: Infinity` disables garbage collection: cached pages stay in memory
 * (and in localStorage) forever, so every revisit — including after a restart
 * — paints from cache first and refreshes in the background. Only a manual
 * cache clear ever drops the data.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,
      gcTime: Infinity,
      retry: false,
    },
  },
});

/**
 * Persist the query cache to localStorage so the explore list survives app
 * restarts. `maxAge: Infinity` mirrors `gcTime` above: persisted entries are
 * never discarded for being old, they are always restored and then
 * revalidated when stale (see `staleTime`).
 *
 * The storage adapter accesses `window.localStorage` lazily (inside the
 * methods) so merely wiring up persistence never touches the getter — Node's
 * experimental global localStorage emits an ExperimentalWarning when read.
 */
const persister = createSyncStoragePersister({
  storage: {
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  },
});

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: Infinity }}
    >
      <HashRouter>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-secondary text-foreground">
          <TitleBar />
          {/* The provider defaults to `min-h-svh`; neutralize it so the row
              fits the space below the 52px title bar instead of overflowing. */}
          <SidebarProvider
            style={{ minHeight: 0 }}
            className="flex-1 overflow-hidden"
          >
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
              <Routes>
                <Route path="/" element={<Navigate to="/explore" replace />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/my-skills" element={<MySkillsPage />} />
                <Route path="/my-agents" element={<MyAgentsPage />} />
                <Route path="/tags" element={<PlaceholderPage title="标签" />} />
                <Route path="/tools" element={<PlaceholderPage title="工具" />} />
                <Route
                  path="/updates"
                  element={<PlaceholderPage title="更新" />}
                />
                <Route
                  path="/settings"
                  element={<PlaceholderPage title="设置" />}
                />
                <Route path="*" element={<Navigate to="/explore" replace />} />
              </Routes>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </HashRouter>
    </PersistQueryClientProvider>
  );
}
