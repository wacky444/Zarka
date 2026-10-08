/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

import {
  RANKED_ASSIGNMENT_COLLECTION,
  RANKED_QUEUE_ENROLLMENT_COLLECTION,
  RANKED_QUEUE_LEASE_COLLECTION,
  RANKED_QUEUE_TICKET_COLLECTION,
  SERVER_USER_ID
} from "../constants";
import {
  RANKED_MATCH_METADATA_KEY,
  type GetRankedQueueStatusPayload,
  type RankedQueueAssignmentStatus,
  type RankedQueueMode
} from "@shared";
import {
  getRankedBotFillCount,
  getRankedEloSearchRange,
  getRankedQueuePolicy,
  RANKED_MATCH_TOTAL_SEATS
} from "../matchmaking/policy";
import { isRankedMatchmakingEnabled } from "../matchmaking/featureFlags";
import { createRankedMatch } from "./rankedMatchFactory";
import {
  countRankedDailyPresence,
  hasRecentRankedPresence
} from "./rankedPresence";
import { createNakamaWrapper } from "./nakamaWrapper";
import { StorageService } from "./storageService";

type RankedQueueEnrollment = {
  userId: string;
  desiredSlots: number;
  updatedAtMs: number;
};

type RankedQueueTicketStatus = "queued" | "reserved" | "assigned";

type RankedQueueTicket = {
  userId: string;
  slotIndex: number;
  createdAtMs: number;
  elo: number;
  status: RankedQueueTicketStatus;
  assignmentId?: string;
  matchId?: string;
};

type RankedAssignmentState = "creating" | "active" | "failed" | "completed";

type RankedAssignment = {
  assignmentId: string;
  state: RankedAssignmentState;
  ticketKeys: string[];
  humanIds: string[];
  botCount: number;
  queueMode: RankedQueueMode;
  matchId: string;
  createdAtMs: number;
  reservationExpiresAtMs: number;
  attempts: number;
  expiresAtMs?: number;
};

type StoredObject<T> = {
  key: string;
  value: T;
  version: string;
};

type AccountEligibility = {
  eligible: boolean;
  desiredSlots: number;
  elo: number;
};

const COORDINATOR_LEASE_KEY = "coordinator";
const COORDINATOR_LEASE_MS = 30_000;
const RESERVATION_LEASE_MS = 60_000;
const FINISHED_RECORD_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ASSIGNMENTS_PER_TICK = 4;
const RANKED_MATCH_PREFIX = "ranked_";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readObject<T>(
  nk: nkruntime.Nakama,
  collection: string,
  key: string
): StoredObject<T> | null {
  const reads = nk.storageRead([
    { collection, key, userId: SERVER_USER_ID }
  ]);
  const object = reads?.[0];
  return object && object.value
    ? {
        key: object.key,
        value: object.value as T,
        version: object.version
      }
    : null;
}

function writeObject<T extends Record<string, unknown>>(
  nk: nkruntime.Nakama,
  collection: string,
  key: string,
  value: T,
  version?: string
): void {
  const request: nkruntime.StorageWriteRequest = {
    collection,
    key,
    userId: SERVER_USER_ID,
    value,
    permissionRead: 0,
    permissionWrite: 0
  };
  if (version !== undefined && version !== "") {
    request.version = version;
  }
  nk.storageWrite([request]);
}

function listObjects<T>(
  nk: nkruntime.Nakama,
  collection: string
): Array<StoredObject<T>> {
  const result: Array<StoredObject<T>> = [];
  let cursor = "";
  let hasMore = true;
  while (hasMore) {
    const page = nk.storageList(SERVER_USER_ID, collection, 100, cursor);
    for (const object of page?.objects ?? []) {
      if (object?.key && object.value) {
        result.push({
          key: object.key,
          value: object.value as T,
          version: object.version
        });
      }
    }
    cursor = page?.cursor ?? "";
    hasMore = cursor.length > 0;
  }
  return result;
}

