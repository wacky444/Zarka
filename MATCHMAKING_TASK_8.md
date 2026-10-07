# Task 8: Build durable ranked queue and coordinator

## Goal

Reconcile opt-in slots into durable queue tickets and assign tickets to ranked matches using Tasks 5–7.

## Dependencies

Tasks 3, 5, 6, and 7.

## Scope

- Store private tickets per user/slot and durable assignment/reservation records.
- Compute occupied slots from queued, reserved, and unfinished ranked assignments. Create only the deficit up to saved `rankedMatchSlots` (`0..3`).
- Keep tickets valid while users are offline. Cancel only for opt-out, reduced slot count, ineligibility, or administrative removal; presence expiry must not cancel tickets.
- Select oldest compatible tickets, count distinct users per match, and never place one user twice in a single roster. A user with multiple slots may enter separate matches.
- Use Task 6 policy: low-population half-DAU threshold with bots to 16; high-population threshold from 16 down to 8 over 12 hours, no bot padding.
- Use a single coordinator/worker lease and storage versions. Reserve selected tickets atomically; recover expired `creating` reservations idempotently after failure/restart.
- Reconcile after preference changes and match completion. Release each slot once and enqueue replacements while desired count remains unmet.

## Acceptance

- `0` creates no tickets; `1..3` maintains at most that many queued/reserved/active slots.
- Offline users can be assigned and started; no client session is required.
- Concurrent coordinator attempts cannot consume one ticket twice or create duplicate assignments.
- Match completion frees one slot and can refill it; lowering preference cancels newest pending tickets without interrupting started matches.

## Validation

Add tests for low/high population, multi-slot users, offline tickets, concurrent workers, failure recovery, opt-out, and slot release. Run server tests/build.
