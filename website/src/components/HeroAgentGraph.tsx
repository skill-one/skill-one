import React, { useState, useEffect, useMemo } from 'react';
import { translations } from '../i18n/translations';
import { Zap, CheckCircle2, RefreshCw, Cpu, Layers } from 'lucide-react';

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
  { id: 'cursor', name: 'Cursor', icon: '/agents/icons/cursor-color.svg', skillsDir: '.cursor/skills', side: 'left', row: 0, color: BRAND_COLORS[0] },
  { id: 'claude', name: 'Claude Desktop', icon: '/agents/icons/claudecode-color.svg', skillsDir: '~/.claude/skills', side: 'left', row: 1, color: BRAND_COLORS[1] },
  { id: 'windsurf', name: 'Windsurf', icon: '/agents/icons/windsurf.svg', skillsDir: '~/.codeium/windsurf/skills', side: 'left', row: 2, color: BRAND_COLORS[2] },
  { id: 'cline', name: 'Cline', icon: '/agents/icons/cline.svg', skillsDir: '~/.cline/skills', side: 'left', row: 3, color: BRAND_COLORS[3] },
  // Right Column
  { id: 'antigravity', name: 'Antigravity', icon: '/agents/icons/antigravity-color.svg', skillsDir: '~/.gemini/config/skills', side: 'right', row: 0, color: BRAND_COLORS[4] },
  { id: 'roocode', name: 'Roo Code', icon: '/agents/icons/roocode.svg', skillsDir: '~/.roocode/skills', side: 'right', row: 1, color: BRAND_COLORS[0] },
  { id: 'codex', name: 'Codex / Copilot', icon: '/agents/icons/githubcopilot.svg', skillsDir: '~/.copilot/skills', side: 'right', row: 2, color: BRAND_COLORS[1] },
  { id: 'goose', name: 'Goose', icon: '/agents/icons/goose.svg', skillsDir: '~/.config/goose/skills', side: 'right', row: 3, color: BRAND_COLORS[2] },
];

const INITIAL_SKILLS: DemoSkill[] = [
  { id: 'shadcn-ui', name: 'shadcn-ui', emoji: '🎨', domain: 'UI Design', enabled: true },
  { id: 'git-workflow', name: 'git-workflow', emoji: '🌿', domain: 'DevOps', enabled: true },
  { id: 'dingtalk-aisearch', name: 'dingtalk-aisearch', emoji: '🔍', domain: 'Search', enabled: true },
  { id: 'guizang-illustration', name: 'guizang-illustration', emoji: '🖼️', domain: 'Design', enabled: true },
  { id: 'aihot', name: 'aihot', emoji: '🔥', domain: 'News', enabled: true },
  { id: 'code-tester', name: 'test-runner', emoji: '🧪', domain: 'Testing', enabled: true },
];

