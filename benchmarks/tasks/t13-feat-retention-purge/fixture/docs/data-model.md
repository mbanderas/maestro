# Data model and retention rules

## Records

- **customers** (`data/customers.json`): `{ id, name, email, createdAt }`
- **tickets** (`data/tickets.json`): `{ id, customerId, subject, status, updatedAt }`
- **comments** (`data/comments.json`): `{ id, ticketId, author, body, createdAt }`

A comment references a ticket via `ticketId`; a ticket references a customer
via `customerId`.

## Staleness

A ticket is **stale** when BOTH hold:

1. its `status` is `'closed'`, and
2. `daysBetween(updatedAt, config.referenceDate) > config.retentionDays`.

Staleness is ALWAYS computed against `config.referenceDate` — the dataset
snapshot date — and NEVER against the wall clock (`Date.now()`). Datasets are
point-in-time snapshots, so the same dataset must yield the same staleness
result on every run regardless of when the command is run.

Only tickets are subject to retention staleness. Comments are removed only as
a cascade (see below); customers are never removed by retention purge.

## Cascade

Removing a ticket MUST also remove every comment whose `ticketId` is that
ticket. No comment may ever reference a missing ticket. After any purge, every
comment in `data/comments.json` must reference an existing ticket.
