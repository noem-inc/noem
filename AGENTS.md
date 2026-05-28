# Global AI Agent Rules

## Git & Execution Constraints

- NEVER execute `git commit` or `git push` autonomously.
- ALWAYS display a summary of staged changes to the user first.
- WAIT for explicit, active human confirmation (e.g., "approve" or "commit") before executing any commit tool or bash command.

## Environment Constraints

- Do not install new packages without asking.
- Do not delete files without explicit confirmation.
