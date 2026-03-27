# overseer

Real-time AI agent narration tool. Watches file changes made by AI
coding agents and explains them in plain English on a live dashboard.

## Project structure
packages/daemon    → CLI file watcher (npm package)
packages/backend   → Express + WebSocket + Gemini (Railway)
packages/dashboard → Next.js dashboard (Vercel)

## Quick start (development)

1. Fill in .env files in each package (copy from .env.example)
2. Start backend: cd packages/backend && npm run dev
3. Start dashboard: cd packages/dashboard && npm run dev
4. In your project: npx overseer watch

## Architecture
See .agent/skills/overseer-architecture/SKILL.md for complete data flow.

## Development rules
See .agent/rules.md for agent constraints and stack requirements.

## Status
Project scaffold complete. Core implementation by Claude (claude.ai).
