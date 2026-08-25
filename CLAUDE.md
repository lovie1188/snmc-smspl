# CLAUDE.md — Claude Code & Claude Assistant Project Guidelines

## Mandatory Git Push & Deployment Protocol

Deploying several times consumes plan credits in Netlify.
Therefore, Claude MUST strictly follow these instructions on every task:

1. **Local-First Testing**:
   - All changes, bug fixes, and feature implementations MUST first be made and verified on the Local Server (`http://localhost:8080` / `http://127.0.0.1:8080`).
2. **Mandatory Explicit Confirmation for Git Push**:
   - When the work is complete and verified, present a concise summary of the changes to the user.
   - Explicitly ask the user for permission before running `git push` or triggering any remote deployments.
3. **No Autonomous Push**:
   - NEVER execute `git push` autonomously.
   - Code will ONLY be pushed to the remote GitHub repository after the user explicitly responds with "Yes", "Push", or "Deploy".
