# Development Workflow

Workflow rules, testing conventions, Discord API limits and the release
checklist all live in **[`CLAUDE.md`](../CLAUDE.md)** at the repository root.

That file is loaded automatically by Claude Code at the start of a session,
so the conventions apply without anyone having to remember them — which is
the point. It is equally readable by humans; edit it there.

## Quick reference

- **Release checklist** — changelog → push → tag + GitHub release → deploy
- **Testing** — break the fix and confirm the test fails before trusting it
- **Discord limits** — the ones that have actually caused bugs here
- **TMDB gotchas** — genre taxonomies, silently-ignored parameters, ad-free runtimes

## GitHub Actions

See [`.github/workflows/`](./workflows/) — `deploy-docs.yml` publishes
eggshenbot.com on every push to `main` that touches `docs/`.
