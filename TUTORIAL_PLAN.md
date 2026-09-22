# Zarka Tutorial Plan

## Goal

Add a guided, deterministic tutorial that teaches the core Zarka loop through a short preset match. The tutorial should use the real map, action, skill, shop, chat, turn-resolution, destruction, and victory systems wherever possible, while restricting the available choices so a new player is never presented with irrelevant options.

The existing **Tutorial** menu button will eventually start this flow. This document only specifies the feature; it does not implement the button action.

## Tutorial scenario

- One human player and one scripted bot.
- Preset 2x2 map.
- Fixed starting positions, item placement, health, effort, zarkans, and turn schedule.
- Only the actions and skills needed for the current lesson are enabled.
- The bot is deterministic. It performs the expected action for the current step and does not make strategic decisions that could invalidate the lesson.
- The tutorial advances through explicit steps. A step is completed by an authoritative game event, not merely by a client button click.
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

The final layout must allow the player to move away after being scared, move back, and force the bot onto the doomed cell without requiring an unavailable or unexplained mechanic. The current action library does not expose a general `push` action, so the final “push the bot” step needs one of these explicit implementations:

1. Add a real push/knockback action and teach it as part of the tutorial.
2. Reuse Scare with deterministic destination selection and label the lesson as moving/forcing the bot rather than pushing.
3. Add a tutorial-only scripted displacement event, clearly presented as a scenario interaction rather than a normal action.

Option 1 is the most reusable. Option 2 avoids new combat functionality but may not match the intended wording.

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

**Bot message:**

> Look around first. Knowing your current cell and nearby cells is essential before choosing an action.

The message should be sent before the player is expected to open Chat, so the unread indicator teaches the player where communication appears.

### Step 2: Choose skills

**Purpose:** Teach that skills permanently improve a character and should be chosen before committing to a plan.

Enable only the relevant implemented skills:

- `vitality` for more maximum health.
- `strength2` for reduced effort on knife, bat, and axe attacks.

The user-facing explanation should say “more HP” and “make axe attacks cheaper.” If the intended lesson is reduced incoming axe damage rather than cheaper axe attacks, use `resilience2` instead and update the wording accordingly; the current skill library defines `strength2` as an effort discount, not damage reduction.

Require the player to purchase/select both skills, or explicitly choose one of the two if the tutorial is intended to demonstrate choice rather than a fixed build. The recommended first version requires both so later steps are deterministic.

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

1. Require the player to use Food on the bot or otherwise complete the existing Feed interaction.
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

The player must have the axe and enough effort to select `axe_attack`. The bot must have Scare available and be configured to scare the player during the same turn.

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
4. Require the player to move or force the bot onto the doomed cell.
5. Advance the turn so the cell is destroyed.
6. Apply the normal environmental damage and death handling.
7. Finish through the normal victory overlay and report flow.

The bot should be unable to escape during this final lesson. The player must see the warning before the final action, rather than learning about destruction only after it happens.

**Bot message:**

> The map itself is dangerous. Watch the warning, then use positioning to survive.

### Step 8: Victory and recap

After the bot dies:

- Use the normal victory overlay.
- Explain that the player won by combining information, preparation, positioning, and timing.
- Offer a concise recap of the lessons.
- Provide a return-to-menu control.
- Do not add the tutorial match to the normal match-history list unless tutorial history is explicitly desired.

## Step controller design

Represent the tutorial as a finite state machine rather than a collection of client-only booleans. Suggested steps:

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
force_bot_to_doomed_cell
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

The server should own the authoritative step and validate tutorial-specific requirements. The client may show guidance and highlight controls, but it must not be able to mark a lesson complete by sending an arbitrary step number.

## Match and bot requirements

- Add explicit tutorial metadata to the match rather than detecting the tutorial from a match name.
- Keep the tutorial match isolated from normal match creation, reports, and match-history limits.
- Use a stable tutorial bot identity and deterministic scripted plans.
- Ensure the bot cannot accidentally die, consume required items, or choose a different action before the intended lesson.
- Keep unconscious/dead state and finalization authoritative through the normal match systems.
- Reset or discard tutorial state when the player leaves, reloads, or restarts the tutorial.
- If resume is supported, persist the tutorial step and scenario state together.
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

## Acceptance criteria

- Selecting Tutorial starts the preset scenario and never creates a normal user match.
- The map is exactly the configured 2x2 layout with deterministic objects and positions.
- Only the intended actions and skills are usable at each step.
- The player must inspect current and nearby cell information before progressing.
- The player can select the HP and axe-related skills.
- Search, Pick Up, Feed, Shop Detective, Axe attack, Scare, movement, and destruction are demonstrated in order.
- The bot sends a chat message, and the related step remains incomplete until the player opens Chat.
- Detective reveals that the bot lied, privately and deterministically.
- Scare resolves before the planned Axe attack and visibly changes the outcome.
- The final destruction sequence ends the bot and uses the normal victory flow.
- Reload/reconnect behavior does not duplicate messages or skip authoritative steps.
- Tutorial state cannot mutate a normal match.
- English and Spanish tutorial text is localized.
- Desktop and touch controls both complete the same steps.
- Existing normal match creation and gameplay remain unchanged.