function deleteObject(
  nk: nkruntime.Nakama,
  collection: string,
  key: string
): void {
  nk.storageDelete([{ collection, key, userId: SERVER_USER_ID }]);
}

function readAccountEligibility(
  nk: nkruntime.Nakama,
  userId: string,
  nowMs = Date.now()
): AccountEligibility {
  const users = nk.usersGetId([userId]);
  const user = users && users.length > 0 ? users[0] : undefined;
  const metadata = asRecord(
    (user as unknown as { metadata?: unknown } | undefined)?.metadata
  );
  const zarka = asRecord(metadata?.zarka);
  const stats = asRecord(zarka?.stats);
  const slots = zarka?.rankedMatchSlots;
  const desiredSlots =
    typeof slots === "number" && Number.isInteger(slots) && slots >= 0 && slots <= 3
      ? slots
      : 0;
  const elo = stats?.elo;
  return {
    eligible:
      !!user &&
      zarka?.tutorialCompleted === true &&
      (user.online || hasRecentRankedPresence(nk, userId, nowMs)),
    desiredSlots,
    elo:
      typeof elo === "number" && Number.isInteger(elo) && elo >= 0
        ? elo
        : 1000
  };
}

function readTicket(
  nk: nkruntime.Nakama,
  ticketKey: string
): StoredObject<RankedQueueTicket> | null {
  return readObject<RankedQueueTicket>(
    nk,
    RANKED_QUEUE_TICKET_COLLECTION,
    ticketKey
  );
}

function updateTicket(
  nk: nkruntime.Nakama,
  current: StoredObject<RankedQueueTicket>,
  value: RankedQueueTicket
): StoredObject<RankedQueueTicket> {
  writeObject(
    nk,
    RANKED_QUEUE_TICKET_COLLECTION,
    current.key,
    value,
    current.version
  );
  return (
    readTicket(nk, current.key) ?? {
      ...current,
      value
    }
  );
}

function readAssignment(
  nk: nkruntime.Nakama,
  assignmentId: string
): StoredObject<RankedAssignment> | null {
  return readObject<RankedAssignment>(
    nk,
    RANKED_ASSIGNMENT_COLLECTION,
    assignmentId
  );
}

function updateAssignment(
  nk: nkruntime.Nakama,
  current: StoredObject<RankedAssignment>,
  value: RankedAssignment
): void {
  writeObject(
    nk,
    RANKED_ASSIGNMENT_COLLECTION,
    current.key,
    value,
    current.version
  );
}

export function createRankedSlotPreferenceWrite(
  nk: nkruntime.Nakama,
  userId: string,
  desiredSlots: number,
  nowMs = Date.now()
): nkruntime.StorageWriteRequest {
  if (
    !Number.isInteger(desiredSlots) ||
    desiredSlots < 0 ||
    desiredSlots > 3
  ) {
    throw new Error("invalid_ranked_match_slots");
  }

  const current = readObject<RankedQueueEnrollment>(
    nk,
    RANKED_QUEUE_ENROLLMENT_COLLECTION,
    userId
  );
  return {
    collection: RANKED_QUEUE_ENROLLMENT_COLLECTION,
    key: userId,
    userId: SERVER_USER_ID,
    value: { userId, desiredSlots, updatedAtMs: nowMs },
    permissionRead: 0,
    permissionWrite: 0,
    ...(current ? { version: current.version } : {})
  };
}

export function recordRankedSlotPreference(
  nk: nkruntime.Nakama,
  userId: string,
  desiredSlots: number,
  nowMs = Date.now()
): void {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      nk.storageWrite([
        createRankedSlotPreferenceWrite(nk, userId, desiredSlots, nowMs)
      ]);
      return;
    } catch (error) {
      if (attempt === 4) {
        throw error;
      }
    }
  }
}

