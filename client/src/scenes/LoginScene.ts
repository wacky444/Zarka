import Phaser from "phaser";
import { Client, Session } from "@heroiclabs/nakama-js";
import { makeButton, type UIButton } from "../ui/button";
import { getEnv, healthProbe } from "../services/nakama";
import { SessionManager } from "../services/sessionManager";
import { FacebookService } from "../services/facebookService";

enum LoginGuiState {
  Entry = "entry",
  Login = "login",
  Register = "register",
}

type VisibleGameObject = Phaser.GameObjects.GameObject & {
  setVisible: (value: boolean) => VisibleGameObject;
};

export class LoginScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private client!: Client;
  private guiState: LoginGuiState = LoginGuiState.Entry;

  private emailValue = "";
  private passwordValue = "";
  private usernameValue = "";

  private isEmailFocused = false;
  private isPasswordFocused = false;
  private isUsernameFocused = false;

  private emailLabel!: Phaser.GameObjects.Text;
  private passwordLabel!: Phaser.GameObjects.Text;
  private usernameLabel!: Phaser.GameObjects.Text;
  private emailDisplay!: Phaser.GameObjects.Text;
  private passwordDisplay!: Phaser.GameObjects.Text;
  private usernameDisplay!: Phaser.GameObjects.Text;
  private formActionButton!: UIButton;
  private formBackButton!: UIButton;

  private entryObjects: VisibleGameObject[] = [];
  private formObjects: VisibleGameObject[] = [];

  constructor() {
    super("LoginScene"); // Required to show the scene on logout
  }

  preload() {}

  async create() {
    // Since the LoginScene is the first scene, it will be loaded even if we have a valid session.
    // Change the scene back to MainScene
    try {
      if (SessionManager.hasValidSession()) {
        const restored = await SessionManager.restoreSession();
        if (restored) {
          // Navigate directly and stop this scene to avoid UI overlap
          this.scene.stop();
          this.scene.start("MainScene", {
            client: restored.client,
            session: restored.session,
          });
          return;
        }
      }
    } catch (e) {
      console.warn("Auto-restore on LoginScene failed:", e);
    }

    // Initialize Nakama client
    const { host, port, useSSL, serverKey } = getEnv();
    this.client = new Client(serverKey, host, port, useSSL);
    await healthProbe(host, parseInt(port, 10), useSSL);

    // Title
    this.add
      .text(400, 100, "Zarka", {
        color: "#ffffff",
        fontSize: "32px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(400, 150, "Choose your login method", {
        color: "#cccccc",
        fontSize: "16px",
      })
      .setOrigin(0.5);

    this.createEntryButtons();
    this.createAuthForm();
    this.setGuiState(LoginGuiState.Entry);

    this.input.keyboard!.on("keydown", (event: KeyboardEvent) => {
      this.handleKeyboardInput(event);
    });
  }

  private createEntryButtons() {
    const facebookButton = makeButton(
      this,
      400,
      230,
      "Login with Facebook",
      async () => {
        await this.loginWithFacebook();
      },
    ).setOrigin(0.5);

    const loginButton = makeButton(this, 400, 300, "Login", async () => {
      this.setGuiState(LoginGuiState.Login);
    }).setOrigin(0.5);

    const guestButton = makeButton(
      this,
      400,
      370,
      "Continue as Guest",
      async () => {
        await this.loginAsGuest();
      },
    ).setOrigin(0.5);

    const registerButton = makeButton(this, 400, 440, "Register", async () => {
      this.setGuiState(LoginGuiState.Register);
    }).setOrigin(0.5);

    this.entryObjects.push(
      facebookButton as VisibleGameObject,
      loginButton as VisibleGameObject,
      guestButton as VisibleGameObject,
      registerButton as VisibleGameObject,
    );
  }

  private createAuthForm() {
    this.emailLabel = this.add.text(200, 280, "Email:", {
      color: "#ffffff",
      fontSize: "16px",
    });

    this.emailDisplay = this.add.text(200, 305, "", {
      color: "#666666",
      fontSize: "14px",
      backgroundColor: "#333333",
      padding: { x: 8, y: 4 },
    });
    this.emailDisplay.setInteractive({ useHandCursor: true });
    this.emailDisplay.on("pointerdown", () => {
      this.focusEmailInput();
    });

    this.passwordLabel = this.add.text(200, 345, "Password:", {
      color: "#ffffff",
      fontSize: "16px",
    });

    this.passwordDisplay = this.add.text(200, 370, "", {
      color: "#666666",
      fontSize: "14px",
      backgroundColor: "#333333",
      padding: { x: 8, y: 4 },
    });
    this.passwordDisplay.setInteractive({ useHandCursor: true });
    this.passwordDisplay.on("pointerdown", () => {
      this.focusPasswordInput();
    });

    this.usernameLabel = this.add.text(200, 410, "Username:", {
      color: "#ffffff",
      fontSize: "16px",
    });

    this.usernameDisplay = this.add.text(200, 435, "", {
      color: "#666666",
      fontSize: "14px",
      backgroundColor: "#333333",
      padding: { x: 8, y: 4 },
    });
    this.usernameDisplay.setInteractive({ useHandCursor: true });
    this.usernameDisplay.on("pointerdown", () => {
      this.focusUsernameInput();
    });

    this.formActionButton = makeButton(this, 300, 510, "Login", async () => {
      if (this.guiState === LoginGuiState.Login) {
        await this.loginWithEmail();
        return;
      }

      await this.registerWithEmail();
    }).setOrigin(0.5);

    this.formBackButton = makeButton(this, 500, 510, "Back", async () => {
      this.setGuiState(LoginGuiState.Entry);
    }).setOrigin(0.5);

    this.formObjects.push(
      this.emailLabel as VisibleGameObject,
      this.emailDisplay as VisibleGameObject,
      this.passwordLabel as VisibleGameObject,
      this.passwordDisplay as VisibleGameObject,
      this.usernameLabel as VisibleGameObject,
      this.usernameDisplay as VisibleGameObject,
      this.formActionButton as VisibleGameObject,
      this.formBackButton as VisibleGameObject,
    );
  }

  private setGuiState(state: LoginGuiState) {
    this.guiState = state;

    const isEntry = state === LoginGuiState.Entry;
    const isRegister = state === LoginGuiState.Register;

    this.setGroupVisible(this.entryObjects, isEntry);
    this.setGroupVisible(this.formObjects, !isEntry);
    this.usernameLabel.setVisible(isRegister);
    this.usernameDisplay.setVisible(isRegister);

    if (isEntry) {
      this.clearFocus();
      this.statusText.setText("Choose your login method");
      this.updateDisplays();
      return;
    }

    this.formActionButton.setText(isRegister ? "[ Register ]" : "[ Login ]");
    this.statusText.setText(
      isRegister ? "Create your account" : "Login with username or email",
    );

    this.focusEmailInput();
    this.updateDisplays();
  }

  private setGroupVisible(objects: VisibleGameObject[], visible: boolean) {
    objects.forEach((object) => {
      object.setVisible(visible);
    });
  }

  private clearFocus() {
    this.isEmailFocused = false;
    this.isPasswordFocused = false;
    this.isUsernameFocused = false;
  }

  private focusEmailInput() {
    this.isEmailFocused = true;
    this.isPasswordFocused = false;
    this.isUsernameFocused = false;
    this.updateDisplays();
  }

  private focusPasswordInput() {
    this.isEmailFocused = false;
    this.isPasswordFocused = true;
    this.isUsernameFocused = false;
    this.updateDisplays();
  }

  private focusUsernameInput() {
    if (this.guiState !== LoginGuiState.Register) {
      return;
    }

    this.isEmailFocused = false;
    this.isPasswordFocused = false;
    this.isUsernameFocused = true;
    this.updateDisplays();
  }

  private updateDisplays() {
    const isLogin = this.guiState === LoginGuiState.Login;
    const emailPlaceholder = isLogin
      ? "Click to enter email or username..."
      : "Click to enter email...";

    this.emailLabel.setText(isLogin ? "Email or Username:" : "Email:");

    // Update email display
    if (this.isEmailFocused) {
      this.emailDisplay.setStyle({
        color: "#ffffff",
        backgroundColor: "#555555",
      });
      this.emailDisplay.setText(this.emailValue + "_");
    } else {
      this.emailDisplay.setStyle({
        color: this.emailValue ? "#ffffff" : "#666666",
        backgroundColor: "#333333",
      });
      this.emailDisplay.setText(this.emailValue || emailPlaceholder);
    }

    // Update password display
    if (this.isPasswordFocused) {
      this.passwordDisplay.setStyle({
        color: "#ffffff",
        backgroundColor: "#555555",
      });
      const maskedPassword = "*".repeat(this.passwordValue.length);
      this.passwordDisplay.setText(maskedPassword + "_");
    } else {
      this.passwordDisplay.setStyle({
        color: this.passwordValue ? "#ffffff" : "#666666",
        backgroundColor: "#333333",
      });
      const maskedPassword = "*".repeat(this.passwordValue.length);
      this.passwordDisplay.setText(
        maskedPassword || "Click to enter password...",
      );
    }

    // Update username display
    if (this.isUsernameFocused) {
      this.usernameDisplay.setStyle({
        color: "#ffffff",
        backgroundColor: "#555555",
      });
      this.usernameDisplay.setText(this.usernameValue + "_");
    } else {
      this.usernameDisplay.setStyle({
        color: this.usernameValue ? "#ffffff" : "#666666",
        backgroundColor: "#333333",
      });
      this.usernameDisplay.setText(
        this.usernameValue || "Click to enter username...",
      );
    }
  }

  private handleKeyboardInput(event: KeyboardEvent) {
    if (this.guiState === LoginGuiState.Entry) {
      return;
    }

    if (
      !this.isEmailFocused &&
      !this.isPasswordFocused &&
      !this.isUsernameFocused
    ) {
      return;
    }

    if (event.key === "Backspace") {
      if (this.isEmailFocused && this.emailValue.length > 0) {
        this.emailValue = this.emailValue.slice(0, -1);
      } else if (this.isPasswordFocused && this.passwordValue.length > 0) {
        this.passwordValue = this.passwordValue.slice(0, -1);
      } else if (
        this.guiState === LoginGuiState.Register &&
        this.isUsernameFocused &&
        this.usernameValue.length > 0
      ) {
        this.usernameValue = this.usernameValue.slice(0, -1);
      }
    } else if (event.key === "Tab") {
      event.preventDefault();
      this.focusNextInput();
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.handleEnterKey();
    } else if (event.key.length === 1) {
      if (this.isEmailFocused) {
        this.emailValue += event.key;
      } else if (this.isPasswordFocused) {
        this.passwordValue += event.key;
      } else if (
        this.guiState === LoginGuiState.Register &&
        this.isUsernameFocused
      ) {
        this.usernameValue += event.key;
      }
    }

    this.updateDisplays();
  }

  private focusNextInput() {
    if (this.guiState === LoginGuiState.Register) {
      if (this.isEmailFocused) {
        this.focusUsernameInput();
      } else if (this.isUsernameFocused) {
        this.focusPasswordInput();
      } else {
        this.focusEmailInput();
      }
      return;
    }

    if (this.isEmailFocused) {
      this.focusPasswordInput();
    } else {
      this.focusEmailInput();
    }
  }

  private handleEnterKey() {
    if (this.guiState === LoginGuiState.Register) {
      if (this.isEmailFocused) {
        this.focusUsernameInput();
      } else if (this.isUsernameFocused) {
        this.focusPasswordInput();
      } else {
        this.registerWithEmail();
      }
      return;
    }

    if (this.isEmailFocused) {
      this.focusPasswordInput();
    } else {
      this.loginWithEmail();
    }
  }

  private async loginWithFacebook() {
    this.statusText.setText("Initializing Facebook login...");

    try {
      // Initialize Facebook SDK
      const initialized = await FacebookService.initialize();
      if (!initialized) {
        this.statusText.setText(
          "Facebook SDK not available. Please check your internet connection.",
        );
        return;
      }

      this.statusText.setText("Please complete Facebook login...");

      // Attempt Facebook login
      const authResponse = await FacebookService.login();
      if (!authResponse) {
        this.statusText.setText("Facebook login was cancelled or failed.");
        return;
      }

      this.statusText.setText("Authenticating with game server...");

      // Authenticate with Nakama using Facebook token
      const session = await this.client.authenticateFacebook(
        authResponse.accessToken,
        true,
      );
      this.proceedToGame(session);
    } catch (error) {
      console.error("Facebook login error:", error);
      this.statusText.setText(
        "Facebook login failed. Please try again or use email login.",
      );
    }
  }

  private async loginWithEmail() {
    const identifier = this.emailValue.trim();
    const password = this.passwordValue.trim();

    if (!identifier || !password) {
      this.statusText.setText("Please enter username/email and password.");
      return;
    }

    this.statusText.setText("Logging in...");

    try {
      const isEmail = identifier.includes("@");
      const email = isEmail ? identifier : "";
      const username = isEmail ? undefined : identifier;

      const session = await this.client.authenticateEmail(
        email,
        password,
        false,
        username,
      );
      this.proceedToGame(session);
    } catch (error) {
      console.error("Email login error:", error);
      this.statusText.setText(
        "Login failed. Please check your username/email and password.",
      );
    }
  }

  private async registerWithEmail() {
    const email = this.emailValue.trim();
    const password = this.passwordValue.trim();
    const username = this.usernameValue.trim();

    if (!username) {
      this.statusText.setText("Please enter a username.");
      return;
    }

    if (!email || !password) {
      this.statusText.setText("Please enter both email and password.");
      return;
    }

    if (password.length < 8) {
      this.statusText.setText("Password must be at least 8 characters long.");
      return;
    }

    this.statusText.setText("Creating account...");

    try {
      const session = await this.client.authenticateEmail(
        email,
        password,
        true,
        username,
      );
      this.statusText.setText("Account created successfully!");
      this.proceedToGame(session);
    } catch (error) {
      console.error("Registration error:", error);
      this.statusText.setText(
        "Registration failed. Email may already be in use.",
      );
    }
  }

  private async loginAsGuest() {
    this.statusText.setText("Logging in as guest...");

    try {
      // Use device authentication as guest login
      const deviceId = this.getOrCreateDeviceId();
      const session = await this.client.authenticateDevice(deviceId, true);
      this.proceedToGame(session);
    } catch (error) {
      console.error("Guest login error:", error);
      this.statusText.setText("Guest login failed. Please try again.");
    }
  }

  private getOrCreateDeviceId(): string {
    const key = "device_id";
    let existing = localStorage.getItem(key);
    if (!existing) {
      existing = crypto.randomUUID();
      localStorage.setItem(key, existing);
    }
    return existing;
  }

  private proceedToGame(session: Session) {
    // Store session using SessionManager
    SessionManager.storeSession(session);

    this.statusText.setText("Login successful! Starting game...");

    // Pass session data to MainScene
    this.scene.start("MainScene", {
      client: this.client,
      session: session,
    });
  }
}
