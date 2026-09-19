# Development & Git Workflow

## Mandatory policy after every validated code change

1. Run `npm run validate` (format check → typecheck → tests → build).
2. Review `git status` and `git diff`.
3. Create a meaningful commit (imperative mood, describe the _why_).
4. Push to the GitHub repository specified by the user.
5. Verify the remote branch and record the commit SHA.

## Rules

- If no GitHub repository is configured, **ask before the first push**.
- Never create a GitHub repository without explicit user approval.
- Never commit secrets, credentials, API keys or `.env` files
  (`.gitignore` blocks them; `.env.example` is allowed).
- Failed changes are never marked as completed.

## Commands

```bash
npm install          # setup
npm run validate     # format + typecheck + test + build
npm test             # tests only
npm run agent:demo   # end-to-end demo after build
```

## Commit style

- `area: summary` (e.g. `risk: add fixed-fractional position sizing tool`)
- Body explains motivation; safety-relevant changes call it out explicitly.

## CI

`.github/workflows/ci.yml` runs `npm run validate` on every push and PR
(Node 20 and 22). CI passing is required before a push is considered valid.
