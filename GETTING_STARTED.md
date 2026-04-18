# Getting Started with Overseer

Overseer is a real-time AI code analysis tool. It watches your project and provides instant architectural feedback, security checks, and pattern validation.

**Time to first analysis: 2 minutes**

---

## Installation

### Quick Start (no installation needed)

```bash
npx overseer login
npx overseer watch .
```

### Install globally

```bash
npm install -g @useoverseer/daemon
overseer login
overseer watch .
```

---

## Step 1: Login (one time only)

```bash
npx overseer login
```

**What happens:**
1. Browser opens automatically
2. You log in with email/password (or create account)
3. Token is saved locally to `~/.overseer/auth.json`
4. You're ready to go

---

## Step 2: Start Watching

```bash
cd /path/to/your/project
npx overseer watch .
```

**What happens:**
1. Daemon starts
2. **Dashboard opens automatically** in your browser
3. `👀 Watching for changes...`
🚀 Overseer daemon v0.1.0
📁 Project: my-awesome-api
✅ Connected to backend
👀 Watching for changes...
[waiting for file changes...]

---

## Step 3: Write Code

Make any change to your project:

```bash
# Create a new file, edit existing one, delete something
# Overseer detects it automatically
```

**You'll see on the dashboard:**
- ✅ File path that changed
- 💡 Suggested approach
- 🔍 Real-time analysis
- 🎯 Alignment score
- ⚠️ Issues found (if any)

---

## What Overseer Shows

### Suggested Approach (Blue card)
What Overseer thinks is the best way to write this code based on your project context.

### Better Approach? (Yellow/Green card)
Alternative if something better exists.

### Every Change Explained (Purple card)
Line-by-line breakdown of what your code does.

### Alignment Check (Indigo card)
Does your code match your project's architecture, security requirements, and tech choices?

### Architectural Decisions (Teal card)
Important decisions Overseer detected in your code.

---

## Project Context Files (Optional)

Overseer reads your project docs for richer analysis. Create these in your project root:

- `README.md` — Project overview
- `ARCHITECTURE.md` — Design decisions
- `TECH_CHOICES.md` — Why you chose each tech
- `SECURITY.md` — Security requirements
- `PROJECT_CONTEXT.json` — Goals, constraints, team info

**Example ARCHITECTURE.md:**

```markdown
# Architecture

## Tech Stack
- Node.js + Express
- PostgreSQL
- React frontend

## Auth Method
Use JWT tokens, not sessions (for horizontal scaling)

## Database Pattern
All queries must go through ORM (Prisma)

## Error Handling
All errors logged to Sentry
Return consistent format: { code, message, timestamp }
```

---

## Commands

### Watch a directory

```bash
# Current directory
npx overseer watch .

# Subdirectory
npx overseer watch ./src

# Absolute path
npx overseer watch /Users/you/projects/my-app
```

### Login again (if token expires)

```bash
npx overseer login
```

### Reset everything

```bash
rm ~/.overseer/auth.json
npx overseer login
```

### Debug mode

```bash
npx overseer watch . --debug
```

### Get help

```bash
npx overseer --help
```

---

## How It Works
Your code editor
↓
File saved
↓
Overseer daemon detects change
↓
Sends to backend with project context
↓
 Analysis engine 
↓
Real-time results on dashboard
↓
You review and iterate

**Latency:** ~0.2-5 seconds from file save to dashboard

---

## FAQ

**Q: Is my code sent to Overseer servers?**
A: Yes, file contents are sent for analysis. Everything encrypted in transit.

**Q: What about private/proprietary code?**
A: Keep `.env`, secrets, and API keys out of your files.

**Q: Can I use it offline?**
A: No, requires internet connection to Overseer backend.

**Q: Does it slow down my IDE?**
A: No. Overseer runs in a separate daemon.

**Q: What's the latency?**
A: ~ 0.2-5 seconds from file save to dashboard.

**Q: How much does it cost?**
A: Free during beta. Paid plans coming soon.

---

## Support

- Issues: https://overseer-zeta.vercel.app/
- Dashboard: https://overseer-main-dashboard.vercel.app

---

**Happy coding! 🚀**
