# Skill One Promotional Website

This document outlines the architecture, design principles, and developer guide for the official Skill One promotional website built with Astro.

## 1. Overview & Best Practices

The Skill One website is engineered according to modern industry best practices for developer tool landing pages:

1. **Instant Value Proposition**:
   - Above-the-fold clarity answering "What is it?" and "Why do I need it?" in 3 seconds.
   - Core tagline: *"Install Once. Ready for Every AI Agent."*
   - Highlights the core benefit: eliminating manual directory copy-pasting across Cursor, Claude Desktop, Windsurf, Cline, and Roo Code.

2. **Signature Interactive Showcase**:
   - Recreates the software's iconic **Agents Graph & Central Hub Dashboard**.
   - Features central Hub with active skill chips and live statistics.
   - Symmetrically connects left and right agent nodes via horizontal S-curve SVG ribbons with animated shimmer energy flows.
   - Allows visitors to click skills or agent toggles, demonstrating instant broadcast propagation through OS-level symlinks.

3. **Core Architectural Principle (Single Physical Repository)**:
   - All AI agents share the **exact same physical skills repository** (`~/.agents/skills`) via native OS symlinks.
   - Fully compatible with multi-channel installation workflows:
     - Built-in Skill One market
     - Third-party CLI tools (`npx skills add ...`)
     - In-agent conversational installation (instructing Cursor, Claude, etc. in chat to install a skill)
     - Direct `git clone` or filesystem drop
   - Because all agents physically share the identical repository, no background synchronization daemons or file duplication are required. The UI broadcast animation serves as an intuitive visual metaphor to demonstrate instant multi-agent readiness.

4. **Platform Download Matrix**:
   - **Supported Platform (macOS Apple Silicon ARM64)**: Direct DMG file download (`Skill.One_0.22.0_aarch64.dmg`), triggering direct download without redirecting to source repository pages.
   - **Unsupported Platforms (macOS Intel x64, Windows, Linux)**: Explicitly displays "Coming Soon" / "即将推出" with interactive toast notifications.

5. **Contrast Storytelling (Problem vs. Solution)**:
   - Clear side-by-side comparison between the chaos of multi-agent silos vs. Skill One's Single Source of Truth architecture.

6. **Bento Grid Feature Architecture**:
   - Highlights the 5 core technical pillars:
     - Symlink Zero-Overhead Engine
     - 80+ Agents Auto-Detection
     - Universal Install Sources (Market / npx / Agents)
     - Per-Agent Granular Toggles
     - 100% Local-First & Rust Performance

7. **Supported Agent Ecosystem Matrix**:
   - Interactive searchable and filterable directory covering 81 AI coding assistants with official icons and detection paths.

8. **Technical & SEO Excellence**:
   - Built on Astro 5 Static Site Generation (SSG) for sub-second page loads.
   - React Islands (`client:load`, `client:visible`) for interactivity without client-side framework bloat.
   - First-class English (`/`) and Simplified Chinese (`/zh/`) internationalization.
   - Complete OpenGraph, Twitter Cards, and schema.org `SoftwareApplication` structured data.

## 2. Directory Structure

```text
website/
├── astro.config.mjs         # Astro configuration with React & Tailwind Vite plugins
├── package.json             # Workspace package manifest
├── tsconfig.json            # TypeScript configuration
├── public/                  # Static assets (favicons, transparent logo, agent icons)
└── src/
    ├── styles/global.css    # Tailwind CSS v4 design tokens and animations
    ├── data/agents.json     # Curated metadata for 81 supported agents
    ├── i18n/translations.ts # English & Chinese localization dictionaries
    ├── layouts/Layout.astro # Base layout with SEO, OpenGraph & schema metadata
    ├── components/
    │   ├── Navbar.tsx       # Responsive navigation bar with language switcher
    │   ├── Hero.astro       # Hero section with CTAs & trust seals
    │   ├── HeroAgentGraph.tsx # High-fidelity interactive S-curve ribbon graph
    │   ├── ProblemSolution.astro # Problem vs. solution comparison
    │   ├── BentoFeatures.astro   # 5-card architectural Bento Grid
    │   ├── AgentEcosystem.tsx    # Searchable & filterable 81-agent directory
    │   ├── HowItWorks.astro      # 3-step workflow
    │   ├── DownloadSection.astro # macOS, Windows, Linux download options
    │   ├── FAQSection.astro      # Developer FAQ accordion
    │   └── Footer.astro          # Footer with links and license
    └── pages/
        ├── index.astro      # English landing page
        └── zh/index.astro   # Chinese landing page
```

## 3. Development & Verification

### Running the Website Locally

From the repository root:

```bash
# Run development server on port 4321
pnpm --filter website dev

# Build production bundle
pnpm --filter website build

# Preview production build on port 4321
pnpm --filter website preview
```

The site will be accessible at:
- **English**: `http://localhost:4321/`
- **Chinese**: `http://localhost:4321/zh/`
