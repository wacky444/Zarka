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

export class GoogleService {
  private static scriptPromise: Promise<void> | null = null;
  private static initializedClientId: string | null = null;
  private static pendingLogin: PendingLogin | null = null;

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

      googleIdentity.accounts.id.prompt((notification) => {
        if (
          notification.isNotDisplayed() ||
          notification.isSkippedMoment() ||
          notification.isDismissedMoment()
        ) {
          this.finishLogin(null);
        }
      });
    });
  }

  public static cancel(): void {
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
