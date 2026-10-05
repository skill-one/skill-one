import React, { useState, useMemo } from 'react';
import { translations } from '../i18n/translations';
import { Zap, CheckCircle2 } from 'lucide-react';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

interface HeroAgentGraphProps {
  lang?: 'en' | 'zh';
}

interface DemoAgent {
  id: string;
  name: string;
  icon: string;
  skillsDir: string;
  side: 'left' | 'right';
  row: number; // 0 to 3
  color: string;
}

interface DemoSkill {
  id: string;
  name: string;
  emoji: string;
  domain: string;
  enabled: boolean;
}

const BRAND_COLORS = [
  '#2E7FD9', // blue
  '#2FCB9F', // teal
  '#9535D4', // purple
  '#ED4B8E', // pink
  '#F49B1F', // orange
];

const INITIAL_AGENTS: DemoAgent[] = [
  // Left Column
  { id: 'cursor', name: 'Cursor', icon: `${base}/agents/icons/cursor-color.svg`, skillsDir: '.cursor/skills', side: 'left', row: 0, color: BRAND_COLORS[0] },
  { id: 'claude', name: 'Claude Desktop', icon: `${base}/agents/icons/claudecode-color.svg`, skillsDir: '~/.claude/skills', side: 'left', row: 1, color: BRAND_COLORS[1] },
  { id: 'windsurf', name: 'Windsurf', icon: `${base}/agents/icons/windsurf.svg`, skillsDir: '~/.codeium/windsurf/skills', side: 'left', row: 2, color: BRAND_COLORS[2] },
  { id: 'cline', name: 'Cline', icon: `${base}/agents/icons/cline.svg`, skillsDir: '~/.cline/skills', side: 'left', row: 3, color: BRAND_COLORS[3] },
  // Right Column
  { id: 'antigravity', name: 'Antigravity', icon: `${base}/agents/icons/antigravity-color.svg`, skillsDir: '~/.gemini/config/skills', side: 'right', row: 0, color: BRAND_COLORS[4] },
  { id: 'roocode', name: 'Roo Code', icon: `${base}/agents/icons/roocode.svg`, skillsDir: '~/.roocode/skills', side: 'right', row: 1, color: BRAND_COLORS[0] },
  { id: 'codex', name: 'Codex / Copilot', icon: `${base}/agents/icons/githubcopilot.svg`, skillsDir: '~/.copilot/skills', side: 'right', row: 2, color: BRAND_COLORS[1] },
  { id: 'goose', name: 'Goose', icon: `${base}/agents/icons/goose.svg`, skillsDir: '~/.config/goose/skills', side: 'right', row: 3, color: BRAND_COLORS[2] },
];

const INITIAL_SKILLS: DemoSkill[] = [
  { id: 'shadcn-ui', name: 'shadcn-ui', emoji: '🎨', domain: 'UI Design', enabled: true },
  { id: 'git-workflow', name: 'git-workflow', emoji: '🌿', domain: 'DevOps', enabled: true },
  { id: 'dingtalk-aisearch', name: 'dingtalk-aisearch', emoji: '🔍', domain: 'Search', enabled: true },
  { id: 'guizang-illustration', name: 'guizang-material', emoji: '🖼️', domain: 'Media', enabled: true },
  { id: 'aihot', name: 'aihot', emoji: '🔥', domain: 'News', enabled: true },
  { id: 'code-tester', name: 'test-runner', emoji: '🧪', domain: 'Testing', enabled: true },
  { id: 'media-gen', name: 'media-gen', emoji: '🎬', domain: 'Media', enabled: true },
  { id: 'agy-custom', name: 'customizations', emoji: '⚙️', domain: 'Config', enabled: true },
];

