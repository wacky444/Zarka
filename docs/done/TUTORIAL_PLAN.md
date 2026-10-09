# Zarka Tutorial Plan

## Goal

Add a guided, deterministic tutorial that teaches the core Zarka loop through a short preset match. The tutorial should use the real map, action, skill, shop, chat, turn-resolution, destruction, and victory systems wherever possible, while restricting the available choices so a new player is never presented with irrelevant options.

The existing **Tutorial** menu button will eventually start this flow. This document only specifies the feature; it does not implement the button action.

The tutorial is the onboarding gate for profiles. Until the tutorial is completed:

- **Create Match** is disabled.
- **List Matches** is disabled.
- **My Matches** is disabled.
- The player may enter or restart the tutorial.

After the authoritative final victory, save a tutorial-completed flag in the player profile before showing the recap. A missing completion flag means the profile must complete the tutorial; existing profiles are not grandfathered in. The profile flag should be loaded when the main menu opens so the normal match options become available on later sessions. The server must enforce this gate for normal match creation and joining; disabling client buttons alone is not sufficient.

## Tutorial scenario

- One human player and one scripted bot.
- Preset 2x2 map.
- Fixed starting positions, item placement, health, effort, zarkans, and turn schedule.
- Only the actions and skills needed for the current lesson are enabled.
- The bot is deterministic. It performs the expected action for the current step and does not make strategic decisions that could invalidate the lesson.
- The tutorial advances through explicit steps. Gameplay steps complete from authoritative game events. Presentation steps, such as opening Chat or cell information, are tracked by the client tutorial controller and do not require server validation.
- The bot uses the existing match chat channel to send instructional messages. Chat messages should appear as unread until the player opens the Chat tab.
- The tutorial ends with the bot dying on the scheduled destruction cell and the player receiving the normal victory flow.

### Suggested preset layout

Use stable logical cell coordinates so the scenario is reproducible. For example:

```text
A1 -- B1
 |     |
A2 -- B2
```

The exact movement graph should be confirmed against the map generator, but the tutorial should reserve cells for these purposes:

- Player starting cell.
- Bot starting cell.
- A cell containing the initial objects.
- A cell marked for destruction in the final lesson.

The final layout must allow the player to move away after being Scared, move back, and use Scare to move the bot onto the doomed cell. The final Scare must use one extra power/extra execution, consuming the existing additional 3 effort, so the player can select the bot’s destination instead of relying on a random adjacent destination. Scare should use a deterministic destination for this lesson so the player can understand and control the result. No separate push or knockback action is required.

## Guided sequence

### Step 1: Move and inspect the map

**Purpose:** Teach map navigation and spatial information.

1. Show a short tutorial overlay explaining that the map can be dragged or panned.
2. Require the player to move the map around enough to reveal the 2x2 layout.
3. Require the player to open information for the current cell.
4. Require the player to open information for at least one nearby cell.
5. Keep all other action controls disabled until the step is complete.

**Completion events:**

- Map camera/pan interaction occurred.
- Current-cell information was opened.
- Nearby-cell information was opened.

**Tutorial instruction (not a chat message):**

> Look around first. Knowing your current cell and nearby cells is essential before choosing an action.

Do not send a bot chat message during this step. The first bot chat message should be sent in Step 4, when the bot enters the player’s cell and makes its false team claim.

### Step 2: Choose skills

**Purpose:** Teach that skills permanently improve a character and should be chosen before committing to a plan.

Enable only the relevant implemented skills:

- `vitality` for more maximum health.
- `strength2` for reduced effort on knife, bat, and axe attacks.

The user-facing explanation should say “more HP” and “make axe attacks cost less energy.” `strength2` is the intended axe lesson; it reduces the effort cost of axe attacks rather than reducing damage.

Require the player to select both skills so later steps are deterministic.

**Completion events:**

- The expected skill upgrades were applied.
- The resulting health/skill effect is visible in the character panel.

**Bot message:**

> Skills shape your character. Vitality gives you more HP, and Strength 2 makes axe attacks cost less effort.

### Step 3: Find and collect objects

**Purpose:** Teach the difference between searching and picking up visible items.

