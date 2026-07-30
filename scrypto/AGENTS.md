# Scrypto Task Requirements

The repository-level Codex Task Isolation and Completion Contract apply to every Scrypto change. Work only from a dedicated linked worktree on a `codex/<task-name>` branch.

For changes under `scrypto/`, run `pnpm test:scrypto`, update blueprint tests, and run `scrypto build` when a change affects deployable output or a ledger-facing interface. Do not publish packages, submit manifests, or mutate a Resim ledger unless the user explicitly asks.