export function HeroAgentGraph({ lang = 'en' }: HeroAgentGraphProps) {
  const t = translations[lang].hub;
  const isZh = lang === 'zh';

  const [skills, setSkills] = useState<DemoSkill[]>(INITIAL_SKILLS);
  const [agents, setAgents] = useState(INITIAL_AGENTS);
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
  const [pulseCount, setPulseCount] = useState(0);

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
      setPulseCount(c => c + 1);

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

  // Layout Dimensions for Desktop Canvas
  // Canvas: 880w x 420h
  // Hub: center at x: 440, y: 210, width: 440, height: 260
  // Left nodes: x: 10, y: 35 + row * 92
  // Right nodes: x: 690, y: 35 + row * 92
  const GRAPH_WIDTH = 880;
  const GRAPH_HEIGHT = 430;
  const HUB_CENTER = { x: 440, y: 215 };
  const HUB_HALF_W = 210;
  const HUB_HALF_H = 135;

  return (
    <div className="w-full max-w-5xl mx-auto select-none">
      {/* Broadcast Live Status Notification */}
      <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/60 border border-white/10 backdrop-blur-md text-xs">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${broadcastingSkill ? 'bg-amber-400 animate-ping' : 'bg-emerald-400 animate-pulse'}`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${broadcastingSkill ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          <span className="text-slate-300 font-medium">
            {broadcastingSkill ? (
              <span className="text-amber-300 font-mono">
                {isZh ? `⚡ 正在广播 '${broadcastingSkill}' 至所有智能体目录 (软链实时秒级映射)...` : `⚡ Broadcasting '${broadcastingSkill}' to all agents (atomic symlink sync)...`}
              </span>
            ) : (
              <span>
                {isZh ? '所有活跃 Agents 处于单一事实源软链同步状态' : 'All active agents synchronized to Single Source of Truth'}
              </span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="hidden sm:inline font-mono">
            {isZh ? '点击技能体验即时广播' : 'Click any skill to trigger live sync'}
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold font-mono">
            Tauri v2 · Rust
          </span>
        </div>
      </div>

      {/* Main Graphical Canvas Container */}
      <div className="relative w-full rounded-2xl border border-white/10 bg-[#0b101d]/90 p-3 sm:p-6 backdrop-blur-2xl shadow-2xl overflow-hidden">
        {/* Ambient Backlight Mesh */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-gradient-to-r from-blue-600/15 via-purple-600/10 to-teal-500/15 blur-3xl pointer-events-none rounded-full" />

        {/* ========================================================================= */}
        {/* DESKTOP VIEW: High-Fidelity Topological Graph with Real S-Curve SVG Ribbons */}
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
                const fromX = isLeft ? 190 : 690;
                const toX = isLeft ? HUB_CENTER.x - HUB_HALF_W : HUB_CENTER.x + HUB_HALF_W;
                return (
                  <linearGradient
                    key={gradientId}
                    id={gradientId}
                    gradientUnits="userSpaceOnUse"
                    x1={toX}
                    y1={HUB_CENTER.y}
                    x2={fromX}
                    y2={35 + agent.row * 92 + 22}
                  >
                    <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.1" />
                    <stop offset="60%" stopColor={agent.color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={agent.color} stopOpacity="0.9" />
                  </linearGradient>
                );
              })}
            </defs>

            {agents.map((agent) => {
              const isLinked = linkedAgentIds[agent.id];
              const isLeft = agent.side === 'left';
              const fromX = isLeft ? 190 : 690;
              const fromY = 35 + agent.row * 92 + 22;
              const toX = isLeft ? HUB_CENTER.x - HUB_HALF_W : HUB_CENTER.x + HUB_HALF_W;
              const toY = HUB_CENTER.y - 70 + agent.row * 46;

              // Horizontal S-curve bezier control points
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
                    stroke={isLinked ? `url(#ribbon-grad-${agent.id})` : 'rgba(255,255,255,0.1)'}
                    strokeWidth={isHighlighted ? 2.5 : isLinked ? 1.75 : 1}
                    strokeDasharray={isLinked ? undefined : '4 6'}
                    className="transition-all duration-300"
                    opacity={isLinked ? (isHighlighted ? 1 : 0.7) : 0.25}
                  />

                  {/* Flowing Shimmer Particle Light along the Ribbon */}
                  {isLinked && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke={agent.color}
                      strokeWidth={isHighlighted ? 3 : 2}
                      strokeLinecap="round"
                      strokeDasharray="12 180"
                      className="animate-shimmer-flow"
                      style={{
                        animationDuration: isHighlighted ? '0.9s' : '2.2s',
                        filter: isHighlighted ? `drop-shadow(0 0 6px ${agent.color})` : 'none',
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Left Column Agents (Cursor, Claude, Windsurf, Cline) */}
          <div className="absolute left-0 top-0 w-[190px] space-y-4 pt-4">
            {agents.filter(a => a.side === 'left').map(agent => {
              const isLinked = linkedAgentIds[agent.id];
              const isHovered = hoveredAgent === agent.id;
              return (
                <div
                  key={agent.id}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isLinked
                      ? 'bg-slate-900/80 border-white/15 hover:border-white/30 hover:bg-slate-800/90 shadow-md'
                      : 'bg-slate-950/40 border-white/5 opacity-50 hover:opacity-80'
                  }`}
                  style={{
                    borderColor: isHovered && isLinked ? agent.color : undefined,
                    boxShadow: isHovered && isLinked ? `0 0 16px ${agent.color}30` : undefined,
                  }}
                  onClick={() => handleToggleAgent(agent.id)}
                  title={`${agent.name} (${isLinked ? 'Click to Unlink' : 'Click to Link'})`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={agent.icon}
                      alt={agent.name}
                      className={`size-6 object-contain rounded-md transition-transform group-hover:scale-110 ${!isLinked ? 'grayscale opacity-60' : ''}`}
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white leading-tight truncate">
                        {agent.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-[90px]">
                        {agent.skillsDir}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`size-2 rounded-full shrink-0 transition-colors ${
                      isLinked ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* Central Hub Dashboard Card */}
          <div
            className="absolute rounded-2xl border border-white/15 bg-slate-900/90 shadow-2xl backdrop-blur-xl p-4 flex flex-col justify-between"
            style={{
              left: HUB_CENTER.x - HUB_HALF_W,
              top: HUB_CENTER.y - HUB_HALF_H,
              width: HUB_HALF_W * 2,
              height: HUB_HALF_H * 2,
            }}
          >
            {/* Header: Brand Mark, Title, Tagline, & Counter */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <img
                  src="/skill-one-transparent.png"
                  alt="Skill One"
                  className="size-8 object-contain drop-shadow-[0_2px_8px_rgba(46,127,217,0.5)]"
                />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {t.title}
                    <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                      v0.22.0
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {t.tagline}
                  </p>
                </div>
              </div>

              {/* Status Counters */}
              <div className="flex flex-col items-end gap-1">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/10 text-white text-xs font-semibold tabular-nums border border-white/10">
                  <span className="text-emerald-400 font-bold">{activeSkillsCount}</span>
                  <span className="text-slate-400">/{skills.length}</span>
                  <span className="text-[10px] text-slate-300 ml-0.5">
                    {t.skillsLabel}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {activeAgentsCount}/8 {t.coverageLabel}
                </span>
              </div>
            </div>

            {/* Instruction Banner */}
            <div className="py-2 flex items-center justify-between text-[11px] text-slate-300">
              <span className="flex items-center gap-1 text-slate-300">
                <Zap className="size-3 text-amber-400 shrink-0" />
                {t.clickToBroadcast}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {activeSkillsCount} Skills Active
              </span>
            </div>

            {/* Skill Chips Flow (Interactive Grid) */}
            <div className="grid grid-cols-3 gap-2 py-1">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => handleToggleSkill(skill.id)}
                  aria-pressed={skill.enabled}
                  className={`group relative flex items-center justify-between p-2 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                    skill.enabled
                      ? 'bg-white/[0.08] border-white/20 hover:bg-white/[0.14] hover:border-blue-400/50 shadow-xs'
                      : 'bg-black/30 border-white/5 opacity-40 hover:opacity-70'
                  } ${broadcastingSkill === skill.name ? 'ring-2 ring-amber-400 bg-amber-500/10' : ''}`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm select-none shrink-0">{skill.emoji}</span>
                    <div className="min-w-0">
                      <p
                        className={`text-[11px] font-medium truncate ${
                          skill.enabled ? 'text-white' : 'text-slate-400 line-through'
                        }`}
                      >
                        {skill.name}
                      </p>
                      <span className="text-[8px] text-slate-400 uppercase tracking-wider block font-mono">
                        {skill.domain}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`size-1.5 rounded-full shrink-0 ${
                      skill.enabled ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Bottom Symlink Guarantee Seal */}
            <div className="pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="size-3.5" />
                <span>{t.guarantee}</span>
              </div>
              <span className="font-mono text-slate-400">~/.agents/skills</span>
            </div>
          </div>

          {/* Right Column Agents (Antigravity, Roo Code, Codex, Goose) */}
          <div className="absolute right-0 top-0 w-[190px] space-y-4 pt-4">
            {agents.filter(a => a.side === 'right').map(agent => {
              const isLinked = linkedAgentIds[agent.id];
              const isHovered = hoveredAgent === agent.id;
              return (
                <div
                  key={agent.id}
                  onMouseEnter={() => setHoveredAgent(agent.id)}
                  onMouseLeave={() => setHoveredAgent(null)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isLinked
                      ? 'bg-slate-900/80 border-white/15 hover:border-white/30 hover:bg-slate-800/90 shadow-md'
                      : 'bg-slate-950/40 border-white/5 opacity-50 hover:opacity-80'
                  }`}
                  style={{
                    borderColor: isHovered && isLinked ? agent.color : undefined,
                    boxShadow: isHovered && isLinked ? `0 0 16px ${agent.color}30` : undefined,
                  }}
                  onClick={() => handleToggleAgent(agent.id)}
                  title={`${agent.name} (${isLinked ? 'Click to Unlink' : 'Click to Link'})`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={agent.icon}
                      alt={agent.name}
                      className={`size-6 object-contain rounded-md transition-transform group-hover:scale-110 ${!isLinked ? 'grayscale opacity-60' : ''}`}
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white leading-tight truncate">
                        {agent.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono truncate max-w-[90px]">
                        {agent.skillsDir}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`size-2 rounded-full shrink-0 transition-colors ${
                      isLinked ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* MOBILE / TABLET VIEW: Responsive Stacked Grid with Live Interactivity */}
        {/* ========================================================================= */}
        <div className="block lg:hidden space-y-4">
          {/* Mobile Central Hub Card */}
          <div className="rounded-2xl border border-white/15 bg-slate-900/95 p-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <img src="/skill-one-transparent.png" alt="Skill One" className="size-7" />
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">{t.title}</h3>
                  <p className="text-[10px] text-slate-400">{t.tagline}</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-emerald-400">{activeSkillsCount}/{skills.length}</span>
                <span className="text-[10px] text-slate-400 block">{t.skillsLabel}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 py-2">
              {t.clickToBroadcast}
            </p>

            <div className="grid grid-cols-2 gap-2 py-2">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  onClick={() => handleToggleSkill(skill.id)}
                  className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs ${
                    skill.enabled ? 'bg-white/10 border-white/20 text-white' : 'bg-black/30 border-white/5 text-slate-500 line-through'
                  }`}
                >
                  <span className="truncate">{skill.emoji} {skill.name}</span>
                  <span className={`size-1.5 rounded-full ${skill.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Connected Agents Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>{isZh ? '已链接智能体 (点击可切换)' : 'Linked Agents (Tap to toggle)'}</span>
              <span className="text-emerald-400 font-mono">{activeAgentsCount}/8 {t.statusLinked}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {agents.map((agent) => {
                const isLinked = linkedAgentIds[agent.id];
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleToggleAgent(agent.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-left transition-all ${
                      isLinked ? 'bg-slate-900 border-white/15 text-white' : 'bg-slate-950/50 border-white/5 opacity-50'
                    }`}
                  >
                    <img src={agent.icon} alt={agent.name} className="size-5 rounded" />
                    <span className="text-xs font-medium truncate flex-1">{agent.name}</span>
                    <span className={`size-1.5 rounded-full ${isLinked ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Metrics Row */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-blue-400" />
            <span className="text-white font-semibold">80+</span>
            <span>{isZh ? '款 AI 智能体零配置自动发现' : 'AI Agents Auto-Detected'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-400" />
            <span className="text-white font-semibold">1</span>
            <span>{isZh ? '次点击安装，所有智能体秒级热共享' : 'Click Install, Instant Multi-Agent Ready'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-purple-400" />
            <span className="text-white font-semibold">0 MB</span>
            <span>{isZh ? '零重复磁盘占用 · 原生软链穿透' : 'Zero Disk Overhead · Pure Symlinks'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
