import React, { useState, useEffect } from 'react';
import { translations } from '../i18n/translations';
import { Download, Menu, X, Globe, Sun, Moon } from 'lucide-react';
import { GithubIcon } from './GithubIcon';
import { APP_VERSION } from '../lib/version';

interface NavbarProps {
  lang?: 'en' | 'zh';
}

export function Navbar({ lang = 'en' }: NavbarProps) {
  const t = translations[lang].nav;
  const isZh = lang === 'zh';
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme
    const darkActive = document.documentElement.classList.contains('dark');
    setIsDark(darkActive);
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    if (nextIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('skill-one-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('skill-one-theme', 'light');
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-colors duration-200 bg-white/80 dark:bg-[#090d16]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <a href={isZh ? `${base}/zh/` : `${base}/`} className="flex items-center gap-2.5 group">
          <div className="relative">
            <img
              src={`${base}/skill-one-transparent.png`}
              alt="Skill One"
              className="size-8 object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_2px_8px_rgba(59,130,246,0.3)]"
            />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              Skill One
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                v{APP_VERSION}
              </span>
            </span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            {t.features}
          </a>
          <a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            {t.howItWorks}
          </a>
          <a href="#ecosystem" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            {t.agents}
          </a>
          <a href="#faq" className="hover:text-slate-900 dark:hover:text-white transition-colors">
            {t.faq}
          </a>
        </nav>

        {/* Right CTA / Theme / Language / GitHub */}
        <div className="hidden lg:flex items-center gap-2.5">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-slate-600" />}
          </button>

          {/* Language Switcher */}
          <a
            href={`${base}${t.switchLangUrl}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
            title="Switch Language"
          >
            <Globe className="size-3.5" />
            <span>{t.switchLang}</span>
          </a>

          {/* GitHub Link */}
          <a
            href="https://github.com/skill-one/skill-one"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors border border-slate-200 dark:border-white/10"
          >
            <GithubIcon className="size-4" />
            <span>GitHub</span>
          </a>

          {/* Download CTA */}
          <a
            href="#download"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-sm"
          >
            <Download className="size-3.5" />
            <span>{t.download}</span>
          </a>
        </div>

        {/* Mobile Hamburger & Theme Toggle */}
        <div className="flex lg:hidden items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10"
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4" />}
          </button>
          <a
            href={`${base}${t.switchLangUrl}`}
            className="px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-slate-700 dark:text-slate-300 text-xs border border-slate-200 dark:border-white/10"
          >
            {t.switchLang}
          </a>
          <a
            href="#download"
            className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-xs"
          >
            <Download className="size-3.5" />
            <span>{t.download}</span>
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 sm:p-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden px-4 pt-3 pb-6 border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-[#090d16]/95 backdrop-blur-2xl space-y-3 shadow-lg">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600"
          >
            {t.features}
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600"
          >
            {t.howItWorks}
          </a>
          <a
            href="#ecosystem"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600"
          >
            {t.agents}
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600"
          >
            {t.faq}
          </a>
          <div className="pt-2 flex flex-col gap-2">
            <a
              href="https://github.com/skill-one/skill-one"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10"
            >
              <GithubIcon className="size-4" />
              <span>GitHub</span>
            </a>
            <a
              href="#download"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-white bg-blue-600"
            >
              <Download className="size-4" />
              <span>{t.download}</span>
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
