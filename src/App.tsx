import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sparkles, Building2, Folder } from "lucide-react";
import { useEffect } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { AppSidebar } from "./components/app-sidebar";
import { ExplorePage } from "./components/explore-page";
import { MySkillsPage } from "./components/my-skills-page";
import { PlaceholderPage } from "./components/placeholder-page";
import { SettingsPage } from "./components/settings-page";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { isTauri } from "./lib/tauri";

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

/** Route path -> native window title. 尚未实现的页面暂时留空标题。 */
const PAGE_TITLES: Record<string, string> = {
  "/explore": "添加 Skills",
  "/my-skills": "我的 Skills",
  "/settings": "设置",
};

/**
 * Drag strip across the top of the content column (the Overlay title bar has
 * no native bar to drag from). The whole strip is marked as a drag region so
 * the window can be moved, and the current page name is centered on top of it
 * (traffic-light zone on the left is not clickable). The native window title
 * is still synced for Mission Control (no-op in browser).
 */
function WindowTitle() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? "";

  useEffect(() => {
    if (isTauri()) {
      void getCurrentWindow().setTitle(title);
    }
  }, [title]);

  return (
    <div
      data-tauri-drag-region
      className="absolute inset-x-0 top-0 flex h-9 items-center justify-center"
    >
      <span
        data-tauri-drag-region
        className="text-[13px] font-medium text-muted-foreground"
      >
        {title}
      </span>
    </div>
  );
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: Infinity }}
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
