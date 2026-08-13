# Consultation dApp

## Features

- Browse and filter temperature checks and proposals
- Vote on active consultations via Radix Wallet
- Create new temperature checks
- Promote temperature checks to proposals (admin)
- Admin panel for governance parameters
- Vote results and account vote tracking

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | React 19, Vite |
| Runtime | Cloudflare Worker with D1 and scheduled polling |
| Routing | TanStack Router + [TanStack Start](https://tanstack.com/start) |
| State | [Effect Atom](https://github.com/effect-ts/atom) (reactive atoms with Effect runtime) |
| Styling | Tailwind CSS v4, Radix UI, shadcn/ui, CVA |
| Radix | Radix dApp Toolkit (wallet connection, transaction signing), Gateway API client |
| Forms | TanStack Form |

## Public app configuration

Public application and collector values are defined once in the selected
`wrangler.jsonc` environment. The Worker validates them and serves the same
values to the browser from `/app-config.js` before hydration.

| Variable | Description | Default |
| --- | --- | --- |
| `ENV` | Environment (`local`, `preview`, or `production`) | — (required) |
| `DAPP_DEFINITION_ADDRESS` | Radix dApp definition account address | — (required) |
| `GOVERNANCE_COMPONENT_ADDRESS` | Governance component used by the UI and poller | — (required) |
| `NETWORK_ID` | Radix network ID (`1` = mainnet, `2` = Stokenet) | — (required) |

## Scripts

| Script | Command | Description |
| --- | --- | --- |
| `dev` | `CLOUDFLARE_ENV=preview vite dev --port 3000` | Start the local Stokenet Worker on port 3000 |
| `build` | `vite build` | Production build |
| `test:worker` | `vitest run --config vitest.worker.config.ts` | Workerd/D1 integration tests |
| `deploy` | `pnpm build && wrangler deploy ...` | Deploy production Worker |
| `deploy:preview` | `pnpm build:preview && wrangler deploy ...` | Deploy isolated preview Worker |
| `preview` | `vite preview` | Preview production build |
| `check-types` | `tsc --noEmit` | Type-check without emitting |
| `format` | `biome format` | Format with Biome |
| `lint` | `biome lint` | Lint with Biome |
| `check` | `biome check` | Biome format + lint |

## Preview environment

The preview Worker builds against Stokenet and uses an isolated D1 database:

```sh
pnpm deploy:preview
```

See [`../../docs/environments.md`](../../docs/environments.md) for the full
environment matrix and release checks.

## Project structure

```
src/
  routes/              TanStack Router file-based routes
    __root.tsx          Root layout (header, wallet connect, providers)
    index.tsx           Home — tabbed list of TCs and proposals
    tc/
      index.tsx         Temperature checks list
      $id/index.tsx     Temperature check detail + voting
      new/index.tsx     Create new temperature check (admin)
    proposal/
      $id/index.tsx     Proposal detail + voting
    about/
      index.tsx         About page
      admin/index.tsx   Admin panel
  atom/                 Effect Atom definitions (reactive state)
  components/           Shared UI components (shadcn/ui, detail views)
  hooks/                React hooks (useCurrentAccount, useIsAdmin)
  lib/                  Utilities (envVars, dappToolkit, voting helpers)
```

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Home — tabbed view of temperature checks and proposals |
| `/tc` | Temperature checks list |
| `/tc/:id` | Temperature check detail, vote results, voting |
| `/tc/new` | Create a new temperature check (admin only) |
| `/proposal/:id` | Proposal detail, vote results, voting |
| `/about` | About page |
| `/about/admin` | Admin panel — governance parameters |
