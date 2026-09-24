import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { I18nProvider } from "../i18n/language-provider";

/**
 * Render a component wrapped in a MemoryRouter and a fresh QueryClient so that
 * NavLink / Link / useNavigate and @tanstack/react-query hooks work in
 * isolation tests. Pass an initial route via options.
 */
export function renderWithRouter(
  ui: ReactElement,
  { route = "/", ...options }: { route?: string } & RenderOptions = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    ),
    ...options,
  });
}

export * from "@testing-library/react";
