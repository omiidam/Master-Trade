# Architecture Decision Records

Format: context → decision → consequences. Status starts as `Accepted`; a
superseded ADR keeps its number and points to its replacement.

| ADR                                                     | Decision                                                                | Status   |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| [0001](./ADR-0001-desktop-shell-tauri.md)               | Tauri as the desktop shell                                              | Accepted |
| [0002](./ADR-0002-modular-monolith.md)                  | Single-process modular monolith                                         | Accepted |
| [0003](./ADR-0003-sqlite-first.md)                      | SQLite as the initial database                                          | Accepted |
| [0004](./ADR-0004-llm-gateway-abstraction.md)           | Provider-independent LLM gateway                                        | Accepted |
| [0005](./ADR-0005-provider-independent-market-data.md)  | Provider-independent market data with mandatory provenance              | Accepted |
| [0006](./ADR-0006-vector-memory-separation.md)          | Vector memory separate from structured records, trust-gated             | Accepted |
| [0007](./ADR-0007-deny-by-default-auth.md)              | Deny-by-default authorization + human approval for sensitive operations | Accepted |
| [0008](./ADR-0008-no-experimental-core-dependencies.md) | No experimental languages/tech as core dependencies                     | Accepted |
| [0009](./ADR-0009-deterministic-tools-own-risk-math.md) | Deterministic tools own all risk math; LLM never bypasses permissions   | Accepted |
