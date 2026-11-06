module.exports = {
  Scene: class Scene {
    constructor() {}
  },
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
    GameObject: class GameObject {},
    Container: class Container {
      setSize() {
        return this;
      }
      add() {
        return this;
      }
      setPosition() {
        return this;
      }
      setOrigin() {
        return this;
      }
      setVisible() {
        return this;
      }
      destroy() {}
    },
    Image: class Image {}
  },
  Scale: {
    Events: {
      RESIZE: "resize"
    }
  },
  Scenes: {
    Events: {
      WAKE: "wake",
      SHUTDOWN: "shutdown"
    }
  }
};
