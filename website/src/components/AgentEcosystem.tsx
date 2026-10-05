import React, { useState, useMemo } from 'react';
import agentsData from '../data/agents.json';
import { translations } from '../i18n/translations';
import { Search, ExternalLink, Star, CheckCircle, Sparkles } from 'lucide-react';

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

  const agents = agentsData as AgentItem[];

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
      if (activeTab === 'ide') {
        return ['cursor', 'windsurf', 'cline', 'roocode', 'githubcopilot', 'continue', 'augment', 'trae'].includes(agent.name);
      }
      if (activeTab === 'cli') {
        return ['antigravity-cli', 'claude-code', 'geminicli', 'opencode', 'codex', 'goose', 'iflow-cli', 'tabnine-cli'].includes(agent.name);
      }
      if (activeTab === 'desktop') {
        return ['aider-desk', 'antigravity', 'astrbot', 'codestudio', 'cortex', 'lmstudio', 'pochi'].includes(agent.name);
      }
      return true;
    });

    // Prioritize flagship tools (Cursor, Claude, Windsurf, Cline, etc.) before others
    return [...list].sort((a, b) => {
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
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-blue-500 shadow-2xs transition-colors backdrop-blur-md"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 text-xs font-medium overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterAll} ({agents.length})
            </button>
            <button
              onClick={() => setActiveTab('top')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'top'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterTop}
            </button>
            <button
              onClick={() => setActiveTab('ide')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'ide'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterIde}
            </button>
            <button
              onClick={() => setActiveTab('cli')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'cli'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterCli}
            </button>
            <button
              onClick={() => setActiveTab('desktop')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'desktop'
                  ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.filterDesktop}
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
                          src={agent.icon}
                          alt={agent.display}
                          className="size-7 object-contain rounded-md transition-transform group-hover:scale-105"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-tight truncate">
                            {agent.display}
                          </h4>
                          {agent.isTop && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                              <Sparkles className="size-2.5" /> Popular
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

                    <div className="text-[10px] text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-black/30 px-2 py-1 rounded truncate border border-slate-200/60 dark:border-white/5">
                      {agent.skillsDir}
                    </div>
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

