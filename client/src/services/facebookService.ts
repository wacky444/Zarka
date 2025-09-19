// Type definitions for Facebook SDK
declare global {
  interface Window {
    FB: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (callback: (response: FacebookLoginResponse) => void, options?: { scope: string }) => void;
      getLoginStatus: (callback: (response: FacebookLoginResponse) => void) => void;
      logout: (callback: () => void) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface FacebookLoginResponse {
  status: string;
  authResponse?: {
    accessToken: string;
    userID: string;
  };
}

export interface FacebookAuthResponse {
  accessToken: string;
  userID: string;
  status: string;
}

export class FacebookService {
  private static isInitialized = false;
  
  public static async initialize(): Promise<boolean> {
    return new Promise((resolve) => {
      // Check if FB SDK is already loaded
      if (window.FB) {
        this.isInitialized = true;
        resolve(true);
        return;
      }
      
      // Wait for FB SDK to initialize
      const originalFbAsyncInit = window.fbAsyncInit;
      window.fbAsyncInit = function() {
        if (originalFbAsyncInit) {
          originalFbAsyncInit();
        }
        FacebookService.isInitialized = true;
        resolve(true);
      };
      
      // Timeout after 10 seconds if FB SDK doesn't load
      setTimeout(() => {
        if (!FacebookService.isInitialized) {
          console.warn("Facebook SDK failed to load within timeout");
          resolve(false);
        }
      }, 10000);
    });
  }
  
  public static async login(): Promise<FacebookAuthResponse | null> {
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error("Facebook SDK not available");
      }
    }
    
    return new Promise((resolve) => {
      window.FB.login((response: FacebookLoginResponse) => {
        if (response.authResponse) {
          const authResponse: FacebookAuthResponse = {
            accessToken: response.authResponse.accessToken,
            userID: response.authResponse.userID,
            status: response.status
          };
          resolve(authResponse);
        } else {
          resolve(null);
        }
      }, { scope: 'email' });
    });
  }
  
  public static async getLoginStatus(): Promise<FacebookAuthResponse | null> {
    if (!this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) {
        return null;
      }
    }
    
    return new Promise((resolve) => {
      window.FB.getLoginStatus((response: FacebookLoginResponse) => {
        if (response.status === 'connected' && response.authResponse) {
          const authResponse: FacebookAuthResponse = {
            accessToken: response.authResponse.accessToken,
            userID: response.authResponse.userID,
            status: response.status
          };
          resolve(authResponse);
        } else {
          resolve(null);
        }
      });
    });
  }
  
  public static async logout(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }
    
    return new Promise((resolve) => {
      window.FB.logout(() => {
        resolve();
      });
    });
  }
}