export const THEME = {
  colors: {
    modalBackground: 0x0f172a,
    modalHeader: "#ffffff",
    modalText: "#cbd5f5",

    cardBackground: 0x1b2440,
    cardSelected: 0x2b3a6b,
    cardDisabled: 0x151e35,
    collapsedBackground: 0x101828,
    collapsedBorder: 0x1f2a4a,

    textPrimary: "#ffffff",
    textMuted: "#94a3b8",
    textDisabled: "#94a3b8",
    cooldown: "#f87171",
    energyCost: "#facc15",
    energyAccent: 0xfacc15,
    healthAccent: 0x4ade80,
    healthDamage: "#f97373"
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
