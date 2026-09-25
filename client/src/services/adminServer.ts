import { getAdminApiBaseUrl } from "./nakama";

interface AdminApiResponse {
  ok?: boolean;
  error?: string;
  details?: string;
  logs?: string;
  output?: string;
}

export class AdminServerApiError extends Error {
  constructor(
    message: string,
    readonly details?: string,
  ) {
    super(message);
    this.name = "AdminServerApiError";
  }
}

async function postAdminRequest(
  path: string,
  payload: Record<string, unknown>,
): Promise<AdminApiResponse> {
  let response: Response;
  try {
    response = await fetch(`${getAdminApiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    throw new AdminServerApiError("Admin API is unreachable.");
  }

  let rawResult: unknown;
  try {
    rawResult = await response.json();
  } catch {
    throw new AdminServerApiError(`Admin API returned HTTP ${response.status}.`);
  }
  if (!rawResult || typeof rawResult !== "object") {
    throw new AdminServerApiError(`Admin API returned HTTP ${response.status}.`);
  }
  const result = rawResult as AdminApiResponse;
  if (!response.ok || result.ok !== true) {
    throw new AdminServerApiError(
      result.error ?? `Admin API returned HTTP ${response.status}.`,
      result.details,
    );
  }
  return result;
}

export async function requestAdminLogs(
  password: string,
  errorOnly: boolean,
): Promise<string> {
  const result = await postAdminRequest("/admin/logs", { password, errorOnly });
  return result.logs ?? "";
}

export async function requestServerUpdate(password: string): Promise<string> {
  const result = await postAdminRequest("/admin/update", { password });
  return result.output ?? "";
}
