export const THEME = {
  colors: {
    modalBackground: 0x0f172a,
    modalHeader: "#ffffff",
    modalText: "#cbd5f5",

    cardBackground: 0x1b2440,
    cardSelected: 0x2b3a6b,
    cardPrioritized: 0x164e37,
    cardDisabled: 0x151e35,
    collapsedBackground: 0x101828,
    collapsedBorder: 0x1f2a4a,

    textPrimary: "#ffffff",
    textMuted: "#94a3b8",
    textDisabled: "#94a3b8",
    cooldown: "#f87171",
    warning: "#fb923c",
    zarkanGold: "#facc15",
    energyCost: "#fafa15",
    energyAccent: 0xfafa15,
    healthDamageAccent: 0xf97373,
    energyDamage: "#fafa15",
    energyRecover: "#fafa15",
    healthAccent: 0x4ade80,
    healthDamage: "#f97373",
    healthRecover: "#4ade80",

    loadingBackground: 0x0f172a,
    loadingTrack: 0x1f2a4a,
    loadingFill: 0x3b82f6,
    loadingText: "#cbd5f5",
    loadingPercent: "#93c5fd",

    tutorialHighlight: 0xfbbf24,
    tutorialHighlightText: "#fbbf24",

    panelBackground: 0x1b2440,
    panelBorder: 0x253055,
    headerBackground: 0x141c33,
    headerBorder: 0x2d3a60,
    experienceText: "#cbd5e1",

    skillCardBackground: 0x202b4a,
    skillCardBorder: 0x2f3a5d,

    buttonConfirmBorder: 0x22c55e,
    buttonConfirmFill: 0x16a34a,
    buttonConfirmHover: 0x22c55e,
    buttonRevertBorder: 0x475569,
    buttonRevertFill: 0x475569,
    buttonRevertHover: 0xef4444,
    buttonDangerFill: 0xef4444,
    buttonDangerHover: 0xf87171,
    buttonDisabledBackground: 0x334155,

    subtabActiveFill: 0x253055,
    subtabActiveStroke: 0x4d74b8,
    subtabInactiveFill: 0x141c33,
    subtabInactiveStroke: 0x253055,
    subtabInactiveText: "#8ea4d2",

    unreadBadge: 0xff6600
  },

  buttons: {
    default: {
      text: "#00ff88",
      background: "#00332a"
    },
    hover: {
      text: "#ffffff",
      background: "#005c49"
    },
    disabled: {
      text: "#94a3b8",
      background: "#334155"
    }
  }
} as const;
