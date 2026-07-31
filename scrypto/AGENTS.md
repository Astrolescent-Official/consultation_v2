# Scrypto Task Requirements

The repository-level Codex Task Isolation and Completion Contract apply to every Scrypto change. Work only from a dedicated linked worktree on a `codex/<task-name>` branch.

For changes under `scrypto/`:

- Run `pnpm test:scrypto` before handoff. This is included in `pnpm verify`.
- Add or update Rust tests in `scrypto/tests/` for changed blueprint behavior, including authorization and state-transition cases where applicable.
- Run `scrypto build` when a change affects deployable package output, manifests, or ledger-facing blueprint interfaces.
- Do not publish packages, submit manifests, or mutate a Resim ledger unless the user explicitly asks.

The final handoff must state whether `pnpm test:scrypto` and, when applicable, `scrypto build` passed.
