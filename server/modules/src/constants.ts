import { NAKAMA_SYSTEM_USER_ID } from "@shared";

export const MATCH_COLLECTION = "async_turn_matches";
export const TURN_COLLECTION = "async_turn_turns";
export const REPLAY_COLLECTION = "async_turn_replays";
export const CHAT_COLLECTION = "async_turn_chat";
export const MATCH_REPORT_COLLECTION = "async_turn_reports";
export const PUSH_SUBSCRIPTION_COLLECTION = "web_push_subscriptions";
export const PUSH_SUBSCRIPTION_DEVICE_INDEX_COLLECTION =
  "web_push_subscription_device_index";
export const PUSH_NOTIFICATION_OUTBOX_COLLECTION = "web_push_notification_outbox";
export const RANKED_DAILY_PRESENCE_COLLECTION = "ranked_daily_presence";
export const RANKED_QUEUE_ENROLLMENT_COLLECTION = "ranked_queue_enrollments";
export const RANKED_QUEUE_TICKET_COLLECTION = "ranked_queue_tickets";
export const RANKED_ASSIGNMENT_COLLECTION = "ranked_match_assignments";
export const RANKED_QUEUE_LEASE_COLLECTION = "ranked_queue_leases";
export const RANKED_ELO_SETTLEMENT_COLLECTION = "ranked_elo_settlements";
export const RANKED_MATCH_SETTLEMENT_COLLECTION = "ranked_match_settlements";
export const RANKED_RATING_STATE_COLLECTION = "ranked_rating_state";
export const ACCOUNT_METADATA_LOCK_COLLECTION = "ranked_rating_locks";
export const MATCH_KEY_PREFIX = "match_";
export const CHAT_KEY_PREFIX = "chat_";
export const MATCH_REPORT_KEY_PREFIX = "report_";
export const SERVER_USER_ID = NAKAMA_SYSTEM_USER_ID;

export const MAX_MATCH_NAME_LENGTH = 64;
export const DEFAULT_MATCH_NAME = "Untitled Match";
