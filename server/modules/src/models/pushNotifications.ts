export interface WebPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface StoredPushSubscription {
  deviceId: string;
  userId: string;
  subscription: WebPushSubscription;
  locale: "en" | "es";
  updatedAtMs: number;
}

export interface PushSubscriptionDeviceIndex {
  userId: string;
}

export interface TurnNotificationTarget {
  userId: string;
  deviceId: string;
}

export interface TurnNotificationOutbox {
  id: string;
  matchId: string;
  turn: number;
  targets: TurnNotificationTarget[];
  status: "pending" | "delivered";
  attempts: number;
  nextAttemptAtMs: number;
  createdAtMs: number;
  deliveredAtMs?: number;
}
