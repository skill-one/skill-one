import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "./components/theme-provider";
import { I18nProvider } from "./i18n/language-provider";
import { initRegistry } from "./lib/registry/client";
import App from "./App";
import "./index.css";

// Boot the registry worker before the first paint: the index download (and
// the IndexedDB cold-start cache) starts immediately, so the store page is
// already streaming data by the time the user opens it.
initRegistry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>
);
