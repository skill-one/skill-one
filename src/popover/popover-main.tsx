import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "../lib/query-client";
import { PopoverPage } from "./popover-page";
import "./../index.css";
import "./popover.css";

/**
 * Entry for the menu bar popover window.
 *
 * No theme provider here on purpose: the popover is styled solely off
 * `prefers-color-scheme` (`popover.css`), so its colors always resolve from
 * the same native app appearance as the glass material behind it. The main
 * window's `setTheme` call is app-wide on macOS and already propagates the
 * user's light/dark/system choice to this window.
 */
const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("popover-root")!).render(
  <QueryClientProvider client={queryClient}>
    <PopoverPage />
  </QueryClientProvider>,
);