Place the following items in the player’s current or reachable cells:

- Bandage.
- Axe.
- Food.

Enable only the required actions for this step:

- Move.
- Search.
- Pick Up.

Require the player to:

1. Search an undiscovered cell.
2. Read the discovered item information.
3. Pick up the bandage.
4. Pick up the axe.
5. Pick up the food.

The item order should be controlled so the player learns that searching reveals objects while Pick Up adds visible objects to inventory.

**Completion events:**

- Search resolved successfully.
- Each required item entered the player inventory.

**Bot message:**

> Search reveals what is hidden. Pick Up puts a visible object into your inventory.

### Step 4: Feed the bot and establish uncertainty

**Purpose:** Teach feeding, shared cells, team claims, and the danger of trusting another player.

1. Require the player to use Food on themselves through the existing Feed interaction.
2. Script the bot to move into the player’s current cell on the next relevant turn.
3. Have the bot send a chat message claiming:

> I am on your team. You can trust me.

4. Require the player to open Chat and view the message.
5. Mark the chat lesson complete only after the player has opened the tab and the message is visible.

The bot’s actual team must be different from the player’s team. The tutorial should not reveal this directly through normal player visibility.

**Completion events:**

- Feed resolved.
- Bot entered the player’s cell.
- Chat message was received.
- Chat tab was opened and the message was displayed.

### Step 5: Use the Detective shop item

**Purpose:** Teach that team information should be verified rather than accepted at face value.

Preset the player’s zarkan balance to exactly enough for the Detective purchase, with a small visible balance after purchase if desired.

Require the player to:

1. Open the Shop tab.
2. Select Detective.
3. Select the bot as the target.
4. Confirm the purchase.
5. Read the private result identifying the bot’s real team.

The bot’s chat claim must be false. The Detective result should be private to the player and should not be shown as a global event.

**Completion events:**

- Detective purchase completed.
- Target team was revealed to the player.
- Private result was displayed.

**Bot message after the result:**

> You checked instead of trusting me. Information can be more valuable than an attack.

### Step 6: Learn that Scare resolves before the attack

**Purpose:** Teach turn planning and action ordering.

The player must have the axe and enough effort to select `axe_attack`. The bot must have Scare available and be configured to scare the player during the same turn. The tutorial fixture must make the bot’s Scare resolve before the player’s Axe attack. The selected-destination Scare upgrade is not used in this step; it is taught in Step 7.

Require the player to:

1. Select the bot as the axe target.
2. Submit the turn.
3. Resolve the bot’s Scare before the player’s axe attack.
4. Show the player being moved to another valid cell.
5. Show the axe attack failing or missing because the target is no longer in range.

This should be a scripted, deterministic Scare destination so the result is understandable and does not strand the player. The log should explicitly explain that Scare resolved before the planned attack.

**Bot message before the turn:**

> You planned to attack me, but actions resolve in an order. Scare can move you before your attack happens.

**Completion events:**

- Player selected an axe attack against the bot.
- Bot Scare resolved first.
- Player changed cells because of Scare.
- The planned attack resolved after Scare and could not hit the original position.

### Step 7: Return and use map destruction

**Purpose:** Teach that the map changes over time and dangerous cells can determine the outcome.

1. Mark one cell as scheduled for destruction on the next turn.
2. Show the destruction warning/skull and explain the remaining time.
3. Require the player to move back toward the bot.
4. Require the player to select Scare.
5. Require the player to spend exactly one extra power/extra execution, including the additional 3-effort cost. Explain that this changes Scare from random movement to a selectable destination for one target.
6. Require the player to select the doomed cell as the bot’s destination.
7. Advance the turn so the cell is destroyed.
8. Apply the normal environmental damage and death handling.
9. Finish through the normal victory overlay and report flow.

The bot should be unable to escape during this final lesson. The player must see the warning before the final action, rather than learning about destruction only after it happens.

**Bot message:**

> The map itself is dangerous. Watch the warning, then use positioning to survive.

### Step 8: Victory and recap

After the bot dies:

