import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Sparkles, Building2, Folder } from "lucide-react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import {
  defaultShouldDehydrateQuery,
  type Query,
} from "@tanstack/react-query";

import { AppSidebar } from "./components/app-sidebar";
import { PlaceholderPage } from "./components/placeholder-page";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { ExplorePage } from "./pages/explore/explore-page";
import { MySkillsPage } from "./pages/my-skills/my-skills-page";
import { SettingsPage } from "./pages/settings/settings-page";

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
 * The full registry index (`skills-index`, the whole parsed ~12MB JSONL) is
 * excluded: it would exceed the WebView's localStorage quota on every write,
 * and it is refetched once per session anyway. Only the bounded queries —
 * explore pages, installed skills, agent status — are persisted.
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

const persistOptions = {
  persister,
  maxAge: Infinity,
  dehydrateOptions: {
    // Large blobs only; see the persister comment above.
    shouldDehydrateQuery: (query: Query) =>
      defaultShouldDehydrateQuery(query) &&
      query.queryKey[0] !== "skills-index",
  },
};

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <HashRouter>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-secondary text-foreground">
          <SidebarProvider
            style={{ minHeight: 0 }}
            className="flex-1 overflow-hidden"
          >
            <AppSidebar />
            <SidebarInset className="overflow-hidden pt-9">
              <WindowTitle />
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/my-skills" replace />}
                />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/my-skills" element={<MySkillsPage />} />
                <Route
                  path="/explore/featured"
                  element={<PlaceholderPage icon={Sparkles} title="精选" />}
                />
                <Route
                  path="/explore/official"
                  element={<PlaceholderPage icon={Building2} title="官方" />}
                />
                <Route
                  path="/my-skills/project"
                  element={<PlaceholderPage icon={Folder} title="项目" />}
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route
                  path="*"
                  element={<Navigate to="/my-skills" replace />}
                />
              </Routes>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </HashRouter>
    </PersistQueryClientProvider>
  );
}
