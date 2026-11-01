---
name: zarka-chat
description: Architecture and rules for developing or modifying Zarka's dual-mode mobile/PC chat (CharacterPanelChatView).
---

# Zarka Chat

## Core Rule: Single Shared Component

Do not create separate PC and mobile chat classes. Reuse the single `CharacterPanelChatView` instance across both modes.

## Modes & Switching

- **PC (`!isMobile(width)`)**:
  - Chat tab is hidden (`CharacterPanelTabs.setTabHidden("chat", true)`). Panel displays remaining 5 tabs.
  - Chat container detached from `CharacterPanel` and added to scene (`cameras.main.ignore`, `depth: 900`).
  - Positioned bottom-left over map (`x: 10`, bottom-anchored above menu button) with semi-transparent frame (`0x0a1020`, alpha 0.68).
  - Expand button toggles compact (210px) vs expanded (~350px upward). Placed to the left of the close button.
  - Close button (`ModalCloseButton`) minimizes overlay into a single line (30px) showing the last chat message and a restore button (`up.png`).
  - Left-rail down arrow jumps to bottom (`scrollToBottom()`).
  - `Enter` key focuses input from gameplay (restoring chat if minimized); typing `Enter` sends; `Escape` blurs.
- **Mobile (`isMobile(width)`)**:
  - Chat tab unhidden; container docked back inside `CharacterPanel`.
  - Visibility tied to active `"chat"` tab.

## Key Files

- `client/src/ui/CharacterPanelChatView.ts`: Chat UI, rexUI scroll panel, DOM input, layouts.
- `client/src/ui/panel/CharacterPanel.ts`: Manages single `chatView`, handles `setChatOverlayMode()`.
- `client/src/ui/CharacterPanelTabs.ts`: Tab state & `setTabHidden()`.
- `client/src/ui/panel/CharacterPanelTabLayout.ts`: Computes tab widths for non-hidden tabs.
- `client/src/scenes/GameScene.ts`: Resizing (`layoutUI`), camera ignores, Enter hotkey.

## Technical Invariants

1. **Map Shielding**: `GameScene.isPointOverUI` must check `characterPanel.isPointOverChat(x, y)` to block map clicks/drags.
2. **DOM Input Sync**: Native `<input>` style (`left`, `top`, `width`, `height`) computed via `canvas.getBoundingClientRect()` + scale factor.
3. **Scroll to Bottom**: RexUI panel needs `scrollToBottom()` plus `delayedCall(0)` / `delayedCall(50)` on initial load (`setMessages`) and expand toggle to account for BBCode font layout passes.
4. **Icons**: Preloaded in `GameScene.preload()` from `assets/images/chat-icons/` (`expand.png`, `collapse.png`, `arrowDown.png`, `talk.png`, `up.png`).
