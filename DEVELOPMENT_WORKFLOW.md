# ElectricalPH — Development Workflow

How to move work between **Claude Code** and **Google AI Studio** on the same
codebase without losing changes, and without pushing untested code to the live site.

Last verified: 2026-10-22.

---

## 1. Where things live

| What | Where |
|---|---|
| Source of truth | GitHub: `https://github.com/angeloperfecto31-dev/Angelo` (public repository) |
| Shared development branch | `main` |
| Production branch | `production` (see section 7 for the one-time Vercel switch) |
| Hosting | Vercel project `electrical-ph` (team `electrical-ph-s-projects`) |
| AI Studio app | `https://aistudio.google.com/apps/13d3120e-e17b-4db1-a8bd-aada239852cf` |
| Firebase project | `gen-lang-client-0922536866`, Firestore database `ai-studio-13d3120e-e17b-4db1-a8bd-aada239852cf` |
| Local clone (Windows) | `C:\Users\ENGINEER\Documents\GitHub\Angelo` |

### Branch strategy

```
 Claude Code ──┐
               ├──►  main  ──(review + PR)──►  production  ──►  Vercel Production
 AI Studio  ───┘      │
                      └──►  Vercel Preview deployments
```

- **`main`** is where both tools work. AI Studio's GitHub sync works on this branch.
  Once section 7 is done, pushes to `main` create **Preview** deployments only.
- **`production`** is what the live site runs. Change it only by merging `main` into it
  through a reviewed pull request.
- Claude Code may also use short-lived topic branches (for example `fix/voltage-drop-rounding`)
  and open a pull request into `main`. AI Studio should stay on `main`.

> **Rule: only one tool edits `main` at a time.** Finish and push in one tool before
> opening the other.

---

## 2. Facts that affect every session

- **Preview and Production share the same Firebase data.** The Firebase config
  (`firebase-applet-config.json`) is committed, not set per environment. A Preview
  deployment reads and writes the **same Firestore database and Auth users** as the live
  site. On Preview deployments, use test accounts only. Don't run bulk admin actions,
  backup/restore, or payment flows against real users.
- **Never commit secrets.** `.env*` is ignored by git (except `.env.example`).
  `GEMINI_API_KEY` and `PAYMONGO_SECRET_KEY` belong in Vercel environment variables
  and AI Studio Secrets, never in source. Firebase **ID tokens** and service-account JSON
  also count as secrets. The repository is public.
- **Lockfiles have drifted.** `bun.lock` is kept current: AI Studio updates it, and
  Vercel installs with bun when it's present. `package-lock.json` was last updated in
  July 2026 and no longer matches `package.json`, so `npm ci` fails. Locally, use
  `npm install --package-lock=false`, which leaves the tracked lockfiles untouched.
  Don't commit lockfile changes except on purpose, in their own commit.
- **On Windows, run `npm run build` from Git Bash.** The script uses POSIX syntax
  (`NODE_OPTIONS='…' vite build`), which fails in PowerShell or cmd.

---

## 3. Claude Code: start of session

Run these from `C:\Users\ENGINEER\Documents\GitHub\Angelo` (Git Bash):

```bash
git status -sb
git fetch origin --prune
git switch main
git log --oneline -1 origin/main
git merge --ff-only origin/main
```

- If `git status` shows uncommitted changes, **stop**: commit them on a branch or
  stash them (`git stash push -m "wip <date>"`). Never discard them with `reset --hard`
  or `checkout -- .`.
- If `merge --ff-only` refuses, `main` has local commits the remote doesn't have.
  See section 6.
- Review what the other tool changed since you last worked:

```bash
git log --oneline ORIG_HEAD..HEAD
git diff --stat ORIG_HEAD..HEAD
```

For larger work, branch off `main`:

```bash
git switch -c fix/short-description
```

## 4. Claude Code: end of session

```bash
git status
git diff
npm install --package-lock=false
npm run lint
npm run build
```

