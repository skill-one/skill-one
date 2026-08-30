import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import { createQueryClient } from "../lib/query-client";
import { PopoverPage } from "./popover-page";
import "./../index.css";

/**
 * Entry for the menu bar popover window: a lightweight subset of the app —
 * no router, no sidebar — reading the same queries (installed skills, agent
 * status) as the main window.
 */
const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById("popover-root")!).render(
  <QueryClientProvider client={queryClient}>
    <PopoverPage />
  </QueryClientProvider>,
);
