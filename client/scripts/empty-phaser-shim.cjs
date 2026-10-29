module.exports = {
  Math: {
    Clamp(val, min, max) {
      return Math.min(Math.max(val, min), max);
    }
  },
  Input: {
    Events: {
      POINTER_UP: "pointerup",
      POINTER_DOWN: "pointerdown"
    }
  },
  GameObjects: {
    Text: class Text {
      setText() {
        return this;
      }
    },
    GameObject: class GameObject {}
  }
};
