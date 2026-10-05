import React, { useState } from 'react';
import { translations } from '../i18n/translations';
import { Download, Menu, X, Globe, Sparkles } from 'lucide-react';
import { GithubIcon } from './GithubIcon';

interface NavbarProps {
  lang?: 'en' | 'zh';
}

export function Navbar({ lang = 'en' }: NavbarProps) {
  const t = translations[lang].nav;
  const isZh = lang === 'zh';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-[#090d16]/80 backdrop-blur-xl border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <a href={isZh ? '/zh/' : '/'} className="flex items-center gap-2.5 group">
          <div className="relative">
            <img
              src="/skill-one-transparent.png"
              alt="Skill One"
              className="size-8 object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_2px_8px_rgba(59,130,246,0.4)]"
            />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-white flex items-center gap-1.5">
              Skill One
              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
                v0.22.0
              </span>
            </span>
          </div>
        </a>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-white transition-colors">
            {t.features}
          </a>
          <a href="#how-it-works" className="hover:text-white transition-colors">
            {t.howItWorks}
          </a>
          <a href="#ecosystem" className="hover:text-white transition-colors">
            {t.agents}
          </a>
          <a href="#faq" className="hover:text-white transition-colors">
            {t.faq}
          </a>
        </nav>

        {/* Right CTA / Language / GitHub */}
        <div className="hidden sm:flex items-center gap-3">
          {/* Language Switcher */}
          <a
            href={t.switchLangUrl}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors border border-transparent hover:border-white/10"
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
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors border border-white/10"
          >
            <GithubIcon className="size-4" />
            <span>GitHub</span>
          </a>

          {/* Download CTA */}
          <a
            href="#download"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-md shadow-blue-600/20"
          >
            <Download className="size-3.5" />
            <span>{t.download}</span>
          </a>
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex sm:hidden items-center gap-2">
          <a
            href={t.switchLangUrl}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white text-xs border border-white/10"
          >
            {t.switchLang}
          </a>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden px-4 pt-3 pb-6 border-b border-white/10 bg-[#090d16] space-y-3">
          <a
            href="#features"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            {t.features}
          </a>
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            {t.howItWorks}
          </a>
          <a
            href="#ecosystem"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            {t.agents}
          </a>
          <a
            href="#faq"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-300 hover:text-white"
          >
            {t.faq}
          </a>
          <div className="pt-2 flex flex-col gap-2">
            <a
              href="https://github.com/skill-one/skill-one"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold text-slate-300 bg-white/5 border border-white/10"
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
