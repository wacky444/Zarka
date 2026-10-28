# Replay Log Importance Filter Plan

## Goal
Add a replay-log importance filter beside the film playback control. Importance levels are `Routine = 0`, `Notable = 1`, and `Critical = 2`; filtering shows events at or above the selected threshold. Normal/live play starts at 0, while a full replay opened for an ended match starts at 2.

## Implementation
- Added the mandatory `ReplayImportance` enum and required field to player/map replay event types.
- Tagged replay event creation sites; attack actions resolve to Critical (2), daily Zarkan income is Routine (0), and ordinary/logistical events default to Notable (1). Legacy stored records without a level are treated as Notable by the client.
- Added a draggable three-step minimum-importance slider beside the film button. Donation entries remain visible because they are separate from replay events.
- Live play defaults to Routine (0); opening the ended-match full replay starts at Critical (2).
- Validation: client build/lint and server build/tests passed.

## Risks
Replay events are created in many server modules and also synthesized on clients. Missing a constructor will break type checking; events stored before the schema change require normalization or migration. Filter threshold semantics should stay consistent: selecting N shows events with importance >= N.
