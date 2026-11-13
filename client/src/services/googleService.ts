interface GoogleCredentialResponse {
  credential: string;
  clientId?: string;
  select_by?: string;
}

interface GooglePromptMomentNotification {
  isNotDisplayed(): boolean;
  isSkippedMoment(): boolean;
  isDismissedMoment(): boolean;
}

interface GoogleIdentityService {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        context?: "signin" | "signup" | "use";
      }) => void;
      prompt: (
        listener?: (notification: GooglePromptMomentNotification) => void
      ) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: "standard" | "icon";
          theme?: "outline" | "filled_blue" | "filled_black";
          size?: "large" | "medium" | "small";
          text?: "signin_with" | "signup_with" | "continue_with" | "signin";
          shape?: "rectangular" | "pill" | "circle" | "square";
          logo_alignment?: "left" | "center";
          width?: number | string;
          locale?: string;
          click_listener?: () => void;
        }
      ) => void;
      cancel: () => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityService;
  }
}

export interface GoogleAuthResponse {
  idToken: string;
}

type PendingLogin = {
  resolve: (response: GoogleAuthResponse | null) => void;
  timeoutId: number;
};

export function isItchIo(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const hostname = window.location.hostname.toLowerCase();
    if (
      hostname.endsWith(".itch.zone") ||
      hostname.endsWith(".itch.io") ||
      hostname === "itch.zone" ||
      hostname === "itch.io"
    ) {
      return true;
    }
    if (
      document.referrer &&
      (document.referrer.includes("itch.io") ||
        document.referrer.includes("itch.zone"))
    ) {
      return true;
    }
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      for (let i = 0; i < ancestors.length; i++) {
        const origin = ancestors[i].toLowerCase();
        if (origin.includes("itch.io") || origin.includes("itch.zone")) {
          return true;
        }
      }
    }
  } catch {
    // Cross-origin access or security exception
  }
  return false;
}

export class GoogleService {
  private static scriptPromise: Promise<void> | null = null;
  private static initializedClientId: string | null = null;
  private static pendingLogin: PendingLogin | null = null;
  private static modalElement: HTMLElement | null = null;

  public static async initialize(clientId: string): Promise<boolean> {
    if (!clientId.trim()) {
      return false;
    }

    try {
      await this.loadScript();
    } catch (error) {
      console.warn("Google Identity Services failed to load", error);
      return false;
    }

    const googleIdentity = window.google;
    if (!googleIdentity?.accounts?.id) {
      return false;
    }

    if (this.initializedClientId !== clientId) {
      googleIdentity.accounts.id.initialize({
        client_id: clientId,
        callback: this.handleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        context: "signin"
      });
      this.initializedClientId = clientId;
    }

    return true;
  }

