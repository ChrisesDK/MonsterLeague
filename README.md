# Odense Monster League

A free, walk-to-play, location-based monster-collecting RPG set in Odense, Denmark
(working title). It ships first as a mobile web app (PWA) and runs entirely on the phone.

This repository contains M0–M1.6: the battle engine, balance tooling and a Gate 2
playtest build. Map, GPS and spawning arrive in M2. Game design lives in
[docs/GDD.md](docs/GDD.md); deployment steps in [docs/DEPLOY.md](docs/DEPLOY.md).

## Quick start

Requires Node 20+ and pnpm 9 (`npm i -g pnpm@9` or `corepack enable`).

```sh
pnpm install
pnpm dev          # playtest mode on http://localhost:5173 (also on your LAN for phones)
                  # developer battle page: http://localhost:5173/#/dev
```

## Commands

| Command                                                          | What it does                                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm lint`                                                      | ESLint + Prettier check                                               |
| `pnpm typecheck`                                                 | `tsc --noEmit` in every package                                       |
| `pnpm test`                                                      | Vitest in every package                                               |
| `pnpm coverage`                                                  | Engine tests with coverage (fails under 90%)                          |
| `pnpm validate`                                                  | Validates content JSON, cross-references and i18n keys                |
| `pnpm build`                                                     | Production build of the client                                        |
| `pnpm sim --a starter_fire:12 --b leader_water --n 10000`        | AI-vs-AI battle statistics                                            |
| `pnpm sim --player-team arena2 --starter grove --b leader_water` | Expected player team vs a leader                                      |
| `pnpm sim:report`                                                | Regenerates [docs/BALANCE.md](docs/BALANCE.md)                        |
| `pnpm gate2:report <folder>`                                     | Summarises exported playtest results ([docs/GATE2.md](docs/GATE2.md)) |

## Layout

```
packages/data      content JSON, Zod schemas, i18n (da/en), validator
packages/engine    pure, deterministic battle engine
packages/playtest  Gate 2 record format, timer, JSON/CSV export
packages/spawn     (M2 stub)
tools/sim          battle simulator CLI and balance report
tools/gate2        Gate 2 playtest report
tools/region-builder (M2 stub)
apps/client        Vite + React PWA: playtest mode + developer battle page (#/dev)
docs/              GDD (read-only export), GDD-PROPOSALS, PLAN, DECISIONS, BALANCE, GATE2, DEPLOY
```

See [CLAUDE.md](CLAUDE.md) for the hard rules and architecture, and
[docs/DECISIONS.md](docs/DECISIONS.md) for how ambiguous rules were interpreted.

All creature, move and item content is original placeholder content (`"placeholder": true`).
