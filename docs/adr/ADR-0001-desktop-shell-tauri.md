# ADR-0001 — Tauri as the desktop shell

**Status:** Accepted · **Date:** 2026-09-19

## Context

Master Trade is a desktop application that will run for months, must store an
LLM API key securely, must work offline for lessons, and will eventually need
pure deterministic compute (indicators, backtests) outside the model. Candidate
shells: Tauri, Electron, native.

## Decision

Use **Tauri** as the desktop shell, with the host contract in
`src/desktop/host.ts`.

## Consequences

- Bundle ~10–15 MB and low idle memory: appropriate for a long-running trainer.
- OS keychain access through Rust `keyring` gives `SecureStore` without shipping
  a Node runtime into the renderer.
- Capability allow-list model matches the project's permission philosophy: the
  shell exposes only declared capabilities.
- The Rust host is a natural future home for deterministic compute (Menai-style).
- Cost: smaller ecosystem than Electron and WebView differences across platforms,
  so UI work must be validated on Windows, macOS and Linux.
- `assertDesktopHost()` makes missing capabilities (`secure-store`,
  `file-dialog`, `offline-cache`, `single-instance`) a startup failure rather
  than a runtime surprise.
