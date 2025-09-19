import Phaser from "phaser";
import { Client, Session } from "@heroiclabs/nakama-js";
import { makeButton } from "../ui/button";
import { getEnv, healthProbe } from "../services/nakama";
import { SessionManager } from "../services/sessionManager";
import { FacebookService } from "../services/facebookService";

export class LoginScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private client!: Client;
  private emailValue = "";
  private passwordValue = "";
  private isEmailFocused = false;
  private isPasswordFocused = false;
  private emailDisplay!: Phaser.GameObjects.Text;
  private passwordDisplay!: Phaser.GameObjects.Text;

  constructor() {
    super("LoginScene");
  }

  preload() {}

  async create() {
    // Initialize Nakama client
    const { host, port, useSSL, serverKey } = getEnv();
    this.client = new Client(serverKey, host, port, useSSL);
    await healthProbe(host, parseInt(port, 10), useSSL);

    // Title
    this.add.text(400, 100, "Zarka Login", {
      color: "#ffffff",
      fontSize: "32px",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.statusText = this.add.text(400, 150, "Choose your login method", {
      color: "#cccccc",
      fontSize: "16px",
    }).setOrigin(0.5);

    // Facebook Login Button
    makeButton(
      this,
      400,
      200,
      "Login with Facebook",
      async () => {
        await this.loginWithFacebook();
      }
    ).setOrigin(0.5);

    // Email Login Section
    this.add.text(400, 280, "Or login with email:", {
      color: "#ffffff",
      fontSize: "18px",
    }).setOrigin(0.5);

    // Email input display
    this.add.text(200, 320, "Email:", {
      color: "#ffffff",
      fontSize: "16px",
    });

    this.emailDisplay = this.add.text(200, 345, "Click to enter email...", {
      color: "#666666",
      fontSize: "14px",
      backgroundColor: "#333333",
      padding: { x: 8, y: 4 },
    });
    this.emailDisplay.setInteractive({ useHandCursor: true });
    this.emailDisplay.on('pointerdown', () => {
      this.focusEmailInput();
    });

    // Password input display
    this.add.text(200, 385, "Password:", {
      color: "#ffffff",
      fontSize: "16px",
    });

    this.passwordDisplay = this.add.text(200, 410, "Click to enter password...", {
      color: "#666666",
      fontSize: "14px",
      backgroundColor: "#333333",
      padding: { x: 8, y: 4 },
    });
    this.passwordDisplay.setInteractive({ useHandCursor: true });
    this.passwordDisplay.on('pointerdown', () => {
      this.focusPasswordInput();
    });

    // Setup keyboard input
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      this.handleKeyboardInput(event);
    });

    // Email Login Button
    makeButton(
      this,
      300,
      450,
      "Login",
      async () => {
        await this.loginWithEmail();
      }
    ).setOrigin(0.5);

    // Register Button
    makeButton(
      this,
      500,
      450,
      "Register",
      async () => {
        await this.registerWithEmail();
      }
    ).setOrigin(0.5);

    // Guest Login (device auth as fallback)
    makeButton(
      this,
      400,
      520,
      "Continue as Guest",
      async () => {
        await this.loginAsGuest();
      }
    ).setOrigin(0.5);
  }

  private focusEmailInput() {
    this.isEmailFocused = true;
    this.isPasswordFocused = false;
    this.updateDisplays();
  }

  private focusPasswordInput() {
    this.isEmailFocused = false;
    this.isPasswordFocused = true;
    this.updateDisplays();
  }

  private updateDisplays() {
    // Update email display
    if (this.isEmailFocused) {
      this.emailDisplay.setStyle({ 
        color: "#ffffff", 
        backgroundColor: "#555555" 
      });
      this.emailDisplay.setText(this.emailValue + "_");
    } else {
      this.emailDisplay.setStyle({ 
        color: this.emailValue ? "#ffffff" : "#666666", 
        backgroundColor: "#333333" 
      });
      this.emailDisplay.setText(this.emailValue || "Click to enter email...");
    }

    // Update password display
    if (this.isPasswordFocused) {
      this.passwordDisplay.setStyle({ 
        color: "#ffffff", 
        backgroundColor: "#555555" 
      });
      const maskedPassword = "*".repeat(this.passwordValue.length);
      this.passwordDisplay.setText(maskedPassword + "_");
    } else {
      this.passwordDisplay.setStyle({ 
        color: this.passwordValue ? "#ffffff" : "#666666", 
        backgroundColor: "#333333" 
      });
      const maskedPassword = "*".repeat(this.passwordValue.length);
      this.passwordDisplay.setText(maskedPassword || "Click to enter password...");
    }
  }

  private handleKeyboardInput(event: KeyboardEvent) {
    if (!this.isEmailFocused && !this.isPasswordFocused) return;

    if (event.key === 'Backspace') {
      if (this.isEmailFocused && this.emailValue.length > 0) {
        this.emailValue = this.emailValue.slice(0, -1);
      } else if (this.isPasswordFocused && this.passwordValue.length > 0) {
        this.passwordValue = this.passwordValue.slice(0, -1);
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (this.isEmailFocused) {
        this.focusPasswordInput();
      } else {
        this.focusEmailInput();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (this.isEmailFocused) {
        this.focusPasswordInput();
      } else {
        this.loginWithEmail();
      }
    } else if (event.key.length === 1) {
      // Regular character input
      if (this.isEmailFocused) {
        this.emailValue += event.key;
      } else if (this.isPasswordFocused) {
        this.passwordValue += event.key;
      }
    }

    this.updateDisplays();
  }

  private async loginWithFacebook() {
    this.statusText.setText("Initializing Facebook login...");
    
    try {
      // Initialize Facebook SDK
      const initialized = await FacebookService.initialize();
      if (!initialized) {
        this.statusText.setText("Facebook SDK not available. Please check your internet connection.");
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
      const session = await this.client.authenticateFacebook(authResponse.accessToken, true);
      this.proceedToGame(session);
      
    } catch (error) {
      console.error("Facebook login error:", error);
      this.statusText.setText("Facebook login failed. Please try again or use email login.");
    }
  }

  private async loginWithEmail() {
    const email = this.emailValue.trim();
    const password = this.passwordValue.trim();

    if (!email || !password) {
      this.statusText.setText("Please enter both email and password.");
      return;
    }

    this.statusText.setText("Logging in...");

    try {
      const session = await this.client.authenticateEmail(email, password);
      this.proceedToGame(session);
    } catch (error) {
      console.error("Email login error:", error);
      this.statusText.setText("Login failed. Please check your credentials.");
    }
  }

  private async registerWithEmail() {
    const email = this.emailValue.trim();
    const password = this.passwordValue.trim();

    if (!email || !password) {
      this.statusText.setText("Please enter both email and password.");
      return;
    }

    if (password.length < 6) {
      this.statusText.setText("Password must be at least 6 characters long.");
      return;
    }

    this.statusText.setText("Creating account...");

    try {
      const session = await this.client.authenticateEmail(email, password, true);
      this.statusText.setText("Account created successfully!");
      this.proceedToGame(session);
    } catch (error) {
      console.error("Registration error:", error);
      this.statusText.setText("Registration failed. Email may already be in use.");
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
      session: session 
    });
  }
}