`npm run lint` runs `tsc --noEmit`. There's no automated test suite, so check the
modules you touched by hand with `npm run dev` (http://localhost:3000).

Commit only the intended files. Name them explicitly; don't use `git add -A`:

```bash
git add src/components/SomeFile.tsx
git commit -m "fix(voltage-drop): describe the change"
git push origin HEAD
```

Then confirm the push actually landed:

```bash
git fetch origin
git status -sb
git log --oneline -1 origin/main
```

`git status -sb` must show no `[ahead N]`, and the hash must match your commit. If you
pushed a topic branch, open a pull request into `main` on GitHub and merge it
**before** switching to AI Studio. AI Studio only sees what's on `main`.

---

## 5. Google AI Studio sessions

AI Studio Build has two-way GitHub sync (pull and push), added in August 2026.
**Branch selection is not documented.** Treat AI Studio as working on `main` only.
Known problems reported by other users: the panel sometimes says "in sync" when nothing
was pushed, and a disconnected repository sometimes can't be reconnected.
**Never trust the panel alone. Check on GitHub.**

### Start of an AI Studio session
1. Make sure the Claude Code session ended with a verified push (section 4).
2. On GitHub, note the latest commit hash on `main`:
   `https://github.com/angeloperfecto31-dev/Angelo/commits/main`
3. In AI Studio, open the app and open the **GitHub** panel. **Pull** the latest changes.
4. Confirm the pulled code includes that commit. For example, open a file Claude changed
   and check that the change is there.
5. Only then start prompting.

### End of an AI Studio session
1. In the GitHub panel, **commit and push** with a meaningful message.
2. Open the GitHub commits page and confirm a new commit appeared on `main` with your
   message and the expected time. If it didn't appear, the sync failed, even if the panel
   says "in sync". Retry, and don't switch tools until it shows up.
3. Copy the commit hash. You'll check for it in Claude Code.

### If AI Studio can't pull
If the pull fails or shows stale code, **don't edit in AI Studio**. An AI Studio push
of an old snapshot can revert Claude's work. Fix the connection first. If the existing
repository can't be reconnected, don't create a new repository from AI Studio; that would
split the codebase in two. Keep working in Claude Code until the sync is fixed.

---

## 6. Switching tools

**Claude Code → AI Studio**
1. Section 4: lint, build, commit, push, verify the hash on `origin/main`.
2. Section 5, "Start": pull in AI Studio and confirm the hash.

**AI Studio → Claude Code**
1. Section 5, "End": push and confirm the commit on GitHub.
2. Section 3: fetch, fast-forward, review `git log ORIG_HEAD..HEAD`.

### Resolving conflicts without losing work

If `git merge --ff-only origin/main` fails, or a push is rejected as non-fast-forward:

```bash
git fetch origin
git log --oneline --graph --left-right main...origin/main
git branch backup/main-$(date +%Y%m%d-%H%M) main
git merge origin/main
```

- If git reports conflicts, open each conflicted file and combine **both** sides
  deliberately. Don't automatically pick "ours" or "theirs" on calculation, export,
  auth, or payment code.
- `git diff --name-only --diff-filter=U` lists unresolved files.
- After resolving: `npm run lint`, `npm run build`, test the affected modules in
  `npm run dev`, then `git add <files>`, `git commit`, and `git push origin main`.
- **Never** `git push --force` to `main` or `production`.
- The `backup/...` branch keeps your pre-merge state. Delete it only once the merge is
  verified: `git branch -D backup/main-...`.

---

## 7. Vercel: Preview and Production

### One-time setup (manual, needs Vercel dashboard access)
Until this is done, **every push to `main` deploys to Production.**

1. Make sure the `production` branch exists on GitHub and matches the current live
   commit.
2. In Vercel, open project `electrical-ph`, go to **Settings → Git → Production Branch**,
   and set it to `production`.
3. Check **Settings → Environment Variables**: `GEMINI_API_KEY` and `PAYMONGO_SECRET_KEY`
   must exist for **Production**. Decide whether **Preview** should get them. If Preview
   uses the live PayMongo key, Preview payments are real payments; prefer a PayMongo test key.
4. A second Vercel project, `angelo`, also deploys from this repository. Either set its
   Production Branch to `production` as well, or disconnect it if it's not used.
5. GitHub Pages also deploys this repository. Turn it off under
   **GitHub → Settings → Pages** if it's not used.

### Releasing to Production
1. Push to `main`. Vercel posts a Preview URL on the commit, under GitHub commit checks.
2. Test the Preview with a **test account**: load schedule, SLD, short circuit, voltage
   drop, illumination, transformer, power analysis, solar, BOM, the Word/Excel/PDF/DXF
   exports, sign-in, and the admin dashboard.
3. On GitHub, open a pull request from `main` into `production`. Review the diff, then merge.
4. Vercel deploys `production` to the live domain. Check the live site.

### Rollback
- **Fastest:** in Vercel, go to **Deployments**, pick the last good Production deployment,
  and choose **Instant Rollback** (or **Promote to Production**). This doesn't change git.
- **Then fix git:** revert the bad merge on `production` with a pull request
  (`git revert -m 1 <merge-commit>`), so the next deploy doesn't bring the regression back.
- If a build fails, Vercel keeps serving the previous Production deployment. Read the
  build log in Vercel, reproduce it locally with `npm run build`, and fix it on `main`.

---

## 8. Branch protection (manual, GitHub settings)

Under **GitHub → Settings → Branches → Add rule** for `production`:
- Require a pull request before merging.
- Block force pushes and branch deletion.

Don't require pull requests on `main` unless AI Studio is confirmed to work with
protected branches. Otherwise its pushes will be rejected.

---

## 9. What needs manual access or can't be automated

| Action | Who / where |
|---|---|
| AI Studio pull and push | You, in the AI Studio GitHub panel (no CLI or API is available to Claude Code) |
| Vercel production branch, environment variables, rollbacks, domains | You, in the Vercel dashboard (or Claude Code once the Vercel CLI or plugin is authorized) |
| GitHub branch protection, Pages, repository visibility | You, in GitHub settings |
| Firebase Auth users, Firestore rules deploy, billing | You, in the Firebase console |
| Merging `main` into `production` | You, after reviewing a Preview |

Claude Code will not deploy to Production, force-push, change Vercel, GitHub or Firebase
settings, or touch production data without your explicit approval in chat.
