import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { ThemeProvider } from "../components/theme-provider";
import { createQueryClient } from "../lib/query-client";
import { PopoverPage } from "./popover-page";
import "./../index.css";

/**
 * Entry for the menu bar popover window. This is a separate HTML document
 * with its own `<html>`, so the theme provider is mounted here too.
 */
const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("popover-root")!).render(
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <PopoverPage />
    </QueryClientProvider>
  </ThemeProvider>,
);