- Use the normal victory overlay.
- Explain that the player won by combining information, preparation, positioning, and timing.
- Offer a concise recap of the lessons.
- Provide a return-to-menu control.
- Run the normal victory and report pipeline for the tutorial match. Mark the match as tutorial data so the report remains identifiable if ordinary multiplayer match lists filter tutorial records.

## Step controller design

Represent the tutorial as a finite state machine rather than a collection of unrelated client-only booleans. Gameplay state remains authoritative in the match; the client tutorial controller tracks presentation milestones such as opening a panel or reading a message. Suggested steps:

```text
map_pan
inspect_current_cell
inspect_nearby_cell
choose_skills
search
pickup_items
feed_bot
bot_chat
open_chat
buy_detective
read_detective_result
plan_axe_attack
resolve_bot_scare
return_to_bot
observe_destruction_warning
scare_bot_to_doomed_cell
resolve_destruction
victory_recap
```

Each step should define:

- Allowed actions and tabs.
- Required event(s).
- Bot behavior for that step.
- Player-facing instruction.
- Optional hint after a timeout.
- Whether the player may replay or undo the step.
- The next step transition.

The server should own normal gameplay state and action validation. The client tutorial controller may track presentation milestones, show guidance, and highlight controls without sending those milestones to the server for validation. The client must not be able to bypass normal server validation by marking gameplay actions complete locally.

## Match and bot requirements

- Add explicit tutorial metadata to the match rather than detecting the tutorial from a match name.
- Keep the tutorial match isolated from normal match creation, reports, and match-history limits.
- Store tutorial completion in the player profile, using a server-authoritative profile field or account storage record.
- Treat a missing completion flag as incomplete; profiles must finish the tutorial before normal matchmaking.
- Enforce the incomplete-tutorial gate on normal match creation and normal match joining. Tutorial matches must remain exempt.
- Keep List Matches and My Matches disabled in the client while the profile is incomplete.
- Make completion idempotent so reconnects or repeated victory notifications cannot corrupt the profile state.
- Use a stable logical tutorial bot name with a tutorial-session-specific runtime identity so concurrent tutorials cannot collide, and use deterministic scripted plans.
- Ensure the bot cannot accidentally die, consume required items, or choose a different action before the intended lesson.
- Keep unconscious/dead state and finalization authoritative through the normal match systems.
- Discard the active tutorial session when the player deliberately leaves or restarts it.
- On reconnect or browser reload during an active session, restore the tutorial match and let the client tutorial controller reconstruct its presentation step from the current gameplay state.
- Disable unrelated shop entries, actions, skills, and selectors instead of merely hiding their descriptions.
- Keep normal desktop and multiplayer behavior unchanged.

## Chat behavior

Use the existing chat service and UI rather than introducing a separate tutorial chat widget.

- Script bot messages through the normal match chat path when possible.
- Mark the message unread.
- Require opening the Chat tab to complete the relevant step.
- Highlight the Chat tab only while the message is waiting.
- Do not auto-open Chat; the lesson is specifically intended to teach where chat is found.
- Handle reconnects by restoring the scripted message and the current tutorial step without duplicating the message.

## Guidance and accessibility

- Show one instruction at a time.
- Use plain language and explain why an action matters.
- Highlight the next relevant tab, cell, action, or button without preventing normal inspection.
- Provide a “Show me” hint after a short delay and a “Skip this lesson” option only if skipping cannot leave the scenario invalid.
- Support English and Spanish text from the beginning.
- Do not rely on color alone for the highlighted control.
- Make tutorial overlays work with touch and desktop input.
- Avoid requiring precision camera movement; a single valid pan gesture should be enough.

## Recommended additions

These additions would improve the tutorial without expanding the first scenario too much:

1. **Turn-planning explanation**
   - Briefly explain that players submit plans and the server resolves them in order.
   - Show the planned action state before the first meaningful turn.

2. **Effort and health preview**
   - Before Axe and Feed, show current effort, action cost, and expected remaining effort.
   - Explain when an action can spend health because effort is insufficient.

3. **Inventory and item limits**
   - Explain carried weight and why the player should not pick up everything blindly.
   - Show the inventory tooltip for the bandage, axe, and food.

