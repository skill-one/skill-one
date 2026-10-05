import React, { useState } from 'react';
import { translations } from '../i18n/translations';
import {
  Store,
  Terminal,
  MessageSquareCode,
  FolderGit2,
  Check,
  Copy,
  Sparkles,
  ShieldCheck,
  Zap,
  Play,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

interface UniversalInstallShowcaseProps {
  lang?: 'en' | 'zh';
}

export const UniversalInstallShowcase: React.FC<UniversalInstallShowcaseProps> = ({ lang = 'en' }) => {
  const t = translations[lang].universalInstall;
  const isZh = lang === 'zh';

  const [activeTab, setActiveTab] = useState<'market' | 'cli' | 'chat' | 'git'>('market');
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [cliRunning, setCliRunning] = useState(false);
  const [cliFinished, setCliFinished] = useState(true);
  const [chatPromptSending, setChatPromptSending] = useState(false);
  const [chatPromptSent, setChatPromptSent] = useState(true);

  const handleInstallClick = () => {
    setIsInstalling(true);
    setTimeout(() => {
      setIsInstalling(false);
      setIsInstalled(true);
    }, 900);
  };

  const handleCopyCli = () => {
    navigator.clipboard.writeText('npx skills add @antigravity/shadcn-ui');
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2500);
  };

  const handleRunCli = () => {
    setCliRunning(true);
    setCliFinished(false);
    setTimeout(() => {
      setCliRunning(false);
      setCliFinished(true);
    }, 1100);
  };

  const handleSendChat = () => {
    setChatPromptSending(true);
    setChatPromptSent(false);
    setTimeout(() => {
      setChatPromptSending(false);
      setChatPromptSent(true);
    }, 900);
  };

  const handleResetDemo = () => {
    setIsInstalled(false);
    setIsInstalling(false);
    setCliRunning(false);
    setCliFinished(false);
    setChatPromptSending(false);
    setChatPromptSent(false);
  };

  const isBusy = isInstalling || cliRunning || chatPromptSending;
  const isSynced = isInstalled || (activeTab === 'cli' && cliFinished) || (activeTab === 'chat' && chatPromptSent) || activeTab === 'git';

  return (
    <section id="universal-install" className="py-24 relative border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/60 dark:bg-[#070b14]/40 transition-colors">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400 font-mono">
            {t.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white tracking-tight mt-2 mb-4 text-balance">
            {t.title}
          </h2>
          <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* 4 Interactive Workflow Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex p-1.5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-white/10 shadow-sm backdrop-blur-md max-w-full overflow-x-auto gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('market')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'market'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Store className="size-4" />
              <span>{t.tabs.market}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cli')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'cli'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Terminal className="size-4" />
              <span>{t.tabs.cli}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'chat'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageSquareCode className="size-4" />
              <span>{t.tabs.chat}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('git')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'git'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FolderGit2 className="size-4" />
              <span>{t.tabs.git}</span>
            </button>
          </div>
        </div>

        {/* Interactive Workspace Showcase Box */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Interactive Simulation Interface */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/80 p-6 sm:p-7 shadow-md flex flex-col justify-between backdrop-blur-xl relative overflow-hidden">
            {/* Ambient Background Accent */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 dark:bg-blue-500/10 blur-3xl pointer-events-none rounded-full" />

            {/* TAB 1: Store GUI Simulation */}
            {activeTab === 'market' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Skill One Store · Verified Catalog
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">GUI 1-Click</span>
                </div>

                <div className="p-4 sm:p-5 rounded-xl border border-blue-200/80 dark:border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                        UI
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                            {t.marketTab.skillName}
                          </h4>
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-medium">
                            v1.4.0
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          by Antigravity Team · MIT Licensed
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleInstallClick}
                      disabled={isInstalling || isInstalled}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                        isInstalled
                          ? 'bg-emerald-600 text-white cursor-default'
                          : isInstalling
                          ? 'bg-blue-500 text-white opacity-80 cursor-wait'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isInstalled ? (
                        <span className="flex items-center gap-1.5">
                          <Check className="size-3.5" />
                          {t.marketTab.installedBtn}
                        </span>
                      ) : isInstalling ? (
                        'Installing...'
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="size-3.5" />
                          {t.marketTab.installBtn}
                        </span>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                    {t.marketTab.skillDesc}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono pt-3 border-t border-slate-200/60 dark:border-white/5">
                    <span>Target: ~/.agents/skills/shadcn-ui-mastery</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {isInstalled ? 'Synced Everywhere (0ms)' : 'Ready to Install'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-white/5 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{t.marketTab.installedFeedback}</span>
                </div>
              </div>
            )}

            {/* TAB 2: CLI Terminal Simulation */}
            {activeTab === 'cli' && (
              <div className="space-y-4 animate-in fade-in duration-300 font-mono">
                {/* Terminal Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-red-400/90 inline-block" />
                    <span className="size-3 rounded-full bg-amber-400/90 inline-block" />
                    <span className="size-3 rounded-full bg-emerald-400/90 inline-block" />
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">{t.cliTab.termTitle}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCli}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px] font-sans transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedCli ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                      <span>{copiedCli ? t.cliTab.copiedBtn : t.cliTab.copyBtn}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRunCli}
                      disabled={cliRunning}
                      className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-sans transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="size-3" />
                      <span>{cliRunning ? t.cliTab.runningBtn : t.cliTab.runBtn}</span>
                    </button>
                  </div>
                </div>

                {/* Terminal Body */}
                <div className="p-4 rounded-xl bg-slate-950 text-slate-200 text-xs sm:text-[13px] leading-relaxed space-y-2 select-text shadow-inner">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">~</span>
                    <span className="text-blue-400">$</span>
                    <span className="text-white font-semibold">npx skills add @antigravity/shadcn-ui</span>
                  </div>

                  {cliRunning ? (
                    <div className="text-slate-400 animate-pulse py-2 flex items-center gap-2">
                      <span className="size-2 rounded-full bg-blue-400 animate-ping" />
                      <span>Resolving package and extracting directly to ~/.agents/skills...</span>
                    </div>
                  ) : cliFinished ? (
                    <div className="space-y-1 text-slate-300 pt-1">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <Check className="size-3.5" />
                        <span>Fetched skill '@antigravity/shadcn-ui'</span>
                      </div>
                      <div className="text-slate-400 pl-5">
                        ↳ Stored in canonical: <span className="text-blue-300">~/.agents/skills/shadcn-ui</span>
                      </div>
                      <div className="text-slate-400 pl-5">
                        ↳ Symlinks verified: <span className="text-emerald-300">Cursor, Claude, Windsurf, +78 agents</span>
                      </div>
                      <div className="text-emerald-400 pt-1 font-semibold">
                        ✔ Done! Immediately ready across your entire workspace (0ms).
                      </div>
                    </div>
                  ) : null}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                  {isZh
                    ? '支持任何通过 npx 或第三方 CLI 安装的 skills，完全与官方 Skill One 仓库同源互通。'
                    : 'Works with any CLI command. Skills written to ~/.agents/skills are automatically shared across all agents.'}
                </p>
              </div>
            )}

            {/* TAB 3: Chat Agent Prompt Simulation */}
            {activeTab === 'chat' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <img src="/agents/icons/cursor-color.svg" alt="Agent" className="size-4 rounded" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {t.chatTab.chatTitle}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSendChat}
                    disabled={chatPromptSending}
                    className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-sans transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="size-3" />
                    <span>{chatPromptSending ? (isZh ? '智能体处理中...' : 'Processing...') : (isZh ? '模拟对话安装' : 'Test Chat Install')}</span>
                  </button>
                </div>

                {/* Simulated Chat Messages */}
                <div className="space-y-3">
                  {/* User Message */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 text-white px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs">
                      {t.chatTab.userMessage}
                    </div>
                  </div>

                  {/* Assistant Reply */}
                  {chatPromptSending ? (
                    <div className="flex items-start gap-3">
                      <img src="/skill-one-transparent.png" alt="AI" className="size-6 object-contain mt-1 animate-pulse" />
                      <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 font-mono flex items-center gap-2">
                        <span className="size-2 rounded-full bg-blue-500 animate-ping" />
                        <span>{isZh ? 'Agent 正在向 ~/.agents/skills 写入技能...' : 'Agent writing to ~/.agents/skills...'}</span>
                      </div>
                    </div>
                  ) : chatPromptSent ? (
                    <div className="flex items-start gap-3">
                      <img src="/skill-one-transparent.png" alt="AI" className="size-6 object-contain mt-1" />
                      <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-3 text-xs sm:text-sm leading-relaxed border border-slate-200 dark:border-white/5 shadow-2xs">
                        <p className="mb-2">{t.chatTab.agentMessage}</p>
                        <div className="p-2 rounded-lg bg-white dark:bg-black/30 border border-slate-200/80 dark:border-white/5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <Check className="size-3" />
                          <span>~/.agents/skills/shadcn-ui (Active in all 80+ agents)</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400">
                  {isZh
                    ? '直接在日常对话中指示 Agent 抓取技能，生成的技能同样落地在统一物理仓库中，其他所有工具立刻享有。'
                    : 'Prompt your agent to write or fetch skills. Everything saves into ~/.agents/skills, instantly recognized everywhere.'}
                </div>
              </div>
            )}

            {/* TAB 4: Git Clone / Manual Drag Simulation */}
            {activeTab === 'git' && (
              <div className="space-y-4 animate-in fade-in duration-300 font-mono">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="size-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs text-slate-800 dark:text-slate-200 font-semibold">{t.gitTab.termTitle}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono">100% Open & Native</span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 text-slate-200 text-xs sm:text-[13px] leading-relaxed space-y-2 select-text shadow-inner">
                  <div className="text-slate-500"># Navigate to Skill One central skills repository</div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">~</span>
                    <span className="text-blue-400">$</span>
                    <span className="text-white font-semibold">cd ~/.agents/skills</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-emerald-400">~/.agents/skills</span>
                    <span className="text-blue-400">$</span>
                    <span className="text-white font-semibold">git clone https://github.com/my-org/custom-ai-skills</span>
                  </div>
                  <div className="text-emerald-400 pt-1">
                    ✔ Cloned into 'custom-ai-skills'. Immediately active in all 80+ agents.
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 font-sans leading-relaxed">
                  {t.gitTab.explain}
                </p>
              </div>
            )}

            {/* Bottom Actions Row with Reset Demo */}
            <div className="mt-6 pt-3.5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${isBusy ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`} />
                <span>
                  {isBusy
                    ? (isZh ? '正在写入中央物理仓库...' : 'Writing to central physical repo...')
                    : (isZh ? '单一物理实体 · 所有工具直接读取' : 'Single physical entity · Read by all tools')}
                </span>
              </span>
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                title={isZh ? '重置演示状态' : 'Reset demo state'}
              >
                <RotateCcw className="size-3" />
                <span>{isZh ? '重置演示' : 'Reset'}</span>
              </button>
            </div>
          </div>

          {/* Right Column: Physical Single Source Convergence Architecture */}
          <div className={`lg:col-span-5 rounded-2xl border-2 transition-all duration-300 p-6 sm:p-7 backdrop-blur-md flex flex-col justify-between shadow-md ${
            isSynced
              ? 'border-emerald-400/90 dark:border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20'
              : 'border-slate-200 dark:border-white/10 bg-slate-50/40 dark:bg-slate-900/60'
          }`}>
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-emerald-200/80 dark:border-emerald-500/20 mb-5">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs sm:text-sm">
                  <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t.centralRepoLabel}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono font-semibold">
                  Physical Source
                </span>
              </div>

              {/* Central Repository Node Box */}
              <div className={`p-4 rounded-xl border transition-all duration-300 shadow-xs mb-6 ${
                isSynced
                  ? 'bg-white dark:bg-black/60 border-emerald-400 dark:border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'bg-white dark:bg-black/40 border-emerald-300 dark:border-emerald-500/30'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <img src="/skill-one-transparent.png" alt="Skill One" className="size-6 object-contain" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                      ~/.agents/skills
                    </span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold font-mono">
                    {isZh ? '唯一物理文件' : '1 Physical Copy'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 mt-2">
                  <span>{t.physicalSingleNotice}</span>
                  {isSynced && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      {isZh ? '✔ 已就绪' : '✔ Ready'}
                    </span>
                  )}
                </div>
              </div>

              {/* Symlink Downstream Flow */}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between mb-2.5">
                  <span className="flex items-center gap-1.5">
                    <Zap className="size-3.5 text-blue-500" />
                    <span>{t.symlinkedToAgents}</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                    {isSynced ? '0ms 同步延迟' : '等待写入'}
                  </span>
                </div>

                {/* 4 Agent Symlink Row Previews */}
                <div className="space-y-2 text-[11px] font-mono">
                  <div className={`p-2.5 rounded-lg border flex items-center justify-between shadow-2xs transition-all duration-300 ${
                    isSynced
                      ? 'bg-white dark:bg-slate-800/90 border-emerald-400/80 dark:border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-white/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      <img src="/agents/icons/cursor-color.svg" alt="Cursor" className="size-4 rounded" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium">.cursor/skills</span>
                    </div>
                    <span className="text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center gap-1">
                      <Check className="size-3" />
                      <span>{isZh ? '软链 ➔ 秒级生效' : 'symlink ➔ active'}</span>
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-lg border flex items-center justify-between shadow-2xs transition-all duration-300 ${
                    isSynced
                      ? 'bg-white dark:bg-slate-800/90 border-emerald-400/80 dark:border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-white/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      <img src="/agents/icons/claudecode-color.svg" alt="Claude" className="size-4 rounded" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium">.claude/skills</span>
                    </div>
                    <span className="text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center gap-1">
                      <Check className="size-3" />
                      <span>{isZh ? '软链 ➔ 秒级生效' : 'symlink ➔ active'}</span>
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-lg border flex items-center justify-between shadow-2xs transition-all duration-300 ${
                    isSynced
                      ? 'bg-white dark:bg-slate-800/90 border-emerald-400/80 dark:border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-white/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      <img src="/agents/icons/windsurf.svg" alt="Windsurf" className="size-4 rounded" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium">.windsurf/rules</span>
                    </div>
                    <span className="text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center gap-1">
                      <Check className="size-3" />
                      <span>{isZh ? '软链 ➔ 秒级生效' : 'symlink ➔ active'}</span>
                    </span>
                  </div>

                  <div className={`p-2.5 rounded-lg border flex items-center justify-between shadow-2xs transition-all duration-300 ${
                    isSynced
                      ? 'bg-white dark:bg-slate-800/90 border-emerald-400/80 dark:border-emerald-500/40 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-white/10'
                  }`}>
                    <div className="flex items-center gap-2">
                      <img src="/agents/icons/cline-color.svg" alt="Cline" className="size-4 rounded" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium">.cline/skills</span>
                    </div>
                    <span className="text-emerald-600 dark:text-emerald-400 text-[10px] flex items-center gap-1">
                      <Check className="size-3" />
                      <span>{isZh ? '软链 ➔ 秒级生效' : 'symlink ➔ active'}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Guarantee Metrics */}
            <div className="mt-6 pt-4 border-t border-emerald-200/80 dark:border-emerald-500/20 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-medium">
              <span>{isZh ? '全生态零延时共享' : 'Zero-delay multi-agent readiness'}</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">0ms / 0 MB</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
