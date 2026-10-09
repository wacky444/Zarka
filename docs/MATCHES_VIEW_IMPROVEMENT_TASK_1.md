# Matches View Improvement Task 1: Define Match-Card Summary Contract

## Goal

Provide both match lists with bounded, typed, server-authoritative card data, including map-preview cells and current-user readiness only where authorized.

## Dependencies

None.

## Scope

- Extend shared payload types for list-card summaries.
- Extend `list_my_matches` to return per-match status, joined/capacity counts, alive/started totals, turns, next scheduled deadline, and one `currentUserReady` boolean for the caller.
- Add or extend a paginated public `list_match_cards` RPC for the All Matches view.
- Project map cells into safe preview records: `{ coord: { q, r }, localizationType, destructionState }`, with state `safe`, `scheduled`, or `destroyed`. Derive destruction state from map metadata and current turn.
- Return no raw cell metadata, item IDs, player readiness map, inventories, or full character records in public summaries.
- Keep user-specific readiness out of public match labels and public list responses. Do not perform one `get_state` request per card.
- Include `maxCurrentMatches` in the authenticated account/list contract with default 10; persistence and enforcement belong to Task 7.

## Acceptance

- Lobby, running, and finished summaries contain enough data for their respective player counts: joined/capacity, alive/started-total, and total-only.
- My Matches reports `currentUserReady` for the caller only; missing readiness is normalized to false there.
- Public summaries contain only aggregate counts and safe map preview fields.
- Pagination, missing maps, and malformed/old match records produce stable responses with safe defaults.

## Validation

- Add server tests for page bounds, match statuses, counts, readiness isolation, destruction-state mapping, and omission of private fields.
- Run `npm run build` and `npm test` in `server/modules/`.
