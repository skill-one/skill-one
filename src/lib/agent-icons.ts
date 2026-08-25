// Maps every agent (identified by the `name` field from agents-skills) to its
// brand icon, served from /agent-icons/<file>.svg (copied from LobeHub's
// static-svg assets). Colored (`-color`) icons are preferred; monochrome
// (`.svg`) icons are used as a fallback; agents with no icon fall back to a
// generic Bot glyph in the AgentIcon component.
export const AGENT_ICON_BY_NAME: Record<string, string> = {
  amp: "/agent-icons/amp-color.svg",
  antigravity: "/agent-icons/antigravity-color.svg",
  "antigravity-cli": "/agent-icons/antigravity-color.svg",
  "claude-code": "/agent-icons/claudecode-color.svg",
  cline: "/agent-icons/cline.svg",
  codebuddy: "/agent-icons/codebuddy-color.svg",
  codex: "/agent-icons/codex-color.svg",
  cursor: "/agent-icons/cursor.svg",
  devin: "/agent-icons/devin-color.svg",
  "gemini-cli": "/agent-icons/geminicli-color.svg",
  "github-copilot": "/agent-icons/githubcopilot.svg",
  goose: "/agent-icons/goose.svg",
  grok: "/agent-icons/grok.svg",
  "hermes-agent": "/agent-icons/hermesagent.svg",
  junie: "/agent-icons/junie-color.svg",
  kilo: "/agent-icons/kilocode.svg",
  "kimi-code-cli": "/agent-icons/kimi-color.svg",
  "kiro-cli": "/agent-icons/kiro-color.svg",
  lingma: "/agent-icons/qwen-color.svg",
  "minimax-code": "/agent-icons/minimax-color.svg",
  "mistral-vibe": "/agent-icons/mistral-color.svg",
  opencode: "/agent-icons/opencode.svg",
  pi: "/agent-icons/pi.svg",
  qoder: "/agent-icons/qoder-color.svg",
  "qoder-cn": "/agent-icons/qoder-color.svg",
  "qwen-code": "/agent-icons/qwen-color.svg",
  replit: "/agent-icons/replit-color.svg",
  roo: "/agent-icons/roocode.svg",
  trae: "/agent-icons/trae-color.svg",
  "trae-cn": "/agent-icons/trae-color.svg",
  windsurf: "/agent-icons/windsurf.svg",
  workbuddy: "/agent-icons/workbuddy-color.svg",
  zencoder: "/agent-icons/zencoder-color.svg",
};

export function getAgentIconUrl(name: string): string | undefined {
  return AGENT_ICON_BY_NAME[name];
}