4. **Private information warning**
   - After Detective, explain that some information is viewer-specific and will not appear for the bot.

5. **Scare immunity hint**
   - Mention that some skills, such as Brave, can prevent Scare. This can be a short optional glossary entry rather than another required step.

6. **Destruction warning countdown**
   - Add a clear “one turn remaining” explanation using the existing warning skull animation.

7. **Failure recovery**
   - If the player selects the wrong action, show a hint and keep the bot scripted rather than failing the entire tutorial.
   - If the player dies unexpectedly, restart the current checkpoint instead of returning to the menu.

8. **Replay and recap**
   - After victory, show a short recap of the important resolved events and optionally let the player view the tutorial replay.

9. **Completion reward**
   - Store a non-gameplay tutorial-completed flag and show a small account-level acknowledgement. Do not grant competitive currency or items unless that reward is intentionally designed.

10. **Practice mode after completion**
    - Offer a second, unscripted practice match with the same limited rules so the player can repeat movement, Search, Pick Up, Shop, and combat without the guided gates.

11. **Tutorial analytics**
    - Record only aggregate step completion/failure data if analytics are needed. Avoid storing chat contents or unnecessary player behavior.

## Deterministic tutorial test mode

The tutorial should double as a repeatable integration test. The test runner should use the same server-side match, action, turn-resolution, chat, shop, destruction, victory, and profile-storage code as a real tutorial session. It may remove waiting time and UI animation delays, but it must not bypass the mechanics being tested.

### Test runner behavior

Provide a test-only entry point or environment-controlled runner that:

1. Creates an isolated test account and starts the preset tutorial.
2. Verifies the initial 2x2 map, player/bot identities, positions, inventory, skills, zarkans, and enabled actions.
3. Drives each tutorial step using the normal RPC/action payloads.
4. Runs bot turns immediately instead of waiting for real-time tutorial pacing.
5. Advances the deterministic turn schedule without sleeping between lessons.
6. Verifies the expected state and replay/log events after every step.
7. Completes the tutorial and verifies the profile completion flag.
8. Verifies that normal Create Match and Join Match requests fail before completion and succeed after completion; the browser test verifies List Matches and My Matches are disabled.
9. Cleans up the test account, match, and stored test data.

The runner should use a dedicated test user and match namespace or a cleanup-safe fixture. It must never grant tutorial completion to a real player account.

### Assertions by lesson

- Map inspection emits the expected current-cell and nearby-cell observations.
- Skills apply the expected health and axe-effort effects.
- Search reveals the expected items and Pick Up adds the bandage, axe, and food.
- Feed resolves once and the bot enters the expected cell.
- Exactly one bot chat message is produced.
- Detective costs the expected zarkans and privately reveals the bot’s opposing team.
- The bot’s Scare resolves before the player’s Axe attack.
- The final Scare consumes one extra execution and the additional 3 effort, then moves the bot to the selected destruction cell.
- Destruction kills the bot and produces the normal victory/report state.
- Repeating completion or replaying a victory notification does not duplicate profile updates or rewards.

### Log and error capture

The combined test harness should collect server logs, browser console errors from the UI smoke test, and structured tutorial-step traces. The fast server test and browser smoke test may produce separate artifacts that are merged by the test report. Each trace entry should include:

- Tutorial session ID.
- Step ID.
- Turn number.
- Actor ID.
- Action or RPC ID.
- Result and failure reason, if any.

The run fails on unexpected errors, rejected actions, malformed replay events, duplicate chat messages, step-order violations, or state mismatches. Expected negative responses, such as the pre-completion rejection of normal match creation, should be asserted explicitly and excluded from the unexpected-error count.

A compact test report should include the first failing step, the relevant state snapshot, recent logs, and the session ID so the failure can be reproduced.

### UI coverage split

A server/integration runner cannot prove that a player actually panned the map or opened the Chat tab. Keep those presentation checks in a small browser smoke test that drives the real Phaser UI. The server integration test should validate gameplay events only; it does not need to validate client presentation milestones. The browser smoke test should assert:

