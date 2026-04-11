# overseer

Overseer is the only system that watches every file change in real time, builds persistent memory across sessions, and shows the entire team exactly what the AI just did — without anyone lifting a finger.

# What makes Overseer different
Unlike traditional code review tools that only analyze pull requests after the code is written, Overseer is a real-time AI co-pilot that silently watches your codebase as you (or your AI) code. It automatically detects every change, understands context across files and sessions, and instantly surfaces clear, persistent cards explaining what was changed and why — no manual diffs, no copy-pasting, no forgotten history.  It’s the only tool that gives your entire team live visibility into exactly what the AI is building, turning chaotic AI-assisted development into something transparent, auditable, and actually controllable.



## Project structure
packages/daemon    → CLI file watcher (npm package)
packages/backend   → Express + WebSocket + engine (Railway)
packages/dashboard → Next.js dashboard (Vercel)

## Quick start (development)


1. Start backend: cd packages/backend && npm run dev
2. Start dashboard: cd packages/dashboard && npm run dev
3. In your project: npx overseer watch

## Architecture
See .agent/skills/overseer-architecture/SKILL.md for complete data flow.

## Development rules
See .agent/rules.md for agent constraints and stack requirements.

## Status
Project scaffold complete.