function acquireCoordinatorLease(
  nk: nkruntime.Nakama,
  nowMs: number
): string | null {
  const current = readObject<{ ownerId: string; expiresAtMs: number }>(
    nk,
    RANKED_QUEUE_LEASE_COLLECTION,
    COORDINATOR_LEASE_KEY
  );
  if (current && current.value.expiresAtMs > nowMs) {
    return null;
  }
  const ownerId = nk.uuidv4();
  try {
    writeObject(
      nk,
      RANKED_QUEUE_LEASE_COLLECTION,
      COORDINATOR_LEASE_KEY,
      { ownerId, expiresAtMs: nowMs + COORDINATOR_LEASE_MS },
      current ? current.version : "*"
    );
    return ownerId;
  } catch {
    return null;
  }
}

function releaseCoordinatorLease(
  nk: nkruntime.Nakama,
  ownerId: string,
  nowMs: number
): void {
  const current = readObject<{ ownerId: string; expiresAtMs: number }>(
    nk,
    RANKED_QUEUE_LEASE_COLLECTION,
    COORDINATOR_LEASE_KEY
  );
  if (!current || current.value.ownerId !== ownerId) {
    return;
  }
  try {
    writeObject(
      nk,
      RANKED_QUEUE_LEASE_COLLECTION,
      COORDINATOR_LEASE_KEY,
      { ownerId: "", expiresAtMs: nowMs },
      current.version
    );
  } catch {
    // The lease expires automatically if its owner cannot release it.
  }
}

function ticketKey(userId: string, slotIndex: number): string {
  return `${userId}:${slotIndex}`;
}

function ticketsForUser(
  nk: nkruntime.Nakama,
  userId: string
): Array<StoredObject<RankedQueueTicket>> {
  const tickets: Array<StoredObject<RankedQueueTicket>> = [];
  for (let slotIndex = 1; slotIndex <= 3; slotIndex += 1) {
    const ticket = readTicket(nk, ticketKey(userId, slotIndex));
    if (ticket) tickets.push(ticket);
  }
  return tickets;
}

function resetAssignmentTickets(
  nk: nkruntime.Nakama,
  assignment: RankedAssignment,
  excludeUserId?: string
): void {
  for (const key of assignment.ticketKeys) {
    const current = readTicket(nk, key);
    if (
      !current ||
      current.value.status !== "reserved" ||
      current.value.assignmentId !== assignment.assignmentId
    ) {
      continue;
    }
    if (current.value.userId === excludeUserId) {
      deleteObject(nk, RANKED_QUEUE_TICKET_COLLECTION, current.key);
      continue;
    }
    const { assignmentId: _assignmentId, matchId: _matchId, ...ticket } =
      current.value;
    updateTicket(nk, current, { ...ticket, status: "queued" });
  }
}

function failCreatingAssignment(
  nk: nkruntime.Nakama,
  assignment: StoredObject<RankedAssignment>,
  nowMs: number,
  excludeUserId?: string
): void {
  resetAssignmentTickets(nk, assignment.value, excludeUserId);
  updateAssignment(nk, assignment, {
    ...assignment.value,
    state: "failed",
    expiresAtMs: nowMs + FINISHED_RECORD_RETENTION_MS
  });
}