- The Tutorial button starts the flow.
- The Chat tab shows an unread indicator and clears it when opened.
- The cell information controls can be opened.
- Disabled Create Match, List Matches, and My Matches controls remain visibly unavailable before completion.
- The victory recap enables normal match controls after completion.

The fast integration test and the slower browser smoke test should share the same preset fixture and expected step IDs.

## Acceptance criteria

- Selecting Tutorial starts the preset scenario and never creates a normal user match.
- Create Match, List Matches, and My Matches remain unavailable to profiles without the saved completion flag.
- Completing the tutorial saves the completion flag in the profile, and the normal match options become available after reload or reconnect.
- The server rejects normal match creation and joining while the completion flag is absent, regardless of client state.
- The map is exactly the configured 2x2 layout with deterministic objects and positions.
- Only the intended actions and skills are usable at each step.
- The player must inspect current and nearby cell information before progressing.
- The player can select the HP and axe-related skills.
- Search, Pick Up, Feed, Shop Detective, Axe attack, Scare-based movement, and destruction are demonstrated in order.
- The bot sends a chat message, and the related step remains incomplete until the player opens Chat.
- Detective reveals that the bot lied, privately and deterministically.
- Scare resolves before the planned Axe attack and visibly changes the outcome.
- The final Scare requires one extra power/extra execution and its additional 3-effort cost, allowing the player to select the doomed destination.
- The final destruction sequence ends the bot and uses the normal victory flow.
- Reload/reconnect behavior does not duplicate messages or skip gameplay steps; presentation instructions may be shown again when the client reconstructs its local state.
- Tutorial state cannot mutate a normal match.
- English and Spanish tutorial text is localized.
- Desktop and touch controls both complete the same steps.
- Existing normal match creation and gameplay remain unchanged.

## Implementation steps for a smaller-capability LLM

Use these steps in order. Complete and verify one step before starting the next. Do not ask the implementation model to build the entire tutorial in one change.

### Phase 1: Read the existing code

1. Read the relevant files completely before editing:
   - `client/src/scenes/MainScene.ts`
   - `client/src/scenes/GameScene.ts`
   - `client/src/ui/CharacterPanel.ts`
   - `client/src/ui/CharacterPanelChatView.ts`
   - `client/src/ui/CharacterPanelShopView.ts`
   - `server/modules/src/match/async_turn.ts`
   - `server/modules/src/match/async_turn/*`
   - `server/modules/src/match/actionExecutor.ts`
   - `server/modules/src/match/advanceTurn.ts`
   - `server/modules/src/rpc/createMatch.ts`
   - `server/modules/src/rpc/joinMatch.ts`
   - `server/modules/src/rpc/submitTurn.ts`
   - `server/modules/src/services/storageService.ts`
   - `shared/src/ActionLibrary.ts`
   - `shared/src/skills/SkillLibrary.ts`
2. Search for existing match settings, chat events, profile storage, replay events, and tutorial-related code before creating new helpers.
3. Write a short mini-spec with the exact tutorial metadata name, completion-profile key, step IDs, and preset coordinates. Do not code until these names are fixed.

**Verification:** No code changes. Confirm that the model can identify where match state, profile data, chat, and turn resolution are authoritative.

### Phase 2: Add shared tutorial identifiers

1. Add only shared types/constants for:
   - Tutorial match metadata.
   - Tutorial step IDs.
   - Tutorial completion profile key.
2. Keep the new types small and serializable.
3. Do not change normal actions or normal match behavior yet.

**Verification:** Run server and client TypeScript checks. Review the diff for unrelated changes.

### Phase 3: Add the preset scenario

1. Create one server-side factory for the fixed tutorial map and initial match state.
2. Set the 2x2 layout, player position, bot position, item placement, teams, health, effort, and zarkans in one place.
3. Mark the match explicitly as a tutorial match.
4. Use a fixed bot ID and deterministic scripted behavior.
5. Do not add the UI flow yet.

**Verification:** Add or run a focused server test that creates the fixture twice and compares the relevant state fields. Confirm both runs are identical.

### Phase 4: Add tutorial progress controllers

