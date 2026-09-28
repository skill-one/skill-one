// Maps every agent (identified by the `name` field from agents-skills) to its
// brand icon, served from /agent-icons/<file>. Two sources only:
//
// 1. LobeHub's static-svg assets (`.svg`, copied into this directory) —
//    preferred: colored (`-color`) icons with monochrome (`.svg`) fallbacks.
// 2. GitHub organization avatars (`.png`, vendored from
//    `avatars.githubusercontent.com/<org>`) — for the long tail of coding
//    agents that no icon set covers. Accounts whose avatar is a generic
//    identicon or a personal picture were rejected: a wrong-looking icon is
//    worse than the Bot fallback.
//
// Agents with neither source fall back to a generic Bot glyph in the
// AgentIcon component.

// Icon file per brand — one entry per distinct piece of artwork. Variant
// agents (region-locked or CLI editions of the same product) are not repeated
// here; they alias to their parent brand in BRAND_BY_AGENT below.
const ICON_BY_BRAND = {
  "aider-desk": "/agent-icons/aider-desk.png", // github.com/Aider-AI
  amp: "/agent-icons/amp-color.svg",
  antigravity: "/agent-icons/antigravity-color.svg",
  astrbot: "/agent-icons/astrbot.png", // github.com/AstrBotDevs
  augment: "/agent-icons/augment.png", // github.com/AugmentCode
  "claude-code": "/agent-icons/claudecode-color.svg",
  cline: "/agent-icons/cline.svg",
  "codearts-agent": "/agent-icons/huawei-color.svg", // vendor logo (Huawei)
  codebuddy: "/agent-icons/codebuddy-color.svg",
  codex: "/agent-icons/codex-color.svg",
  "command-code": "/agent-icons/commandcode.svg",
  comate: "/agent-icons/comate.png", // vendor logo (github.com/baidu)
  continue: "/agent-icons/continue.png", // github.com/continuedev
  cortex: "/agent-icons/cortex.png", // github.com/cortexapps
  crush: "/agent-icons/crush.png", // github.com/charmbracelet (mascot)
  cursor: "/agent-icons/cursor.svg",
  deepagents: "/agent-icons/deepagents.png", // vendor logo (github.com/langchain-ai)
  devin: "/agent-icons/devin-color.svg",
  dexto: "/agent-icons/dexto.png", // github.com/traceloop
  droid: "/agent-icons/droid.png", // github.com/Factory-AI
  eve: "/agent-icons/eve.png", // vendor logo (github.com/vercel)
  firebender: "/agent-icons/firebender.png", // github.com/firebender
  forgecode: "/agent-icons/forgecode.png", // github.com/antinomyhq
  "gemini-cli": "/agent-icons/geminicli-color.svg",
  "github-copilot": "/agent-icons/githubcopilot.svg",
  goose: "/agent-icons/goose.svg",
  grok: "/agent-icons/grok.svg",
  "hermes-agent": "/agent-icons/hermesagent.svg",
  "inference-sh": "/agent-icons/inference.svg",
  "iflow-cli": "/agent-icons/iflow-cli.png", // github.com/iflow-ai
  junie: "/agent-icons/junie-color.svg",
  kilo: "/agent-icons/kilocode.svg",
  "kimi-code-cli": "/agent-icons/kimi-color.svg",
  "kiro-cli": "/agent-icons/kiro-color.svg",
  kode: "/agent-icons/kode.png", // github.com/kode-ai
  "qwen-code": "/agent-icons/qwen-color.svg", // vendor logo (Alibaba)
  lmstudio: "/agent-icons/lmstudio.svg",
  "minimax-code": "/agent-icons/minimax-color.svg",
  "mistral-vibe": "/agent-icons/mistral-color.svg",
  mcpjam: "/agent-icons/mcpjam.png", // github.com/MCPJam
  opencode: "/agent-icons/opencode.svg",
  openclaw: "/agent-icons/openclaw-color.svg",
  openhands: "/agent-icons/openhands-color.svg",
  pi: "/agent-icons/pi.svg",
  "posit-assistant": "/agent-icons/posit-assistant.png", // vendor logo (github.com/posit-dev)
  qoder: "/agent-icons/qoder-color.svg",
  replit: "/agent-icons/replit-color.svg",
  roo: "/agent-icons/roocode.svg",
  "tabnine-cli": "/agent-icons/tabnine-cli.png", // github.com/tabnine
  trae: "/agent-icons/trae-color.svg",
  warp: "/agent-icons/warp.png", // github.com/warpdotdev
  windsurf: "/agent-icons/windsurf.svg",
  workbuddy: "/agent-icons/workbuddy-color.svg",
  zed: "/agent-icons/zed.png", // github.com/zed-industries
  zencoder: "/agent-icons/zencoder-color.svg",
};