function tryCreateReservedAssignment(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  storedAssignment: StoredObject<RankedAssignment>,
  nowMs: number,
  ctx?: nkruntime.Context
): boolean {
  const currentAssignment = readAssignment(nk, storedAssignment.key);
  if (!currentAssignment || currentAssignment.value.state !== "creating") {
    return false;
  }

  const selectedTickets = currentAssignment.value.ticketKeys.map((key) =>
    readTicket(nk, key)
  );
  if (
    selectedTickets.some(
      (ticket) =>
        !ticket ||
        ticket.value.status !== "reserved" ||
        ticket.value.assignmentId !== currentAssignment.value.assignmentId
    )
  ) {
    failCreatingAssignment(nk, currentAssignment, nowMs);
    return false;
  }

  for (const userId of currentAssignment.value.humanIds) {
    const account = readAccountEligibility(nk, userId, nowMs);
    const occupiedTickets = ticketsForUser(nk, userId).filter(
      (ticket) =>
        ticket.value.status === "reserved" || ticket.value.status === "assigned"
    );
    if (
      !account.eligible ||
      account.desiredSlots < 1 ||
      occupiedTickets.length > account.desiredSlots
    ) {
      failCreatingAssignment(
        nk,
        currentAssignment,
        nowMs,
        account.desiredSlots === 0 ? userId : undefined
      );
      return false;
    }
  }

  try {
    const match = createRankedMatch(
      nk,
      logger,
      {
        assignmentId: currentAssignment.value.assignmentId,
        humanIds: currentAssignment.value.humanIds,
        botCount: currentAssignment.value.botCount,
        queueMode: currentAssignment.value.queueMode
      },
      nowMs,
      ctx
    );
    const latestAssignment = readAssignment(nk, currentAssignment.key);
    if (latestAssignment) {
      updateAssignment(nk, latestAssignment, {
        ...latestAssignment.value,
        state: "active",
        reservationExpiresAtMs: nowMs,
        matchId: match.match_id
      });
    }
    for (const key of currentAssignment.value.ticketKeys) {
      const ticket = readTicket(nk, key);
      if (ticket?.value.assignmentId === currentAssignment.value.assignmentId) {
        updateTicket(nk, ticket, {
          ...ticket.value,
          status: "assigned",
          matchId: match.match_id
        });
      }
    }
    const oldestTicketAtMs = Math.min(
      ...selectedTickets.map((ticket) => ticket?.value.createdAtMs ?? nowMs)
    );
    logger.info(
      "ranked_match_started %s",
      JSON.stringify({
        event: "ranked_match_started",
        assignment_id: currentAssignment.value.assignmentId,
        match_id: match.match_id,
        queue_wait_ms: Math.max(0, nowMs - oldestTicketAtMs),
        population_mode: currentAssignment.value.queueMode,
        human_count: currentAssignment.value.humanIds.length,
        bot_count: currentAssignment.value.botCount
      })
    );
    return true;
  } catch (error) {
    logger.error(
      "ranked assignment %s creation failed: %s",
      currentAssignment.value.assignmentId,
      (error && (error as Error).message) || String(error)
    );
    const latestAssignment = readAssignment(nk, currentAssignment.key);
    if (!latestAssignment) return false;
    const attempts = latestAssignment.value.attempts + 1;
    if (attempts >= 3) {
      failCreatingAssignment(nk, latestAssignment, nowMs);
    } else {
      updateAssignment(nk, latestAssignment, {
        ...latestAssignment.value,
        attempts,
        reservationExpiresAtMs: nowMs + RESERVATION_LEASE_MS
      });
    }
    return false;
  }
}

