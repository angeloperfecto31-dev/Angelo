# ElectricalPH — notes for Claude Code

This repository is edited by both Claude Code and Google AI Studio. Follow
`DEVELOPMENT_WORKFLOW.md`. The essentials:

- **Before editing:** `git status -sb`, `git fetch origin --prune`, then fast-forward
  `main` (`git merge --ff-only origin/main`). If the tree is dirty or the fast-forward
  fails, stop and preserve the work (branch or stash). Never `reset --hard`.
- **Shared branch is `main`.** The live site deploys from `production`. Never push to
  `production` or deploy to Vercel Production without explicit approval in chat.
- **Before committing:** `npm run lint` and `npm run build` (in Git Bash on Windows).
  Stage files by name and don't stage unintended `package-lock.json` churn.
- **After pushing:** confirm with `git fetch origin && git status -sb` and report the
  real commit hash. Never say "synced" without that check.
- Never force-push. Never commit secrets: the repository is public, and that includes
  API keys, Firebase ID tokens, and service-account JSON.
- Preview deployments use the **same Firebase project and data** as Production.
- This is an existing product. Preserve the calculation modules (load schedule, SLD,
  short circuit, voltage drop, illumination, transformer, power analysis, solar, BOM),
  the exports, auth, payments/subscriptions, and the admin features. Don't refactor
  unrelated code.
