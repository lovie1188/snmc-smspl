---
description: Mandatory User Confirmation for Git Push & Remote Deployments to preserve Netlify build credits
globs: *
---

# Deploy & Git Push Protocol (Mandatory Confirmation Rule)

Deploying several times consumes plan credits in Netlify. Therefore, AI coding agents (Antigravity, Antigravity IDE, Gemini, Cursor, Cline, Claude, Copilot) MUST follow this strict protocol:

1. **Local-First Testing**:
   - All changes must first be made and verified on the **Local Server (`localhost:8080`)**.
2. **Mandatory Explicit Confirmation**:
   - When the work is fully complete and verified, the agent MUST present a summary of changes to the user.
   - The agent MUST explicitly ask the user for permission before running `git push` or triggering remote deployments.
3. **No Automatic Push**:
   - The agent must NEVER run `git push` autonomously.
   - Code will ONLY be pushed to the remote repository after the user explicitly responds with **"Yes"**, **"Push"**, or **"Deploy"**.
