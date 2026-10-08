import type { GetRankedQueueStatusPayload } from "@shared";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseRankedQueueStatusResponse(
  value: unknown
): GetRankedQueueStatusPayload {
  let payload = value;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return { ok: false, error: "invalid_response" };
    }
  }
  const record = asRecord(payload);
  if (!record) {
    return { ok: false, error: "invalid_response" };
  }
  if (record.ok !== true) {
    return {
      ok: false,
      error: typeof record.error === "string" ? record.error : "request_failed"
    };
  }

  const desiredSlots = record.desired_slots;
  const queuedTickets = record.queued_tickets;
  const reservedTickets = record.reserved_tickets;
  const assignments = record.assigned_matches;
  if (
    !isNonNegativeInteger(desiredSlots) ||
    !isNonNegativeInteger(queuedTickets) ||
    !isNonNegativeInteger(reservedTickets) ||
    !Array.isArray(assignments)
  ) {
    return { ok: false, error: "invalid_response" };
  }

  const assignedMatches: NonNullable<
    GetRankedQueueStatusPayload["assigned_matches"]
  > = [];
  for (const entry of assignments) {
    const assignment = asRecord(entry);
    if (
      !assignment ||
      typeof assignment.assignment_id !== "string" ||
      typeof assignment.match_id !== "string" ||
      (assignment.status !== "starting" && assignment.status !== "running") ||
      (assignment.current_turn !== undefined &&
        !isNonNegativeInteger(assignment.current_turn))
    ) {
      return { ok: false, error: "invalid_response" };
    }
    assignedMatches.push({
      assignment_id: assignment.assignment_id,
      match_id: assignment.match_id,
      status: assignment.status,
      ...(typeof assignment.current_turn === "number"
        ? { current_turn: assignment.current_turn }
        : {})
    });
  }

  return {
    ok: true,
    desired_slots: desiredSlots,
    queued_tickets: queuedTickets,
    reserved_tickets: reservedTickets,
    assigned_matches: assignedMatches
  };
}
