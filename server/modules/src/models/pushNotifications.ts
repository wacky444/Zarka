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
  locale?: "en" | "es";
}

export interface PushNotificationOutboxBase {
  id: string;
  matchId: string;
  targets: TurnNotificationTarget[];
  status: "pending" | "delivered";
  attempts: number;
  nextAttemptAtMs: number;
  createdAtMs: number;
  deliveredAtMs?: number;
}

export interface TurnNotificationOutbox extends PushNotificationOutboxBase {
  event: "turn_advanced";
  turn: number;
}

export interface RankedMatchStartedOutbox extends PushNotificationOutboxBase {
  event: "ranked_match_started";
}

export type PushNotificationOutbox =
  | TurnNotificationOutbox
  | RankedMatchStartedOutbox;