  public static async login(
    clientId: string
  ): Promise<GoogleAuthResponse | null> {
    const initialized = await this.initialize(clientId);
    if (!initialized) {
      throw new Error("Google Identity Services not available");
    }

    const googleIdentity = window.google;
    if (!googleIdentity) {
      throw new Error("Google Identity Services not available");
    }

    this.cancelPendingLogin();

    return new Promise<GoogleAuthResponse | null>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.finishLogin(null);
      }, 60_000);
      this.pendingLogin = { resolve, timeoutId };

      if (isItchIo()) {
        this.showPopupModal(googleIdentity);
      } else {
        googleIdentity.accounts.id.prompt((notification) => {
          if (
            notification.isNotDisplayed() ||
            notification.isSkippedMoment() ||
            notification.isDismissedMoment()
          ) {
            this.finishLogin(null);
          }
        });
      }
    });
  }

  private static showPopupModal(googleIdentity: GoogleIdentityService): void {
    this.cleanupModal();

    let isSpanish = false;
    try {
      const locale =
        localStorage.getItem("zarka_locale") ||
        navigator.language ||
        "";
      isSpanish = locale.toLowerCase().startsWith("es");
    } catch {
      // Ignore storage/permission errors
    }

    const overlay = document.createElement("div");
    overlay.id = "zarka-google-popup-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "100000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      padding: "16px",
      boxSizing: "border-box"
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      backgroundColor: "#202030",
      border: "1px solid #4a3d52",
      borderRadius: "14px",
      padding: "24px 28px",
      maxWidth: "340px",
      width: "100%",
      boxShadow: "0 16px 40px rgba(0, 0, 0, 0.7)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
      color: "#f4e9d2",
      fontFamily: "system-ui, -apple-system, sans-serif",
      textAlign: "center"
    });

    const title = document.createElement("h3");
    title.textContent = isSpanish
      ? "Iniciar sesión con Google"
      : "Sign in with Google";
    Object.assign(title.style, {
      margin: "0",
      fontSize: "18px",
      fontWeight: "700",
      color: "#f4e9d2"
    });

    const desc = document.createElement("p");
    desc.textContent = isSpanish
      ? "Pulsa el botón para abrir la ventana de Google:"
      : "Click the button below to open the Google login popup:";
    Object.assign(desc.style, {
      margin: "0",
      fontSize: "13px",
      color: "#aaa3b2",
      lineHeight: "1.4"
    });

    const btnContainer = document.createElement("div");
    btnContainer.id = "zarka-g-btn-container";
    Object.assign(btnContainer.style, {
      minHeight: "44px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      margin: "4px 0"
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = isSpanish ? "Cancelar" : "Cancel";
    Object.assign(cancelBtn.style, {
      background: "#332c38",
      border: "1px solid #55485f",
      borderRadius: "6px",
      color: "#d8d0de",
      padding: "8px 24px",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background 0.2s"
    });
    cancelBtn.onmouseenter = () => {
      cancelBtn.style.background = "#443a4b";
    };
    cancelBtn.onmouseleave = () => {
      cancelBtn.style.background = "#332c38";
    };
    cancelBtn.onclick = () => {
      this.finishLogin(null);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.finishLogin(null);
      }
    };

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(btnContainer);
    card.appendChild(cancelBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    this.modalElement = overlay;

    try {
      googleIdentity.accounts.id.renderButton(btnContainer, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 250,
        locale: isSpanish ? "es" : "en"
      });
    } catch (error) {
      console.warn("Failed to render Google Sign-In button:", error);
    }
  }

  private static cleanupModal(): void {
    if (this.modalElement) {
      if (this.modalElement.parentNode) {
        this.modalElement.parentNode.removeChild(this.modalElement);
      }
      this.modalElement = null;
    }
  }

  public static cancel(): void {
    this.cleanupModal();
    window.google?.accounts.id.cancel();
    this.finishLogin(null);
  }

  private static readonly handleCredential = (
    response: GoogleCredentialResponse
  ): void => {
    if (!response.credential) {
      this.finishLogin(null);
      return;
    }
    this.finishLogin({ idToken: response.credential });
  };

  private static finishLogin(response: GoogleAuthResponse | null): void {
    this.cleanupModal();
    const pending = this.pendingLogin;
    if (!pending) {
      return;
    }
    this.pendingLogin = null;
    window.clearTimeout(pending.timeoutId);
    pending.resolve(response);
  }

  private static cancelPendingLogin(): void {
    if (this.pendingLogin) {
      this.finishLogin(null);
    }
  }

  private static loadScript(): Promise<void> {
    if (window.google?.accounts?.id) {
      return Promise.resolve();
    }
    if (this.scriptPromise) {
      return this.scriptPromise;
    }

    this.scriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), {
          once: true
        });
        existingScript.addEventListener("error", () => reject(new Error("Google Identity Services script failed to load")), {
          once: true
        });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Google Identity Services script failed to load"));
      document.head.appendChild(script);
    });

    return this.scriptPromise;
  }
}
