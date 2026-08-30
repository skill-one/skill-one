import { useEffect } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { listen } from "@tauri-apps/api/event";
import { Building2, Folder } from "lucide-react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router";
import {
  defaultShouldDehydrateQuery,
  type Query,
} from "@tanstack/react-query";

import { AppSidebar } from "./components/app-sidebar";
import { PlaceholderPage } from "./components/placeholder-page";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import { createQueryClient } from "./lib/query-client";
import { isTauri } from "./lib/tauri";
import { ExplorePage } from "./pages/explore/explore-page";
import { FeaturedPage } from "./pages/explore/featured/featured-page";
import { MySkillsPage } from "./pages/my-skills/my-skills-page";
import { SettingsPage } from "./pages/settings/settings-page";
import { POPOVER_NAVIGATE_EVENT } from "./popover/popover-events";

const queryClient = createQueryClient();

/**
 * Persist the query cache to localStorage so small read queries (installed
 * skills, agent status) survive app restarts. `maxAge: Infinity` mirrors
 * `gcTime` above: persisted entries are never discarded for being old, they
 * are always restored and then revalidated when stale (see `staleTime`).
 *
 * The full registry index is excluded — the explore page's `skills` entry
 * stores the whole parsed ~12MB JSONL: it would exceed the WebView's
 * localStorage quota on every write, and it is refetched once per session
 * anyway. Only the bounded queries — installed skills, agent status — are
 * persisted.
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
      query.queryKey[0] !== "skills",
  },
};

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <HashRouter>
        <PopoverNavigation />
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-secondary text-foreground">
          <SidebarProvider
            style={{ minHeight: 0 }}
            className="flex-1 overflow-hidden"
          >
            <AppSidebar />
            <SidebarInset className="overflow-hidden">
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/my-skills" replace />}
                />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/my-skills" element={<MySkillsPage />} />
                <Route
                  path="/explore/featured"
                  element={<FeaturedPage />}
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

/**
 * Menu bar popover → main window routing. The popover asks Rust to show +
 * focus this window (native side) and emits the target path; this listener
 * performs the actual navigation.
 */
function PopoverNavigation() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<{ path: string }>(
      POPOVER_NAVIGATE_EVENT,
      (event) => navigate(event.payload.path),
    );
    return () => {
      void unlisten.then((dispose) => dispose());
    };
  }, [navigate]);
  return null;
}
