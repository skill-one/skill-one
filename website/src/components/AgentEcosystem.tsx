import React, { useState, useMemo } from 'react';
import agentsData from '../data/agents.json';
import { translations } from '../i18n/translations';
import { Search, ExternalLink, Star, CheckCircle, Sparkles, Copy, Check } from 'lucide-react';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

const IDE_AGENTS = ['cursor', 'windsurf', 'cline', 'roocode', 'githubcopilot', 'continue', 'augment', 'trae'];
const CLI_AGENTS = ['antigravity-cli', 'claude-code', 'geminicli', 'opencode', 'codex', 'goose', 'iflow-cli', 'tabnine-cli'];
const DESKTOP_AGENTS = ['aider-desk', 'antigravity', 'astrbot', 'codestudio', 'cortex', 'lmstudio', 'pochi'];

interface AgentEcosystemProps {
  lang?: 'en' | 'zh';
}

interface AgentItem {
  name: string;
  display: string;
  website: string;
  icon: string;
  stars: number;
  skillsDir: string;
  isTop: boolean;
}

export function AgentEcosystem({ lang = 'en' }: AgentEcosystemProps) {
  const t = translations[lang].agentsExplorer;
  const isZh = lang === 'zh';

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'top' | 'ide' | 'cli' | 'desktop'>('all');
  const [showAll, setShowAll] = useState(false);
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const agents = agentsData as AgentItem[];

  const topCount = agents.filter((a) => a.isTop).length;
  const ideCount = agents.filter((a) => IDE_AGENTS.includes(a.name)).length;
  const cliCount = agents.filter((a) => CLI_AGENTS.includes(a.name)).length;
  const desktopCount = agents.filter((a) => DESKTOP_AGENTS.includes(a.name)).length;

  // Keyboard shortcut '/' to focus search input
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyPath = (agentName: string, path: string) => {
    void navigator.clipboard.writeText(path);
    setCopiedAgent(agentName);
    setTimeout(() => setCopiedAgent(null), 2000);
  };

  // Categorize and prioritize flagship agents
  const filteredAgents = useMemo(() => {
    const list = agents.filter((agent) => {
      const q = query.toLowerCase().trim();
      const matchQuery = !q ||
        agent.name.toLowerCase().includes(q) ||
        agent.display.toLowerCase().includes(q) ||
        agent.skillsDir.toLowerCase().includes(q);

      if (!matchQuery) return false;

      if (activeTab === 'all') return true;
      if (activeTab === 'top') return agent.isTop;
      if (activeTab === 'ide') return IDE_AGENTS.includes(agent.name);
      if (activeTab === 'cli') return CLI_AGENTS.includes(agent.name);
      if (activeTab === 'desktop') return DESKTOP_AGENTS.includes(agent.name);
      return true;
    });

    // Prioritize flagship tools (Cursor, Claude, Windsurf, Cline, etc.) before others
    return list.toSorted((a, b) => {
      if (a.isTop && !b.isTop) return -1;
      if (!a.isTop && b.isTop) return 1;
      return a.display.localeCompare(b.display);
    });
  }, [agents, query, activeTab]);

  return (
    <section id="ecosystem" className="py-24 relative border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#070b14]/50 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 font-mono">
            {t.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight mt-2 mb-4">
            {t.title}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Search & Tabs Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          {/* Search Box */}
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-10 pr-12 py-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs transition-colors backdrop-blur-md"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-400">
              /
            </kbd>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-xs font-medium overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterAll} ({agents.length})
            </button>
            <button
              onClick={() => setActiveTab('top')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'top'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterTop} ({topCount})
            </button>
            <button
              onClick={() => setActiveTab('ide')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'ide'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterIde} ({ideCount})
            </button>
            <button
              onClick={() => setActiveTab('cli')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'cli'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterCli} ({cliCount})
            </button>
            <button
              onClick={() => setActiveTab('desktop')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'desktop'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterDesktop} ({desktopCount})
            </button>
          </div>
        </div>

        {/* Agents Grid */}
        {filteredAgents.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 text-sm">
            {t.emptyResult}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {(showAll || query || activeTab !== 'all' ? filteredAgents : filteredAgents.slice(0, 16)).map((agent) => (
                <div
                  key={agent.name}
                  className="group relative p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/70 hover:border-blue-400 dark:hover:border-blue-500/40 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between backdrop-blur-sm"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={`${base}${agent.icon}`}
                          alt={agent.display}
                          className="size-7 object-contain rounded-md transition-transform group-hover:scale-105"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">
                            {agent.display}
                          </h4>
                          {agent.isTop && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                              <Sparkles className="size-2.5" /> {t.filterTop}
                            </span>
                          )}
                        </div>
                      </div>

                      {agent.website && (
                        <a
                          href={agent.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors p-1"
                          title={t.openWebsite}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyPath(agent.name, agent.skillsDir)}
                      className="w-full text-left group/path flex items-center justify-between text-[10px] text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-black/30 hover:bg-slate-100 dark:hover:bg-white/5 px-2 py-1 rounded truncate border border-slate-200/60 dark:border-white/5 transition-colors cursor-pointer"
                      title={isZh ? `点击复制路径: ${agent.skillsDir}` : `Click to copy path: ${agent.skillsDir}`}
                    >
                      <span className="truncate">{agent.skillsDir}</span>
                      {copiedAgent === agent.name ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-sans text-[9px] shrink-0 ml-1">
                          <Check className="size-2.5" />
                          <span>{isZh ? '已复制' : 'Copied'}</span>
                        </span>
                      ) : (
                        <Copy className="size-3 text-slate-400 opacity-0 group-hover/path:opacity-100 shrink-0 ml-1 transition-opacity" />
                      )}
                    </button>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle className="size-3" />
                      <span>{isZh ? '自动发现就绪' : 'Auto-detected'}</span>
                    </span>
                    {agent.stars > 0 && (
                      <span className="flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400">
                        <Star className="size-3 text-amber-500 fill-amber-500" />
                        {agent.stars >= 1000 ? `${(agent.stars / 1000).toFixed(1)}k` : agent.stars}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Expand / Collapse Button when more than 16 agents */}
            {!query && activeTab === 'all' && filteredAgents.length > 16 && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs transition-all"
                >
                  {showAll
                    ? (isZh ? '收起列表 ↑' : 'Show Fewer Agents ↑')
                    : (isZh ? `展开查看全部 ${filteredAgents.length} 款 AI 智能体 ↓` : `Show All ${filteredAgents.length} Supported Agents ↓`)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

