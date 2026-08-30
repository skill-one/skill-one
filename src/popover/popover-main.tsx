import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "../lib/query-client";
import { ThemeProvider } from "../components/theme-provider";
import { PopoverPage } from "./popover-page";
import "./../index.css";

/**
 * Entry for the menu bar popover window: a lightweight subset of the app —
 * no router, no sidebar — reading the same queries (installed skills, agent
 * status) as the main window.
 *
 * The theme provider is mounted here too: this is a separate HTML document
 * with its own `<html>`, so without it the popover would stay light.
 */
const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("popover-root")!).render(
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <PopoverPage />
    </QueryClientProvider>
  </ThemeProvider>,
);