export function HeroAgentGraph({ lang = 'en' }: HeroAgentGraphProps) {
  const t = translations[lang].hub;
  const isZh = lang === 'zh';

  const [skills, setSkills] = useState<DemoSkill[]>(INITIAL_SKILLS);
  const [agents] = useState(INITIAL_AGENTS);
  const [linkedAgentIds, setLinkedAgentIds] = useState<Record<string, boolean>>({
    cursor: true,
    claude: true,
    windsurf: true,
    cline: true,
    antigravity: true,
    roocode: true,
    codex: true,
    goose: true,
  });

  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [broadcastingSkill, setBroadcastingSkill] = useState<string | null>(null);

  const activeSkillsCount = useMemo(() => skills.filter(s => s.enabled).length, [skills]);
  const activeAgentsCount = useMemo(() => Object.values(linkedAgentIds).filter(Boolean).length, [linkedAgentIds]);

  // Handle skill toggle with broadcast animation
  const handleToggleSkill = (skillId: string) => {
    const targetSkill = skills.find(s => s.id === skillId);
    if (!targetSkill) return;

    const willBeEnabled = !targetSkill.enabled;
    setSkills(prev => prev.map(s => s.id === skillId ? { ...s, enabled: willBeEnabled } : s));

    if (willBeEnabled) {
      setBroadcastingSkill(targetSkill.name);
      setTimeout(() => {
        setBroadcastingSkill(null);
      }, 1500);
    }
  };

  // Toggle single agent link
  const handleToggleAgent = (agentId: string) => {
    setLinkedAgentIds(prev => ({
      ...prev,
      [agentId]: !prev[agentId]
    }));
  };

  // Canvas Geometry & Exact Node Alignment matching software's AgentGraph
  const GRAPH_WIDTH = 920;
  const GRAPH_HEIGHT = 440;
  const HUB_CENTER = { x: 460, y: 220 };
  const HUB_HALF_W = 205;
  const HUB_HALF_H = 145;

  const CARD_WIDTH = 180;
  const CARD_HEIGHT = 48;
  const CARD_GAP = 42;
  const START_Y = 38;

  const getNodeY = (row: number) => START_Y + row * (CARD_HEIGHT + CARD_GAP);
  const getNodeCenterY = (row: number) => getNodeY(row) + CARD_HEIGHT / 2;
  // Converge gracefully into central band of Hub card, producing iconic S-curves
  const getHubAnchorY = (row: number) => 152 + row * 34;

  return (
    <div className="w-full max-w-5xl mx-auto select-none">
      {/* Broadcast Live Status Notification */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 shadow-xs backdrop-blur-md text-xs transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className={`absolute inline-flex h-full w-full rounded-full ${broadcastingSkill ? 'bg-amber-400 animate-ping' : 'bg-emerald-500 animate-pulse'}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${broadcastingSkill ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
            {broadcastingSkill ? (
              <span className="text-amber-600 dark:text-amber-400 font-mono font-semibold">
                {isZh ? `⚡ 动效演示 '${broadcastingSkill}' 即刻就绪 (所有智能体共享同一仓库，无需拷贝)...` : `⚡ Visualizing '${broadcastingSkill}' propagation (all agents share the same physical repo)...`}
              </span>
            ) : hoveredAgent ? (
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {(() => {
                  const agent = agents.find(a => a.id === hoveredAgent);
                  const isLinked = agent ? linkedAgentIds[agent.id] : false;
                  return isZh
                    ? `[${agent?.name}] 软链接: ${agent?.skillsDir} ➔ ~/.agents/skills (${isLinked ? '状态: 已穿透直连 · 点击可安全解绑' : '状态: 已断开 · 点击可恢复'})`
                    : `[${agent?.name}] Symlink: ${agent?.skillsDir} ➔ ~/.agents/skills (${isLinked ? 'Active · Click to Unlink' : 'Disconnected · Click to Reconnect'})`;
                })()}
              </span>
            ) : (
              <span>
                {isZh ? '所有智能体共享同一技能仓库 (~/.agents/skills) · 支持商店 / npx / 对话安装' : 'All agents share the same skills repo (~/.agents/skills) · Works with Store, npx & Agent-install'}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono shrink-0">
          <span className="hidden sm:inline">
            {isZh ? '动效便于直观理解多 Agent 即刻就绪' : 'Animation illustrates instant multi-agent readiness'}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 font-semibold font-mono">
            Tauri v2 · Rust
          </span>
        </div>
      </div>

      {/* Main Graphical Canvas Container */}
      <div className="relative w-full rounded-2xl border border-slate-200/90 dark:border-white/10 bg-slate-50/70 dark:bg-[#0b101d]/90 p-4 sm:p-6 backdrop-blur-xl shadow-lg transition-colors overflow-hidden">
        {/* Subtle Ambient Radial Backlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[520px] h-[300px] bg-gradient-to-r from-blue-400/10 via-purple-400/8 to-teal-400/10 blur-3xl pointer-events-none rounded-full" />

        {/* ========================================================================= */}
        {/* DESKTOP VIEW: High-Fidelity S-Curve Graph */}
        {/* ========================================================================= */}
        <div className="hidden lg:block relative mx-auto" style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}>
          {/* SVG S-Curve Ribbons Layer */}
          <svg
            width={GRAPH_WIDTH}
            height={GRAPH_HEIGHT}
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
          >
            <defs>
              {agents.map((agent) => {
                const gradientId = `ribbon-grad-${agent.id}`;
                const isLeft = agent.side === 'left';
                const fromX = isLeft ? CARD_WIDTH : GRAPH_WIDTH - CARD_WIDTH;
                const fromY = getNodeCenterY(agent.row);
                const toX = isLeft ? HUB_CENTER.x - HUB_HALF_W : HUB_CENTER.x + HUB_HALF_W;
                const toY = getHubAnchorY(agent.row);
                return (
                  <linearGradient
                    key={gradientId}
                    id={gradientId}
                    gradientUnits="userSpaceOnUse"
                    x1={toX}
                    y1={toY}
                    x2={fromX}
                    y2={fromY}
                  >
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.2" />
                    <stop offset="60%" stopColor={agent.color} stopOpacity="0.5" />
                    <stop offset="100%" stopColor={agent.color} stopOpacity="0.95" />
                  </linearGradient>
                );
              })}
            </defs>

            {agents.map((agent) => {
              const isLinked = linkedAgentIds[agent.id];
              const isLeft = agent.side === 'left';
              const fromX = isLeft ? CARD_WIDTH : GRAPH_WIDTH - CARD_WIDTH;
              const fromY = getNodeCenterY(agent.row);
              const toX = isLeft ? HUB_CENTER.x - HUB_HALF_W : HUB_CENTER.x + HUB_HALF_W;
              const toY = getHubAnchorY(agent.row);

              // S-curve cubic bezier
              const dx = toX - fromX;
              const c1X = fromX + dx * 0.5;
              const c1Y = fromY;
              const c2X = fromX + dx * 0.5;
              const c2Y = toY;
              const pathD = `M ${fromX} ${fromY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${toX} ${toY}`;

              const isHighlighted = hoveredAgent === agent.id || broadcastingSkill !== null;

              return (
                <g key={agent.id}>
                  {/* Base Ribbon Curve */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isLinked ? `url(#ribbon-grad-${agent.id})` : '#cbd5e1'}
                    strokeWidth={isHighlighted ? 3 : isLinked ? 2.25 : 1.25}
                    strokeDasharray={isLinked ? undefined : '4 6'}
                    className="transition-all duration-300"
                    opacity={isLinked ? (isHighlighted ? 1 : 0.85) : 0.35}
                  />

                  {/* Flowing Shimmer Particle Light along curve */}
                  {isLinked && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={agent.color}
                      strokeWidth={isHighlighted ? 3.5 : 2.5}
                      strokeLinecap="round"
                      strokeDasharray="16 160"
                      className="animate-shimmer-flow"
                      style={{
                        animationDuration: isHighlighted ? '1.2s' : '2.4s',
                        filter: isHighlighted ? `drop-shadow(0 0 6px ${agent.color})` : 'none',
                      }}
                    />
                  )}

                  {/* Hub Edge Connection Socket Dot */}
                  <circle
                    cx={toX}
                    cy={toY}
                    r={isHighlighted ? 3.5 : isLinked ? 2.5 : 1.5}
                    fill={isLinked ? agent.color : '#cbd5e1'}
                    className="transition-all duration-300"
                    style={{
                      filter: isHighlighted && isLinked ? `drop-shadow(0 0 8px ${agent.color})` : undefined,
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Left Column Agents (Cursor, Claude, Windsurf, Cline) — Absolutely Positioned */}
          {agents.filter(a => a.side === 'left').map(agent => {
            const isLinked = linkedAgentIds[agent.id];
            const isHovered = hoveredAgent === agent.id;
            const topY = getNodeY(agent.row);
            return (
              <div
                key={agent.id}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: topY,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  borderColor: isHovered && isLinked ? agent.color : undefined,
                  boxShadow: isHovered && isLinked ? `0 0 16px ${agent.color}30` : undefined,
                }}
                onMouseEnter={() => setHoveredAgent(agent.id)}
                onMouseLeave={() => setHoveredAgent(null)}
                className={`group flex items-center justify-between px-3 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                  isLinked
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/15 hover:border-slate-300 dark:hover:border-white/30 shadow-2xs hover:shadow-sm'
                    : 'bg-slate-100/60 dark:bg-slate-950/40 border-slate-200/50 dark:border-white/5 opacity-55 hover:opacity-85'
                }`}
                onClick={() => handleToggleAgent(agent.id)}
                title={`${agent.name} (${isLinked ? 'Click to Unlink' : 'Click to Link'})`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={agent.icon}
                    alt={agent.name}
                    className={`size-6 object-contain rounded-md transition-transform group-hover:scale-105 ${!isLinked ? 'grayscale opacity-60' : ''}`}
                  />
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                      {agent.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[95px]">
                      {agent.skillsDir}
                    </p>
                  </div>
                </div>

                <span
                  className={`size-2 rounded-full shrink-0 transition-colors ${
                    isLinked ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400 dark:bg-slate-600'
                  }`}
                />
              </div>
            );
          })}

          {/* Central Hub Dashboard Card — faithful to software's HubDashboard */}
          <div
            className="absolute rounded-2xl border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 shadow-xl backdrop-blur-xl p-4 flex flex-col justify-between"
            style={{
              left: HUB_CENTER.x - HUB_HALF_W,
              top: HUB_CENTER.y - HUB_HALF_H,
              width: HUB_HALF_W * 2,
              height: HUB_HALF_H * 2,
            }}
          >
            {/* Header: Brand Mark, Title, Tagline, & Stats Badge */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-white/10">
              <div className="flex items-center gap-2.5">
                <img
                  src={`${base}/skill-one-transparent.png`}
                  alt="Skill One"
                  className="size-7 object-contain drop-shadow-[0_2px_6px_rgba(46,127,217,0.3)]"
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 leading-none">
                    {t.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    {t.tagline}
                  </p>
                </div>
              </div>

              {/* Stats Badges */}
              <div className="flex flex-col items-end gap-1">
                <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white text-xs font-semibold tabular-nums border border-slate-200 dark:border-white/10">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">{activeSkillsCount}</span>
                  <span className="text-slate-400">/{skills.length}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-0.5">
                    {t.skillsLabel}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {activeAgentsCount}/8 {t.coverageLabel}
                </span>
              </div>
            </div>

            {/* Domain Summary Bar (matching software's domainSummary) */}
            <div className="py-1.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{t.activeSkills}:</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 font-mono">
                  🎨 2
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 font-mono">
                  🌿 1
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 font-mono">
                  🔍 1
                </span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 font-mono">
                  🧪 1
                </span>
              </div>

              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-mono">
                <Zap className="size-2.5" />
                {broadcastingSkill ? (isZh ? '秒级穿透共享...' : 'Instantly Shared...') : (isZh ? '全生态已就绪' : 'In Sync')}
              </span>
            </div>

            {/* Skill Chips Flow (Exact tag chip flow matching hub-dashboard.tsx) */}
            <div className="flex flex-wrap content-end gap-1.5 py-2 my-auto">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => handleToggleSkill(skill.id)}
                  aria-pressed={skill.enabled}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-200 cursor-pointer shadow-2xs ${
                    skill.enabled
                      ? 'border-slate-300 dark:border-white/20 bg-slate-50 dark:bg-white/10 text-slate-900 dark:text-white hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-white/20'
                      : 'border-slate-200 dark:border-white/5 bg-slate-100/50 dark:bg-black/30 text-slate-400 line-through opacity-50'
                  } ${broadcastingSkill === skill.name ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-500/20' : ''}`}
                >
                  <span className="text-[12px] leading-none shrink-0">{skill.emoji}</span>
                  <span className="truncate">{skill.name}</span>
                  <span
                    className={`size-1.5 rounded-full ${
                      skill.enabled ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Bottom Symlink Guarantee Seal */}
            <div className="pt-2 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="size-3.5" />
                <span>{t.guarantee}</span>
              </div>
              <span className="font-mono text-slate-400">~/.agents/skills</span>
            </div>
          </div>

          {/* Right Column Agents (Antigravity, Roo Code, Codex, Goose) — Absolutely Positioned & Mirrored */}
          {agents.filter(a => a.side === 'right').map(agent => {
            const isLinked = linkedAgentIds[agent.id];
            const isHovered = hoveredAgent === agent.id;
            const topY = getNodeY(agent.row);
            return (
              <div
                key={agent.id}
                style={{
                  position: 'absolute',
                  left: GRAPH_WIDTH - CARD_WIDTH,
                  top: topY,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                  borderColor: isHovered && isLinked ? agent.color : undefined,
                  boxShadow: isHovered && isLinked ? `0 0 16px ${agent.color}30` : undefined,
                }}
                onMouseEnter={() => setHoveredAgent(agent.id)}
                onMouseLeave={() => setHoveredAgent(null)}
                className={`group flex items-center justify-between px-3 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
                  isLinked
                    ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/15 hover:border-slate-300 dark:hover:border-white/30 shadow-2xs hover:shadow-sm'
                    : 'bg-slate-100/60 dark:bg-slate-950/40 border-slate-200/50 dark:border-white/5 opacity-55 hover:opacity-85'
                }`}
                onClick={() => handleToggleAgent(agent.id)}
                title={`${agent.name} (${isLinked ? 'Click to Unlink' : 'Click to Link'})`}
              >
                {/* Port dot on the left, facing Hub and ribbon connection */}
                <span
                  className={`size-2 rounded-full shrink-0 transition-colors ${
                    isLinked ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-400 dark:bg-slate-600'
                  }`}
                />

                <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
                  <div className="min-w-0 text-right">
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                      {agent.name}
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[95px]">
                      {agent.skillsDir}
                    </p>
                  </div>
                  <img
                    src={agent.icon}
                    alt={agent.name}
                    className={`size-6 object-contain rounded-md transition-transform group-hover:scale-105 shrink-0 ${!isLinked ? 'grayscale opacity-60' : ''}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* MOBILE VIEW: Clean Responsive Stack */}
        {/* ========================================================================= */}
        <div className="block lg:hidden space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/10">
              <div className="flex items-center gap-2">
                <img src={`${base}/skill-one-transparent.png`} alt="Skill One" className="size-6" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t.title}</h3>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {activeSkillsCount}/{skills.length}
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 py-3">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => handleToggleSkill(skill.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs ${
                    skill.enabled ? 'bg-slate-50 dark:bg-white/10 border-slate-300 dark:border-white/20 text-slate-900 dark:text-white' : 'bg-slate-100 dark:bg-black/30 border-slate-200 dark:border-white/5 text-slate-400 line-through'
                  }`}
                >
                  <span>{skill.emoji}</span>
                  <span>{skill.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {agents.map((agent) => {
              const isLinked = linkedAgentIds[agent.id];
              return (
                <button
                  key={agent.id}
                  onClick={() => handleToggleAgent(agent.id)}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left text-xs ${
                    isLinked ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/15 text-slate-900 dark:text-white shadow-2xs' : 'bg-slate-100 dark:bg-slate-950/50 border-slate-200/50 dark:border-white/5 opacity-50'
                  }`}
                >
                  <img src={agent.icon} alt={agent.name} className="size-5 rounded" />
                  <span className="truncate flex-1 font-medium">{agent.name}</span>
                  <span className={`size-1.5 rounded-full ${isLinked ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer Metrics Row */}
        <div className="mt-4 pt-3.5 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-slate-900 dark:text-white font-semibold">80+</span>
            <span>{isZh ? '款 AI 智能体零配置自动发现' : 'AI Agents Auto-Detected'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-900 dark:text-white font-semibold">1</span>
            <span>{isZh ? '个共享 skills 仓库，全生态免同步直接生效' : 'Central Repository, Instantly Ready for All Agents'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-purple-500 shrink-0" />
            <span className="text-slate-900 dark:text-white font-semibold">0 MB</span>
            <span>{isZh ? '零重复磁盘占用 · 原生软链穿透' : 'Zero Disk Overhead · Pure Symlinks'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
