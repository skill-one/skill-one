import { useLocation } from "react-router-dom";
import { Download } from "lucide-react";

import { isTauri } from "../lib/tauri";

/** Route path -> window title shown in the title bar. */
const PAGE_TITLES: Record<string, string> = {
  "/explore": "添加 Skills",
  "/my-skills": "我的 Skills",
  "/tags": "标签",
  "/tools": "工具",
  "/updates": "更新",
  "/settings": "设置",
};

/**
 * macOS-style title bar.
 *
 * In Tauri, `titleBarStyle: "Overlay"` + `hiddenTitle: true` renders the native
 * traffic lights over the webview's top-left; we reserve left padding for them
 * and mark the bar as a drag region. In a plain browser preview (no native
 * lights) we render faux lights so the layout still reads correctly.
 *
 * The centered label follows the active route (falling back to the app name),
 * so it complements — rather than duplicates — the sidebar brand block.
 */
export function TitleBar() {
  const tauri = isTauri();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? "Skillone";

  return (
    <header
      data-tauri-drag-region
      className="relative flex h-[52px] shrink-0 items-center justify-center border-b border-border/70 bg-background/70 backdrop-blur-md"
      style={{ paddingLeft: tauri ? 80 : undefined }}
    >
      {!tauri && (
        <div className="absolute left-3 flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
          <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
          <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        </div>
      )}

      <h1 className="text-[13px] font-semibold tracking-tight text-foreground">
        {title}
      </h1>

      <div className="absolute right-4 flex items-center gap-1.5 text-muted-foreground">
        <span className="text-[11px] font-medium tabular-nums">v0.0.0</span>
        <Download className="h-3.5 w-3.5" />
      </div>
    </header>
  );
}
