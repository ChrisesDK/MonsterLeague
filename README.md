# Odense Monster League

A free, walk-to-play, location-based monster-collecting RPG set in Odense, Denmark
(working title). It ships first as a mobile web app (PWA) and runs entirely on the phone.

This repository currently contains **M0 (foundations)** and **M1 (battle engine + battle
test page)**. Map, GPS and spawning arrive in M2.

## Quick start

Requires Node 20+ and pnpm 9 (`npm i -g pnpm@9` or `corepack enable`).

```sh
pnpm install
pnpm dev          # battle test page on http://localhost:5173 (also on your LAN for phones)
```

## Commands

| Command                                                   | What it does                                           |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `pnpm lint`                                               | ESLint + Prettier check                                |
| `pnpm typecheck`                                          | `tsc --noEmit` in every package                        |
| `pnpm test`                                               | Vitest in every package                                |
| `pnpm coverage`                                           | Engine tests with coverage (fails under 90%)           |
| `pnpm validate`                                           | Validates content JSON, cross-references and i18n keys |
| `pnpm build`                                              | Production build of the client                         |
| `pnpm sim --a starter_fire:12 --b leader_water --n 10000` | AI-vs-AI battle statistics                             |

## Layout

```
packages/data      content JSON, Zod schemas, i18n (da/en), validator
packages/engine    pure, deterministic battle engine
packages/spawn     (M2 stub)
tools/sim          battle simulator CLI
tools/region-builder (M2 stub)
apps/client        Vite + React battle test page
docs/              PLAN.md, DECISIONS.md
```

See [CLAUDE.md](CLAUDE.md) for the hard rules and architecture, and
[docs/DECISIONS.md](docs/DECISIONS.md) for how ambiguous rules were interpreted.

All creature, move and item content is original placeholder content (`"placeholder": true`).
