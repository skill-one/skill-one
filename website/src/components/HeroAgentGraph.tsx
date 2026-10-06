import React, { useState, useMemo } from 'react';
import { translations } from '../i18n/translations';
import { Zap, CheckCircle2, ArrowRight } from 'lucide-react';

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
  owner: string;
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
  { id: 'codex', name: 'Copilot', icon: `${base}/agents/icons/githubcopilot.svg`, skillsDir: '~/.copilot/skills', side: 'right', row: 2, color: BRAND_COLORS[1] },
  { id: 'goose', name: 'Goose', icon: `${base}/agents/icons/goose.svg`, skillsDir: '~/.config/goose/skills', side: 'right', row: 3, color: BRAND_COLORS[2] },
];

const INITIAL_SKILLS: DemoSkill[] = [
  { id: 'shadcn-ui', name: 'shadcn-ui', owner: 'shadcn', enabled: true },
  { id: 'git-workflow', name: 'git-workflow', owner: 'git', enabled: true },
  { id: 'dingtalk-search', name: 'dingtalk-aisearch', owner: 'dingtalk', enabled: true },
  { id: 'guizang-material', name: 'guizang-material', owner: 'guizang', enabled: true },
  { id: 'aihot', name: 'aihot-news', owner: 'virxact', enabled: true },
  { id: 'media-gen', name: 'media-generation', owner: 'antigravity', enabled: true },
  { id: 'react-best', name: 'react-patterns', owner: 'facebook', enabled: true },
  { id: 'python-uv', name: 'uv-tools', owner: 'astral', enabled: true },
];

// Color palette for Owner Avatar initials
const OWNER_PALETTE: Record<string, { bg: string; text: string }> = {
  shadcn: { bg: 'bg-zinc-800 dark:bg-zinc-700', text: 'text-white' },
  git: { bg: 'bg-rose-600', text: 'text-white' },
  dingtalk: { bg: 'bg-blue-600', text: 'text-white' },
  guizang: { bg: 'bg-amber-600', text: 'text-white' },
  virxact: { bg: 'bg-emerald-600', text: 'text-white' },
  antigravity: { bg: 'bg-indigo-600', text: 'text-white' },
  facebook: { bg: 'bg-sky-600', text: 'text-white' },
  astral: { bg: 'bg-violet-600', text: 'text-white' },
};