// Variant agents inherit their parent brand's icon. Values are typed against
// ICON_BY_BRAND's keys, so an alias to a removed brand fails to compile.
const BRAND_BY_AGENT: Readonly<Record<string, keyof typeof ICON_BY_BRAND>> = {
  "antigravity-cli": "antigravity",
  lingma: "qwen-code",
  "qoder-cn": "qoder",
  qwenwork: "qwen-code",
  qwenworkcn: "qwen-code",
  "trae-cn": "trae",
  "workbuddy-ai": "workbuddy",
};

export const AGENT_ICON_BY_NAME: Record<string, string> = {
  ...ICON_BY_BRAND,
  ...Object.fromEntries(
    Object.entries(BRAND_BY_AGENT).map(([agent, brand]) => [
      agent,
      ICON_BY_BRAND[brand],
    ]),
  ),
};

export function getAgentIconUrl(name: string): string | undefined {
  return AGENT_ICON_BY_NAME[name];
}

// How AgentIcon must treat a given icon file's artwork. Files without an
// entry render as-is. Two traits, each verified by actually rendering the
// asset on both backgrounds (fill heuristics lie — white/black paths may be
// covered layers or mere outlines):
//
// - `mono`: drawn as a monochrome `currentColor` glyph. As an `<img>` source
//   it loses the page's CSS context and resolves to black — invisible on the
//   dark surface. AgentIcon inverts it in dark mode (black → white).
// - `ground`: surface-bound artwork that must be painted on a fixed
//   contrasting ground in both modes. Currently only Kimi: a white "K" on a
//   transparent background that vanishes on light backgrounds, leaving just
//   its blue accent.
const FILE_TRAITS: Readonly<Record<string, { mono?: true; ground?: "dark" | "light" }>> = {
  "/agent-icons/cline.svg": { mono: true },
  "/agent-icons/commandcode.svg": { mono: true },
  "/agent-icons/cursor.svg": { mono: true },
  "/agent-icons/githubcopilot.svg": { mono: true },
  "/agent-icons/goose.svg": { mono: true },
  "/agent-icons/grok.svg": { mono: true },
  "/agent-icons/hermesagent.svg": { mono: true },
  "/agent-icons/inference.svg": { mono: true },
  "/agent-icons/kimi-color.svg": { ground: "dark" },
  "/agent-icons/kilocode.svg": { mono: true },
  "/agent-icons/lmstudio.svg": { mono: true },
  "/agent-icons/opencode.svg": { mono: true },
  "/agent-icons/pi.svg": { mono: true },
  "/agent-icons/roocode.svg": { mono: true },
  "/agent-icons/windsurf.svg": { mono: true },
};

/** Whether the agent's brand icon is a monochrome glyph that needs a dark-mode inversion. */
export function isMonochromeAgentIcon(name: string): boolean {
  return FILE_TRAITS[AGENT_ICON_BY_NAME[name] ?? ""]?.mono === true;
}

/** The contrasting ground the agent's icon must be painted on, if any. */
export function agentIconGround(name: string): "dark" | "light" | undefined {
  return FILE_TRAITS[AGENT_ICON_BY_NAME[name] ?? ""]?.ground;
}
