import { Client, Session } from "@heroiclabs/nakama-js";
import { getEnv, healthProbe } from "./nakama";

export interface SessionData {
  token: string;
  refresh_token?: string;
  user_id?: string;
  username?: string;
  created?: boolean;
  expires_at?: number;
  refresh_expires_at?: number;
}

export class SessionManager {
  private static readonly SESSION_KEY = "nakama_session";
  private static readonly onSessionExpiredCallbacks: Set<() => void> = new Set();

  public static onSessionExpired(callback: () => void): () => void {
    this.onSessionExpiredCallbacks.add(callback);
    return () => {
      this.onSessionExpiredCallbacks.delete(callback);
    };
  }

  public static notifySessionExpired(): void {
    for (const cb of this.onSessionExpiredCallbacks) {
      try {
        cb();
      } catch (e) {
        console.error("Error in session expired callback:", e);
      }
    }
  }

  public static attachSessionRefreshHandler(client: Client): Client {
    const clientAny = client as unknown as { __sessionRefreshAttached?: boolean };
    if (clientAny.__sessionRefreshAttached) {
      return client;
    }
    clientAny.__sessionRefreshAttached = true;

    const originalRefresh = client.sessionRefresh.bind(client);
    client.sessionRefresh = async (session: Session, vars?: Record<string, string>) => {
      try {
        const refreshed = await originalRefresh(session, vars);
        this.storeSession(refreshed);
        return refreshed;
      } catch (err: unknown) {
        const status = (err as { status?: number; statusCode?: number })?.status ??
          (err as { status?: number; statusCode?: number })?.statusCode;
        if (status === 401) {
          this.clearSession();
          this.notifySessionExpired();
        }
        throw err;
      }
    };

    const originalRpc = client.rpc.bind(client);
    client.rpc = async (session: Session, id: string, input: object) => {
      try {
        return await originalRpc(session, id, input);
      } catch (err: unknown) {
        const status = (err as { status?: number; statusCode?: number })?.status ??
          (err as { status?: number; statusCode?: number })?.statusCode;
        if (status === 401) {
          this.clearSession();
          this.notifySessionExpired();
        }
        throw err;
      }
    };

    return client;
  }
  
  public static hasValidSession(): boolean {
    const sessionData = this.getStoredSession();
    if (!sessionData || !sessionData.token) return false;
    
    // Check if session is expired (with some buffer time)
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 300; // 5 minutes buffer

    if (sessionData.refresh_token && sessionData.refresh_expires_at) {
      if (now >= (sessionData.refresh_expires_at - bufferTime)) {
        this.clearSession();
        return false;
      }
      return true;
    }

    if (sessionData.refresh_token) {
      return true;
    }

    if (sessionData.expires_at) {
      if (now >= (sessionData.expires_at - bufferTime)) {
        this.clearSession();
        return false;
      }
    }
    
    return true;
  }
  
  public static getStoredSession(): SessionData | null {
    try {
      const stored = localStorage.getItem(this.SESSION_KEY);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (error) {
      console.error("Error parsing stored session:", error);
      this.clearSession();
      return null;
    }
  }
  
  public static async restoreSession(): Promise<{ client: Client; session: Session } | null> {
    const sessionData = this.getStoredSession();
    if (!sessionData || !this.hasValidSession()) return null;
    
    try {
      const { host, port, useSSL, serverKey } = getEnv();
      const client = this.attachSessionRefreshHandler(new Client(serverKey, host, port, useSSL));
      await healthProbe(host, parseInt(port, 10), useSSL);
      
      // Create session object from stored data
      const session = Session.restore(
        sessionData.token,
        sessionData.refresh_token || ""
      );
      
      const now = Math.floor(Date.now() / 1000);
      if (session.refresh_token && session.isrefreshexpired(now)) {
        this.clearSession();
        return null;
      }

      // Try to refresh the session if it's close to expiring
      const bufferTime = 300;
      if (session.refresh_token && session.isexpired(now + bufferTime)) {
        try {
          const refreshedSession = await client.sessionRefresh(session);
          this.storeSession(refreshedSession);
          return { client, session: refreshedSession };
        } catch (refreshError) {
          console.warn("Session refresh failed:", refreshError);
          this.clearSession();
          return null;
        }
      }
      
      return { client, session };
    } catch (error) {
      console.error("Error restoring session:", error);
      this.clearSession();
      return null;
    }
  }
  
  public static storeSession(session: Session): void {
    const sessionData: SessionData = {
      token: session.token,
      refresh_token: session.refresh_token,
      user_id: session.user_id || undefined,
      username: session.username,
      created: session.created,
      expires_at: session.expires_at,
      refresh_expires_at: session.refresh_expires_at,
    };
    
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(sessionData));
  }
  
  public static clearSession(): void {
    localStorage.removeItem(this.SESSION_KEY);
  }
  
  public static async linkFacebookAccount(client: Client, session: Session, facebookToken: string): Promise<void> {
    try {
      await client.linkFacebook(session, { token: facebookToken });
    } catch (error) {
      console.error("Failed to link Facebook account:", error);
      throw error;
    }
  }
  
  public static async unlinkFacebookAccount(client: Client, session: Session): Promise<void> {
    try {
      await client.unlinkFacebook(session, {});
    } catch (error) {
      console.error("Failed to unlink Facebook account:", error);
      throw error;
    }
  }
}