function recoverAssignments(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs: number,
  ctx?: nkruntime.Context
): void {
  const storage = new StorageService(createNakamaWrapper(nk));
  for (const stored of listObjects<RankedAssignment>(
    nk,
    RANKED_ASSIGNMENT_COLLECTION
  )) {
    const assignment = stored.value;
    if (assignment.state === "completed" || assignment.state === "failed") {
      if ((assignment.expiresAtMs ?? 0) <= nowMs) {
        deleteObject(nk, RANKED_ASSIGNMENT_COLLECTION, stored.key);
      }
      continue;
    }

    const matchRead = storage.getMatch(assignment.matchId);
    const matchAssignment =
      matchRead?.match.metadata?.[RANKED_MATCH_METADATA_KEY]?.assignmentId;
    if (matchRead && matchAssignment === assignment.assignmentId) {
      if (assignment.state === "creating") {
        updateAssignment(nk, stored, {
          ...assignment,
          state: "active",
          reservationExpiresAtMs: nowMs
        });
        for (const key of assignment.ticketKeys) {
          const current = readTicket(nk, key);
          if (current?.value.assignmentId === assignment.assignmentId) {
            updateTicket(nk, current, {
              ...current.value,
              status: "assigned",
              matchId: assignment.matchId
            });
          }
        }
      } else if (matchRead.match.removed !== 0) {
        for (const key of assignment.ticketKeys) {
          deleteObject(nk, RANKED_QUEUE_TICKET_COLLECTION, key);
        }
        updateAssignment(nk, stored, {
          ...assignment,
          state: "completed",
          expiresAtMs: nowMs + FINISHED_RECORD_RETENTION_MS
        });
      }
      continue;
    }

    if (assignment.state === "creating" && assignment.reservationExpiresAtMs <= nowMs) {
      logger.warn(
        "ranked_assignment_recovery %s",
        JSON.stringify({
          event: "ranked_assignment_recovery",
          assignment_id: assignment.assignmentId,
          match_id: assignment.matchId,
          attempts: assignment.attempts + 1
        })
      );
      tryCreateReservedAssignment(nk, logger, stored, nowMs, ctx);
    } else if (assignment.state === "active") {
      for (const key of assignment.ticketKeys) {
        deleteObject(nk, RANKED_QUEUE_TICKET_COLLECTION, key);
      }
      updateAssignment(nk, stored, {
        ...assignment,
        state: "completed",
        expiresAtMs: nowMs + FINISHED_RECORD_RETENTION_MS
      });
    }
  }
}

function synchronizeEnrollmentTickets(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs: number,
  enrollments: Array<StoredObject<RankedQueueEnrollment>>
): void {
  for (const storedEnrollment of enrollments) {
    const userId = storedEnrollment.value.userId;
    const account = readAccountEligibility(nk, userId, nowMs);
    const desiredSlots = account.eligible ? account.desiredSlots : 0;
    let currentTickets = ticketsForUser(nk, userId);
    let cancelledTickets = 0;
    if (account.eligible) {
      currentTickets = currentTickets.map((ticket) =>
        ticket.value.status === "queued" && ticket.value.elo !== account.elo
          ? updateTicket(nk, ticket, { ...ticket.value, elo: account.elo })
          : ticket
      );
    }
    const occupied = () => currentTickets.length;

    let overage = Math.max(0, occupied() - desiredSlots);
    const queuedNewestFirst = currentTickets
      .filter((ticket) => ticket.value.status === "queued")
      .sort((a, b) => b.value.createdAtMs - a.value.createdAtMs);
    for (const queued of queuedNewestFirst) {
      if (overage <= 0) break;
      deleteObject(nk, RANKED_QUEUE_TICKET_COLLECTION, queued.key);
      cancelledTickets += 1;
      currentTickets = currentTickets.filter((ticket) => ticket.key !== queued.key);
      overage -= 1;
    }

    if (overage > 0) {
      const reservedNewestFirst = currentTickets
        .filter((ticket) => ticket.value.status === "reserved")
        .sort((a, b) => b.value.createdAtMs - a.value.createdAtMs);
      for (const reserved of reservedNewestFirst) {
        if (overage <= 0) break;
        const assignmentId = reserved.value.assignmentId;
        const assignment = assignmentId
          ? readAssignment(nk, assignmentId)
          : null;
        if (!assignment || assignment.value.state !== "creating") {
          continue;
        }
        failCreatingAssignment(
          nk,
          assignment,
          nowMs,
          desiredSlots === 0 ? userId : undefined
        );
        currentTickets = ticketsForUser(nk, userId);
        if (!currentTickets.some((ticket) => ticket.key === reserved.key)) {
          cancelledTickets += 1;
        }
        overage = Math.max(0, occupied() - desiredSlots);
      }
      const queuedAfterReservationCancel = currentTickets
        .filter((ticket) => ticket.value.status === "queued")
        .sort((a, b) => b.value.createdAtMs - a.value.createdAtMs);
      for (const queued of queuedAfterReservationCancel) {
        if (overage <= 0) break;
        deleteObject(nk, RANKED_QUEUE_TICKET_COLLECTION, queued.key);
        cancelledTickets += 1;
        currentTickets = currentTickets.filter((ticket) => ticket.key !== queued.key);
        overage -= 1;
      }
    }

    if (!account.eligible || desiredSlots === 0) {
      currentTickets = ticketsForUser(nk, userId);
    }
    if (cancelledTickets > 0) {
      logger.info(
        "ranked_queue_tickets_cancelled %s",
        JSON.stringify({
          event: "ranked_queue_tickets_cancelled",
          count: cancelledTickets,
          desired_slots: desiredSlots
        })
      );
    }

    const occupiedSlots = new Set(currentTickets.map((ticket) => ticket.key));
    while (account.eligible && occupiedSlots.size < desiredSlots) {
      let slotIndex = 1;
      while (slotIndex <= 3 && occupiedSlots.has(ticketKey(userId, slotIndex))) {
        slotIndex += 1;
      }
      if (slotIndex > 3) break;
      const key = ticketKey(userId, slotIndex);
      const value: RankedQueueTicket = {
        userId,
        slotIndex,
        createdAtMs: nowMs,
        elo: account.elo,
        status: "queued"
      };
      try {
        writeObject(nk, RANKED_QUEUE_TICKET_COLLECTION, key, value, "*");
        occupiedSlots.add(key);
      } catch (error) {
        logger.warn(
          "ranked ticket creation failed for %s slot %d: %s",
          userId,
          slotIndex,
          (error && (error as Error).message) || String(error)
        );
        break;
      }
    }
  }
}