1. Add a small client tutorial controller with the ordered step IDs from this document.
2. Let gameplay steps advance from normal authoritative match events received by the client.
3. Let presentation steps advance from local UI events, such as panning the map or opening Chat.
4. Keep normal server action validation unchanged; do not add a server RPC for presentation acknowledgements.
5. Add the remaining steps one at a time in the order in this document.
6. Make local progress transitions idempotent so repeated UI events do not skip steps.

**Verification:** Test that invalid gameplay actions are still rejected by the normal server rules, while repeated presentation events do not advance the client controller more than once.

### Phase 5: Add deterministic bot behavior

1. Create a tutorial-only bot planner or scripted action table.
2. Give the bot exactly one expected behavior for each step.
3. Script the chat message at the `bot_chat` step.
4. Script Scare ordering before the player’s Axe attack.
5. Script the final Scare with exactly one extra execution and the selected destruction destination.
6. Do not modify general bot AI behavior for this feature.

**Verification:** Run the tutorial fixture without the client and compare action order, target IDs, destinations, and chat event count against the plan.

### Phase 6: Add profile completion and match gating

1. Add one profile/account storage field for tutorial completion.
2. Read it when the main menu is initialized.
3. Disable normal Create Match, List Matches, and My Matches controls when it is false.
4. Leave Tutorial enabled when it is false.
5. Add server-side rejection for normal create/join requests when it is false.
6. Allow tutorial match creation regardless of the flag.
7. Set the flag only after the authoritative tutorial victory and make the update idempotent.

**Verification:** Test the full gate in this order:

1. Incomplete profile cannot create a normal match.
2. Incomplete profile cannot join a normal match.
3. Incomplete profile can start Tutorial.
4. Completed profile can create and join normally.
5. Repeating completion does not duplicate stored data.

### Phase 7: Add the tutorial UI one lesson at a time

1. Add a small tutorial instruction view with the current instruction and optional hint.
2. Add only the first lesson’s completion listener.
3. Add the Chat unread/open requirement using the existing Chat tab events.
4. Add step-specific highlighting and disabling only after the underlying step works.
5. Add the Shop Detective lesson.
6. Add the Axe/Scare ordering lesson.
7. Add the final Scare destination and destruction lesson.
8. Reuse existing selectors, tabs, logs, banners, and overlays instead of creating duplicate controls.

**Verification:** After each lesson, run the client TypeScript check and manually verify that the next instruction is not shown early.

### Phase 8: Add fast integration tests

1. Create one test script for the server fixture.
2. Drive the normal action/RPC payloads for gameplay steps in the documented order.
3. Remove sleeps and animation waits in the test runner only.
4. Assert state and event output after every gameplay step. Leave map panning, panel opening, and unread-state checks to the browser smoke test.
5. Capture server logs and fail on unexpected errors.
6. Add the pre-completion and post-completion profile-gate assertions.
7. Add cleanup in a `finally` block so failed runs do not leave tutorial matches behind.

**Verification:** Run the same test at least three times. All runs must produce the same gameplay step sequence, action order, chat count, winner, report, and completion flag.

### Phase 9: Add browser smoke coverage

1. Start the tutorial through the real Tutorial button.
2. Verify the 2x2 map is visible.
3. Pan the map and open current/nearby cell information.
4. Open Chat when the bot message is unread and verify the unread state clears.
5. Verify Create Match, List Matches, and My Matches are disabled before completion.
6. Complete the tutorial through the real controls.
7. Verify the victory recap, normal report flow, and that normal match controls become enabled afterward.

**Verification:** Run desktop and touch-oriented smoke paths. Keep this suite small; detailed state validation belongs in the fast integration test.

### Phase 10: Final review

1. Review the complete diff for unrelated behavior changes.
2. Run:
   - `cd server/modules && npx tsc --noEmit`
   - `cd client && npx tsc --noEmit`
   - `cd client && npm run lint`
   - `git diff --check`
3. Run the deterministic tutorial test repeatedly.
4. Check reconnect, reload, duplicate victory, and abandoned-tutorial behavior.
5. Only then connect the existing Tutorial button to the feature.
6. Do not remove or weaken normal match validation to make the tutorial test pass.