function OwnerAvatarBadge({ owner }: { owner: string }) {
  const styling = OWNER_PALETTE[owner] ?? { bg: 'bg-slate-700', text: 'text-white' };
  const initial = owner.charAt(0).toUpperCase();

  return (
    <span
      className={`size-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 shadow-2xs border border-white/20 select-none ${styling.bg} ${styling.text}`}
      title={`Owner: @${owner}`}
    >
      {initial}
    </span>
  );
}

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

  const activeSkillsCount = useMemo(() => skills.filter((s) => s.enabled).length, [skills]);
  const activeAgentsCount = useMemo(() => Object.values(linkedAgentIds).filter(Boolean).length, [linkedAgentIds]);

  // Handle skill toggle with broadcast animation
  const handleToggleSkill = (skillId: string) => {
    const targetSkill = skills.find((s) => s.id === skillId);
    if (!targetSkill) return;

    const willBeEnabled = !targetSkill.enabled;
    setSkills((prev) => prev.map((s) => (s.id === skillId ? { ...s, enabled: willBeEnabled } : s)));

    if (willBeEnabled) {
      setBroadcastingSkill(targetSkill.name);
      setTimeout(() => {
        setBroadcastingSkill(null);
      }, 1600);
    }
  };

  // Toggle single agent link state
  const handleToggleAgent = (agentId: string) => {
    setLinkedAgentIds((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
  };

  // Canvas Geometry matching software's dual-column symmetrical layout
  const GRAPH_WIDTH = 940;
  const GRAPH_HEIGHT = 420;
  const HUB_CENTER = { x: 470, y: 210 };
  const HUB_HALF_W = 215;
  const HUB_HALF_H = 135;

  const CARD_WIDTH = 186;
  const CARD_HEIGHT = 50;
  const CARD_GAP = 36;
  const START_Y = 38;

  const getNodeY = (row: number) => START_Y + row * (CARD_HEIGHT + CARD_GAP);
  const getNodeCenterY = (row: number) => getNodeY(row) + CARD_HEIGHT / 2;
  const getHubAnchorY = (row: number) => 145 + row * 34;

  return (
    <div className="w-full max-w-5xl mx-auto select-none">
      {/* Top Status Bar: Crisp, uncluttered, matching latest client */}
      <div className="mb-3 flex items-center justify-between px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/90 dark:border-white/10 shadow-2xs backdrop-blur-md text-xs transition-colors">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`size-2 rounded-full transition-all duration-300 ${
                activeAgentsCount > 0
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse'
                  : 'bg-slate-400'
              }`}
            />
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {isZh ? `${activeAgentsCount} 个智能体已直连` : `${activeAgentsCount} Agents Linked`}
            </span>
          </div>

          <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
            {isZh ? '软链接零冗余' : 'Native Symlinks'}
          </span>

          {broadcastingSkill && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 animate-pulse">
              <Zap className="size-3" />
              {isZh ? `全网广播中: ${broadcastingSkill}` : `Broadcasting: ${broadcastingSkill}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="hidden sm:inline font-medium">
            {isZh ? '点击技能或开关体验秒级联动 ⚡' : 'Click skills or switches to test live sync ⚡'}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 font-mono text-[10px] font-bold">
            Rust Core
          </span>
        </div>
      </div>

      {/* Main Graphical Canvas Container */}
      <div className="relative w-full rounded-2xl border border-slate-200/90 dark:border-white/10 bg-slate-50/70 dark:bg-[#090d18]/90 p-4 sm:p-6 backdrop-blur-xl shadow-lg transition-colors overflow-hidden">
        {/* Subtle Ambient Radial Backlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[560px] h-[320px] bg-gradient-to-r from-blue-500/10 via-teal-500/8 to-indigo-500/10 blur-3xl pointer-events-none rounded-full" />

        {/* ========================================================================= */}
        {/* DESKTOP VIEW: High-Fidelity Dual-Column Graph with Notch Hub */}
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
                    <stop offset="50%" stopColor={agent.color} stopOpacity="0.45" />
                    <stop offset="100%" stopColor={agent.color} stopOpacity="0.9" />
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
                    opacity={isLinked ? (isHighlighted ? 1 : 0.85) : 0.25}
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
                        animationDuration: isHighlighted ? '1.1s' : '2.2s',
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

          {/* Left Column Agents (Cursor, Claude, Windsurf, Cline) */}
          {agents
            .filter((a) => a.side === 'left')
            .map((agent) => {
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
                    boxShadow: isHovered && isLinked ? `0 0 16px ${agent.color}35` : undefined,
                  }}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  className={`group flex items-center justify-between px-3 rounded-xl border transition-all duration-200 select-none ${
                    isLinked
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/15 hover:border-slate-300 dark:hover:border-white/30 shadow-2xs hover:shadow-sm'
                      : 'bg-slate-100/60 dark:bg-slate-950/40 border-slate-200/50 dark:border-white/5 opacity-55 hover:opacity-85'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={agent.icon}
                      alt={agent.name}
                      className={`size-6 object-contain rounded-md transition-transform group-hover:scale-105 ${
                        !isLinked ? 'grayscale opacity-60' : ''
                      }`}
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                        {agent.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[85px]">
                        {agent.skillsDir}
                      </p>
                    </div>
                  </div>

                  {/* Micro iOS-style Switch Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleAgent(agent.id)}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isLinked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    title={isLinked ? 'Unlink Agent' : 'Link Agent'}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out transform ${
                        isLinked ? 'translate-x-3' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })}

          {/* Central Hub Dashboard Card — Symmetrical Dual Notch Header */}
          <div
            className="absolute rounded-2xl border border-slate-200/90 dark:border-white/15 bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-xl p-4 pt-5 flex flex-col justify-between"
            style={{
              left: HUB_CENTER.x - HUB_HALF_W,
              top: HUB_CENTER.y - HUB_HALF_H,
              width: HUB_HALF_W * 2,
              height: HUB_HALF_H * 2,
            }}
          >
            {/* Floating Notch Left: Brand & Tagline Header */}
            <div className="absolute -top-[17px] left-4 z-10 flex items-center gap-2 rounded-lg border border-slate-200/90 dark:border-white/15 bg-white dark:bg-slate-900 px-2.5 py-1 shadow-2xs backdrop-blur-md">
              <img
                src={`${base}/skill-one-transparent.png`}
                alt="Skill One"
                className="size-5 shrink-0 object-contain drop-shadow-xs"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
                  {t.title}
                </span>
                <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                  {t.tagline}
                </span>
              </div>
            </div>

            {/* Floating Notch Right: Active Skills Count Badge */}
            <div className="absolute -top-3 right-4 z-10">
              <span className="inline-flex items-center rounded-full border border-slate-200/90 dark:border-white/15 bg-white dark:bg-slate-900 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-2xs backdrop-blur-md">
                <span className="text-emerald-600 dark:text-emerald-400">{activeSkillsCount}</span>
                <span className="text-slate-400">/{skills.length}</span>
                <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  {t.skillsLabel}
                </span>
              </span>
            </div>

            {/* Active Skill Chips Flow — Bottom-up stacking with OwnerAvatars */}
            <div className="flex min-h-[140px] flex-col justify-end mt-1">
              <div className="flex flex-wrap content-end gap-1.5 overflow-y-auto pr-0.5 mt-auto">
                {skills.map((skill) => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => handleToggleSkill(skill.id)}
                    aria-pressed={skill.enabled}
                    className={`inline-flex shrink-0 max-w-[175px] items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-all duration-200 cursor-pointer shadow-2xs ${
                      skill.enabled
                        ? 'border-slate-300/80 dark:border-white/20 bg-slate-50/80 dark:bg-white/10 text-slate-900 dark:text-white hover:border-blue-500 hover:bg-blue-50/60 dark:hover:bg-white/20'
                        : 'border-slate-200 dark:border-white/5 bg-slate-100/50 dark:bg-black/30 text-slate-400 line-through opacity-50'
                    } ${
                      broadcastingSkill === skill.name
                        ? 'ring-2 ring-amber-400 bg-amber-50 dark:bg-amber-500/20'
                        : ''
                    }`}
                  >
                    <OwnerAvatarBadge owner={skill.owner} />
                    <span className="truncate">{skill.name}</span>
                    <span
                      className={`size-1.5 rounded-full shrink-0 ${
                        skill.enabled ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}
                    />
                  </button>
                ))}

                {/* +More Overflow Chip */}
                <div className="inline-flex shrink-0 items-center justify-center gap-0.5 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
                  <span>+16</span>
                  <span className="text-[9px]">{isZh ? '全部' : 'More'}</span>
                  <ArrowRight className="size-2.5 ml-0.5" />
                </div>
              </div>
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

          {/* Right Column Agents (Antigravity, Roo Code, Codex, Goose) */}
          {agents
            .filter((a) => a.side === 'right')
            .map((agent) => {
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
                    boxShadow: isHovered && isLinked ? `0 0 16px ${agent.color}35` : undefined,
                  }}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  className={`group flex items-center justify-between px-3 rounded-xl border transition-all duration-200 select-none ${
                    isLinked
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/15 hover:border-slate-300 dark:hover:border-white/30 shadow-2xs hover:shadow-sm'
                      : 'bg-slate-100/60 dark:bg-slate-950/40 border-slate-200/50 dark:border-white/5 opacity-55 hover:opacity-85'
                  }`}
                >
                  {/* Micro Switch Toggle on Left (Facing Hub) */}
                  <button
                    type="button"
                    onClick={() => handleToggleAgent(agent.id)}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isLinked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    title={isLinked ? 'Unlink Agent' : 'Link Agent'}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out transform ${
                        isLinked ? 'translate-x-3' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <div className="flex items-center gap-2.5 min-w-0 flex-1 justify-end">
                    <div className="min-w-0 text-right">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white leading-tight truncate">
                        {agent.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[85px]">
                        {agent.skillsDir}
                      </p>
                    </div>
                    <img
                      src={agent.icon}
                      alt={agent.name}
                      className={`size-6 object-contain rounded-md transition-transform group-hover:scale-105 shrink-0 ${
                        !isLinked ? 'grayscale opacity-60' : ''
                      }`}
                    />
                  </div>
                </div>
              );
            })}
        </div>

        {/* ========================================================================= */}
        {/* MOBILE VIEW: Clean Responsive Stack with Notch & OwnerAvatars */}
        {/* ========================================================================= */}
        <div className="block lg:hidden space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-white/15 bg-white dark:bg-slate-900 p-4 shadow-sm relative pt-5">
            {/* Floating Top Notch */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-white/10">
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
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${
                    skill.enabled
                      ? 'bg-slate-50 dark:bg-white/10 border-slate-300 dark:border-white/20 text-slate-900 dark:text-white'
                      : 'bg-slate-100 dark:bg-black/30 border-slate-200 dark:border-white/5 text-slate-400 line-through'
                  }`}
                >
                  <OwnerAvatarBadge owner={skill.owner} />
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
                    isLinked
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/15 text-slate-900 dark:text-white shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-950/50 border-slate-200/50 dark:border-white/5 opacity-50'
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
            <span>{isZh ? '个中央技能仓库，全生态免同步直接生效' : 'Central Repository, Instantly Ready for All Agents'}</span>
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
