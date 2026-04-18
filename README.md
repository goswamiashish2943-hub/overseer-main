# Overseer

Real-time AI code analysis for developers.

Watch your project. Get instant architectural feedback, security checks, and pattern validation.

## Quick Start

```bash
npx overseer login
npx overseer watch .
```

That's it. Dashboard opens automatically.

## Installation

```bash
npm install -g @useoverseer/daemon
```

Or use with npx (no installation):

```bash
npx overseer login
npx overseer watch .
```

## What it does

✅ **Real-time analysis** — Every file you save gets analyzed instantly
✅ **Security checks** — Detects SQL injection, XSS, auth issues, hardcoded secrets
✅ **Architecture validation** — Ensures code matches your project's design decisions
✅ **Zero setup** — Works with any project, auto-detects git remote
✅ **Smart context** — Reads your project docs (ARCHITECTURE.md, SECURITY.md, etc.)

## How it works

1. You write code
2. File is saved
3. Overseer detects change
4. AI analyzes code
5. Dashboard shows results
6. You iterate

**Latency:** ~0.2 -5  seconds

## Documentation

- **[Getting Started](GETTING_STARTED.md)** — Full 10-minute setup guide
- **[Quick Start](QUICK_START.md)** — 2-minute setup
- **[GitHub](https://github.com/goswamiashish2943-hub/overseer-main)** — Source code
- **[Dashboard](https://overseer-main-dashboard.vercel.app)** — Live analysis

## Package

- **[@useoverseer/daemon](https://www.npmjs.com/package/@useoverseer/daemon)** — CLI & file watcher

## License

MIT

## Support

Issues: https://overseer-zeta.vercel.app/