function reserveAssignment(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs: number,
  mode: RankedQueueMode,
  selected: Array<StoredObject<RankedQueueTicket>>,
  botCount: number
): StoredObject<RankedAssignment> | null {
  const assignmentId = nk.uuidv4();
  const matchId = `${RANKED_MATCH_PREFIX}${assignmentId}`;
  const assignment: RankedAssignment = {
    assignmentId,
    state: "creating",
    ticketKeys: selected.map((ticket) => ticket.key),
    humanIds: selected.map((ticket) => ticket.value.userId),
    botCount,
    queueMode: mode,
    matchId,
    createdAtMs: nowMs,
    reservationExpiresAtMs: nowMs + RESERVATION_LEASE_MS,
    attempts: 0
  };
  const requests: nkruntime.StorageWriteRequest[] = [
    {
      collection: RANKED_ASSIGNMENT_COLLECTION,
      key: assignmentId,
      userId: SERVER_USER_ID,
      value: assignment,
      permissionRead: 0,
      permissionWrite: 0,
      version: "*"
    },
    ...selected.map((ticket) => ({
      collection: RANKED_QUEUE_TICKET_COLLECTION,
      key: ticket.key,
      userId: SERVER_USER_ID,
      value: {
        ...ticket.value,
        status: "reserved" as const,
        assignmentId
      },
      permissionRead: 0 as const,
      permissionWrite: 0 as const,
      version: ticket.version
    }))
  ];
  try {
    nk.storageWrite(requests);
    const stored = readAssignment(nk, assignmentId);
    return stored ?? { key: assignmentId, value: assignment, version: "" };
  } catch (error) {
    logger.debug(
      "ranked reservation conflict for %s: %s",
      assignmentId,
      (error && (error as Error).message) || String(error)
    );
    return null;
  }
}

