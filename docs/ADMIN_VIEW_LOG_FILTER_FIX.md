# Admin View Log Filtering Fix Plan

## Problem Summary
When an admin account has **"View all actions and players" disabled** in Account Settings during an ongoing (non-Game-Master, unfinished) match:
- The **map correctly hides** remote characters, undiscovered items, and fog of war.
- However, the **character log/combat log can leak or display "All"** (global match combat events or allow selection of all characters).
- Reloading the page temporarily clears the symptom because in-memory caches and state flags reset.

---

## Root Causes

1. **Uninitialized Log Character Selection (`selectedCharacterId` defaults to `null` / `"All"`)**
   - In `client/src/ui/CharacterPanelLogView.ts`, `selectedCharacterId` is initialized to `null`.
   - In `client/src/ui/panel/CharacterPanel.ts` (`updateFromMatch`), `setLogSelectedCharacter` is **only** called when `isGameMasterMode === true`.
   - In standard matches, `selectedCharacterId` remains `null`.
   - When generating/formatting the log (`getFormattedTurnLog`), any falsy `characterId` triggers `formatAllMatchTurnLog` ("=== TURNO X - REGISTRO GLOBAL DE COMBATE ==="), formatting the full combat replay event log instead of the player's personal Hugo-style character log.

2. **`replayModeActive` falsely marks match as ended in `GameScene.ts`**
   - In `client/src/scenes/GameScene.ts` (`updateLogFilterVisibility`):
     ```ts
     const isEnded = Boolean(
       this.reportReplayMode ||
       this.replayModeActive || // <-- BUG
       (this.currentMatch && (this.currentMatch.started === false || this.currentMatch.removed !== 0))
     );
     const visible = isCharacterFilterRowVisible(isEnded, Boolean(this.adminViewEnabled));
     ```
   - When a user presses Play or scrubs a replay turn, `handleLogPlayRequestManual` calls `this.enterReplayMode()`, setting `this.replayModeActive = true`.
   - This makes `isEnded` evaluate to `true` while the match is still active, causing `isCharacterFilterRowVisible(true, ...)` to return `true` and revealing the character dropdown selector row with `"All"` and all player options.

3. **In-Memory Cache Persistence (`this.logReplayCache`)**
   - `GameScene` caches received turn events in `this.logReplayCache`.
   - If turn events were previously cached while admin view was enabled (or when events were broadcast without player filtering), toggling the checkbox in `SettingsScene` only modifies `localStorage`.
   - `GameScene`'s in-memory `logReplayCache` is not invalidated until the browser tab is reloaded.

4. **Spectator / Non-Player Admin Character Fallback on Server**
   - In `server/modules/src/utils/matchView.ts` (`tailorPlayerCharactersForViewer`):
     ```ts
     const viewerKey = typeof viewerId === "string" ? viewerId : "";
     const viewer = playerCharacters[viewerKey];
     if (!viewer) {
       return { ...playerCharacters }; // <-- Leaks all characters if viewerId is not playing
     }
     ```
   - If an admin user joins as a spectator or referee and does not have an active character entry in `match.playerCharacters`, the server returns all character records untailored when `viewAll` is `false`.

---

## Detailed Fixes

### Fix 1: Default Log Character to `currentUserId` in Standard Matches
**File:** `client/src/ui/panel/CharacterPanel.ts`  
**Location:** Inside `updateFromMatch()` around line 1404

```diff
     if (this.isGameMasterMode) {
       // ... existing Game Master character setup ...
     } else {
       this.activeControlledCharacterId = null;
+      if (currentUserId && !this.logView.getSelectedCharacter()) {
+        this.setLogSelectedCharacter(currentUserId, false);
+      }
     }
```

---

### Fix 2: Remove `replayModeActive` from `isEnded` in `updateLogFilterVisibility`
**File:** `client/src/scenes/GameScene.ts`  
**Location:** `updateLogFilterVisibility()` around line 4747

```diff
   private updateLogFilterVisibility(): void {
     const isEnded = Boolean(
       this.reportReplayMode ||
-      this.replayModeActive ||
       (this.currentMatch && (this.currentMatch.started === false || this.currentMatch.removed !== 0))
     );
     const visible = isCharacterFilterRowVisible(isEnded, Boolean(this.adminViewEnabled));
     this.characterPanel?.setLogFilterRowVisible(visible);
   }
```

---

### Fix 3: Invalidate Log Replay Cache on Admin View State Changes
**File:** `client/src/scenes/GameScene.ts`  
**Location:** In `create()` and wherever `this.adminViewEnabled` changes

```ts
// Ensure the cache is cleared whenever adminViewEnabled is toggled or updated
this.logReplayCache.clear();
```

Additionally, in `client/src/scenes/SettingsScene.ts`, if the settings toggle changes, ensure scenes re-sync or invalidate:
```ts
// When toggling admin view in SettingsScene:
setAdminViewEnabled(this.adminViewEnabled);
```

---

### Fix 4: Server Guard for Spectator / Non-Player Viewers
**File:** `server/modules/src/utils/matchView.ts`  
**Location:** `tailorPlayerCharactersForViewer()` around line 214

```diff
   const viewerKey = typeof viewerId === "string" ? viewerId : "";
   if (!viewerKey) {
-    return { ...playerCharacters };
+    return viewAll ? { ...playerCharacters } : {};
   }
   const viewer = playerCharacters[viewerKey];
   if (!viewer) {
-    return { ...playerCharacters };
+    return viewAll ? { ...playerCharacters } : {};
   }
```

---

## Verification & Testing Checklist

1. **Standard Match as Normal Player:**
   - Log tab should only show own character log.
   - Filter dropdown row should remain hidden during live gameplay, even after pressing play on replay controls.
   - Copy log and export turn should output own character's log.

2. **Standard Match as Admin with `[ ] View all actions and players` (Disabled):**
   - Map fog-of-war and character visibility should be restricted to own character's vision.
   - Log tab should not display "All" or allow picking other characters.
   - Replay scrubbing should only display own character's recorded events.

3. **Standard Match as Admin with `[x] View all actions and players` (Enabled):**
   - Map displays all characters and items.
   - Character selector dropdown appears in log tab, allowing switching between "All" and individual characters.

4. **Ended Match / Full Replay Report:**
   - All players (admin and regular) can view the full replay and select any character or "All".
