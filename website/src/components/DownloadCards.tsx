import React, { useState, useEffect } from 'react';
import { translations } from '../i18n/translations';
import { Download, Apple, Monitor, Terminal, Clock, Check, X, Sparkles } from 'lucide-react';
import {
  MAC_ARM_DMG_URL,
  DMG_FILENAME,
  MAC_X64_DMG_URL,
  MAC_X64_DMG_FILENAME,
  WIN_EXE_URL,
  WIN_EXE_FILENAME,
  WIN_MSI_URL,
  WIN_MSI_FILENAME,
  LINUX_APPIMAGE_URL,
  LINUX_APPIMAGE_FILENAME,
  LINUX_DEB_URL,
  LINUX_DEB_FILENAME,
} from '../lib/version';

interface DownloadCardsProps {
  lang?: 'en' | 'zh';
}

export const DownloadCards: React.FC<DownloadCardsProps> = ({ lang = 'en' }) => {
  const t = translations[lang].download;
  const isZh = lang === 'zh';

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const handlePlatformToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string }>;
      if (customEvent.detail?.message) {
        setToastMessage(customEvent.detail.message);
      }
    };
    window.addEventListener('show-platform-toast', handlePlatformToast);
    return () => window.removeEventListener('show-platform-toast', handlePlatformToast);
  }, []);

  const triggerDownloadFeedback = (key: string) => {
    setDownloadTriggered(key);
    setTimeout(() => setDownloadTriggered(null), 3000);
  };

  return (
    <div className="relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 shadow-2xl border border-slate-700 dark:border-slate-200 backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-md text-xs sm:text-sm font-medium"
        >
          <Clock className="size-4 text-amber-400 dark:text-amber-600 shrink-0" />
          <span className="flex-1">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 rounded-md hover:bg-white/10 dark:hover:bg-slate-200 text-slate-400 hover:text-white dark:hover:text-slate-900 transition-colors"
            aria-label="Close message"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Download Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* macOS Card */}
        <div className="rounded-2xl border-2 border-blue-400/80 dark:border-blue-500/40 bg-white dark:bg-slate-900/90 p-6 backdrop-blur-md flex flex-col justify-between relative shadow-lg ring-1 ring-blue-500/10">
          <div className="absolute -top-3 right-4 px-3 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1">
            <Sparkles className="size-3" />
            <span>{t.recommended}</span>
          </div>

          <div>
            <div className="size-11 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
              <Apple className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">macOS</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">{t.macReq}</p>

            <div className="space-y-3">
              {/* Apple Silicon direct download */}
              <a
                href={MAC_ARM_DMG_URL}
                download={DMG_FILENAME}
                onClick={() => triggerDownloadFeedback('mac-arm')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold transition-all shadow-sm hover:shadow group"
              >
                <div className="flex items-center gap-2.5">
                  {downloadTriggered === 'mac-arm' ? (
                    <Check className="size-4 text-emerald-300" />
                  ) : (
                    <Download className="size-4 group-hover:translate-y-0.5 transition-transform" />
                  )}
                  <span>{t.macArm}</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-blue-700/60 font-mono font-normal">
                  {isZh ? '直接下载' : 'Direct DMG'}
                </span>
              </a>

              {/* Intel Mac direct download */}
              <a
                href={MAC_X64_DMG_URL}
                download={MAC_X64_DMG_FILENAME}
                onClick={() => triggerDownloadFeedback('mac-intel')}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-medium transition-colors group"
              >
                <div className="flex items-center gap-2">
                  {downloadTriggered === 'mac-intel' ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Download className="size-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  )}
                  <span>{t.macIntel}</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-mono font-normal">
                  .dmg
                </span>
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
            {t.macSubtext}
          </div>
        </div>

        {/* Windows Card */}
        <div className="rounded-2xl border-2 border-slate-200/90 dark:border-white/10 bg-white dark:bg-slate-900/90 p-6 backdrop-blur-md flex flex-col justify-between shadow-lg">
          <div>
            <div className="size-11 rounded-xl bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 mb-4">
              <Monitor className="size-6" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Windows</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                {isZh ? '正式支持' : 'Supported'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">{t.winReq}</p>

            <div className="space-y-3">
              {/* Windows NSIS Setup Exe */}
              <a
                href={WIN_EXE_URL}
                download={WIN_EXE_FILENAME}
                onClick={() => triggerDownloadFeedback('win-exe')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-semibold transition-all shadow-sm hover:shadow group"
              >
                <div className="flex items-center gap-2.5">
                  {downloadTriggered === 'win-exe' ? (
                    <Check className="size-4 text-emerald-300" />
                  ) : (
                    <Download className="size-4 group-hover:translate-y-0.5 transition-transform" />
                  )}
                  <span>{t.windows}</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-sky-700/60 font-mono font-normal">
                  {isZh ? '安装包 (.exe)' : 'Setup (.exe)'}
                </span>
              </a>

              {/* Windows MSI */}
              <a
                href={WIN_MSI_URL}
                download={WIN_MSI_FILENAME}
                onClick={() => triggerDownloadFeedback('win-msi')}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-medium transition-colors group"
              >
                <div className="flex items-center gap-2">
                  {downloadTriggered === 'win-msi' ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Download className="size-3.5 text-slate-400 group-hover:text-sky-500 transition-colors" />
                  )}
                  <span>Windows Installer (.msi)</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-mono font-normal">
                  .msi
                </span>
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
            {t.winSubtext}
          </div>
        </div>

        {/* Linux Card */}
        <div className="rounded-2xl border-2 border-slate-200/90 dark:border-white/10 bg-white dark:bg-slate-900/90 p-6 backdrop-blur-md flex flex-col justify-between shadow-lg">
          <div>
            <div className="size-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-4">
              <Terminal className="size-6" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Linux</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                {isZh ? '正式支持' : 'Supported'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Ubuntu, Debian, Fedora, Arch</p>

            <div className="space-y-3">
              {/* Linux AppImage */}
              <a
                href={LINUX_APPIMAGE_URL}
                download={LINUX_APPIMAGE_FILENAME}
                onClick={() => triggerDownloadFeedback('linux-appimage')}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-semibold transition-all shadow-sm hover:shadow group"
              >
                <div className="flex items-center gap-2.5">
                  {downloadTriggered === 'linux-appimage' ? (
                    <Check className="size-4 text-emerald-300" />
                  ) : (
                    <Download className="size-4 group-hover:translate-y-0.5 transition-transform" />
                  )}
                  <span>AppImage</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-emerald-700/60 font-mono font-normal">
                  {isZh ? '免安装' : 'Standalone'}
                </span>
              </a>

              {/* Linux DEB */}
              <a
                href={LINUX_DEB_URL}
                download={LINUX_DEB_FILENAME}
                onClick={() => triggerDownloadFeedback('linux-deb')}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 text-xs font-medium transition-colors group"
              >
                <div className="flex items-center gap-2">
                  {downloadTriggered === 'linux-deb' ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Download className="size-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                  )}
                  <span>Debian / Ubuntu</span>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-mono font-normal">
                  .deb
                </span>
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 text-center">
            {t.linuxSubtext}
          </div>
        </div>
      </div>
    </div>
  );
};