function createAssignments(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs: number,
  ctx?: nkruntime.Context
): void {
  const dailyUsers = countRankedDailyPresence(nk, nowMs);
  for (let count = 0; count < MAX_ASSIGNMENTS_PER_TICK; count += 1) {
    const queued = listObjects<RankedQueueTicket>(
      nk,
      RANKED_QUEUE_TICKET_COLLECTION
    )
      .filter((ticket) => ticket.value.status === "queued")
      .sort((a, b) => a.value.createdAtMs - b.value.createdAtMs);
    const oldest = queued[0];
    if (!oldest) return;
    const waitSeconds = Math.max(0, (nowMs - oldest.value.createdAtMs) / 1000);
    const policy = getRankedQueuePolicy(dailyUsers, waitSeconds);
    if (!policy) return;

    const range = getRankedEloSearchRange(waitSeconds);
    const selectedByUser = new Map<string, StoredObject<RankedQueueTicket>>();
    for (const ticket of queued) {
      if (selectedByUser.has(ticket.value.userId)) continue;
      if (Math.abs(ticket.value.elo - oldest.value.elo) <= range) {
        selectedByUser.set(ticket.value.userId, ticket);
      }
      if (selectedByUser.size >= 16) break;
    }
    if (selectedByUser.size < policy.requiredHumans) return;

    const selected = Array.from(selectedByUser.values());
    const queueMode =
      selected.length === RANKED_MATCH_TOTAL_SEATS
        ? "high_population"
        : policy.mode;
    const botCount =
      queueMode === "low_population"
        ? getRankedBotFillCount(dailyUsers, selected.length, waitSeconds) ?? 0
        : 0;
    const assignment = reserveAssignment(
      nk,
      logger,
      nowMs,
      queueMode,
      selected,
      botCount
    );
    if (!assignment) return;
    tryCreateReservedAssignment(nk, logger, assignment, nowMs, ctx);
  }
}

export function getRankedQueueStatus(
  nk: nkruntime.Nakama,
  userId: string
): GetRankedQueueStatusPayload {
  const account = readAccountEligibility(nk, userId, Date.now());
  const tickets = ticketsForUser(nk, userId);
  const storage = new StorageService(createNakamaWrapper(nk));
  const assignedMatches: RankedQueueAssignmentStatus[] = [];

  const seenAssignmentIds = new Set<string>();

  for (const ticket of tickets) {
    const assignmentId = ticket.value.assignmentId;
    if (!assignmentId || seenAssignmentIds.has(assignmentId)) continue;
    seenAssignmentIds.add(assignmentId);

    const stored = readAssignment(nk, assignmentId);
    if (!stored) continue;
    const assignment = stored.value;
    if (!assignment.humanIds.includes(userId)) continue;
    if (assignment.state === "creating") {
      assignedMatches.push({
        assignment_id: assignment.assignmentId,
        match_id: assignment.matchId,
        status: "starting"
      });
      continue;
    }
    if (assignment.state !== "active") continue;
    const match = storage.getMatch(assignment.matchId)?.match;
    if (!match || match.removed !== 0) continue;
    assignedMatches.push({
      assignment_id: assignment.assignmentId,
      match_id: assignment.matchId,
      status: "running",
      current_turn: match.current_turn
    });
  }
  assignedMatches.sort((a, b) => a.assignment_id.localeCompare(b.assignment_id));

  return {
    ok: true,
    desired_slots: account.desiredSlots,
    queued_tickets: tickets.filter((ticket) => ticket.value.status === "queued").length,
    reserved_tickets: tickets.filter((ticket) => ticket.value.status === "reserved").length,
    assigned_matches: assignedMatches
  };
}

export function processRankedQueue(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  nowMs = Date.now(),
  ctx?: nkruntime.Context
): void {
  if (!isRankedMatchmakingEnabled(ctx)) return;
  const ownerId = acquireCoordinatorLease(nk, nowMs);
  if (!ownerId) return;
  try {
    recoverAssignments(nk, logger, nowMs, ctx);
    synchronizeEnrollmentTickets(
      nk,
      logger,
      nowMs,
      listObjects<RankedQueueEnrollment>(nk, RANKED_QUEUE_ENROLLMENT_COLLECTION)
    );
    createAssignments(nk, logger, nowMs, ctx);
  } catch (error) {
    logger.error(
      "ranked queue processing failed: %s",
      (error && (error as Error).message) || String(error)
    );
  } finally {
    releaseCoordinatorLease(nk, ownerId, nowMs);
  }
}
