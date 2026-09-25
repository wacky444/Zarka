import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

const port = Number(process.env.PORT ?? 8080);
const repositoryDirectory = process.env.REPOSITORY_DIRECTORY ?? "/workspace";
const serverDirectory = path.join(repositoryDirectory, "server");
const modulesDirectory = path.join(serverDirectory, "modules");
const composeFile = path.join(serverDirectory, "docker-compose.yml");
const localConfiguration =
  process.env.NAKAMA_LOCAL_CONFIG ?? "/run/nakama/local.yml";
const maxBodyBytes = 16 * 1024;
const maxCommandOutputBytes = 512 * 1024;
const allowedOrigins = new Set(
  (process.env.ADMIN_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
);
const failedAttemptsByAddress = new Map();
let updateInProgress = false;

class HttpError extends Error {
  constructor(statusCode, code, details) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function setResponseHeaders(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  const origin = request.headers.origin;
  if (typeof origin === "string" && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Vary", "Origin");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function stripYamlComment(value) {
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote === '"' && character === "\\") {
      index += 1;
      continue;
    }
    if (quote === "'" && character === "'" && value[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (quote && character === quote) {
      quote = "";
      continue;
    }
    if (!quote && (character === '"' || character === "'")) {
      quote = character;
      continue;
    }
    if (!quote && character === "#" && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function parseYamlScalar(rawValue) {
  const value = stripYamlComment(rawValue);
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return "";
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

async function readConsolePassword() {
  const contents = await readFile(localConfiguration, "utf8");
  let insideConsoleSection = false;
  for (const line of contents.split(/\r?\n/)) {
    if (/^console\s*:\s*(?:#.*)?$/.test(line)) {
      insideConsoleSection = true;
      continue;
    }
    if (!insideConsoleSection) {
      continue;
    }
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) {
      continue;
    }
    if (!/^\s/.test(line)) {
      break;
    }
    const passwordLine = line.match(/^\s+password\s*:\s*(.*)$/);
    if (passwordLine) {
      const password = parseYamlScalar(passwordLine[1]);
      if (password.length > 0) {
        return password;
      }
      break;
    }
  }
  throw new Error("console.password is missing from local.yml");
}

function passwordMatches(suppliedPassword, expectedPassword) {
  if (typeof suppliedPassword !== "string") {
    return false;
  }
  const supplied = Buffer.from(suppliedPassword, "utf8");
  const expected = Buffer.from(expectedPassword, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function getClientAddress(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress ?? "unknown";
}

function getAttemptRecord(address) {
  const now = Date.now();
  const existing = failedAttemptsByAddress.get(address);
  if (!existing || existing.windowEndsAt <= now) {
    const fresh = { attempts: 0, windowEndsAt: now + 15 * 60 * 1000 };
    failedAttemptsByAddress.set(address, fresh);
    return fresh;
  }
  return existing;
}

function recordFailedAttempt(address) {
  const attempt = getAttemptRecord(address);
  attempt.attempts += 1;
  return attempt.attempts >= 5;
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (Buffer.byteLength(body, "utf8") > maxBodyBytes) {
      throw new HttpError(413, "request_too_large");
    }
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_json_object");
    }
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function runCommand(command, args, options = {}) {
  const { cwd, timeoutMs = 30_000 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimeout;
    const appendOutput = (chunk) => {
      output += chunk.toString();
      if (output.length > maxCommandOutputBytes) {
        output = output.slice(-maxCommandOutputBytes);
      }
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), 5000);
      forceKillTimeout.unref();
    }, timeoutMs);
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);
      reject(new Error(`Unable to start ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      clearTimeout(forceKillTimeout);
      if (timedOut) {
        reject(new Error(`${command} timed out`));
      } else {
        resolve({ code: code ?? 1, output });
      }
    });
  });
}

async function requireSuccessfulCommand(label, command, args, cwd, timeoutMs) {
  let result;
  try {
    result = await runCommand(command, args, { cwd, timeoutMs });
  } catch (error) {
    throw new HttpError(500, `${label}_failed`, error.message);
  }
  if (result.code !== 0) {
    throw new HttpError(
      500,
      `${label}_failed`,
      result.output.slice(-16_000),
    );
  }
  return result.output;
}

async function getLogs(errorOnly) {
  let result;
  try {
    result = await runCommand(
      "docker",
      ["logs", "--tail", "500", "--timestamps", "nakama"],
      { cwd: serverDirectory, timeoutMs: 15_000 },
    );
  } catch (error) {
    throw new HttpError(502, "nakama_logs_unavailable", error.message);
  }
  if (result.code !== 0) {
    throw new HttpError(502, "nakama_logs_unavailable", result.output.slice(-4000));
  }
  const lines = result.output.split(/\r?\n/).filter((line) => line.length > 0);
  const visibleLines = errorOnly
    ? lines.filter((line) => /\b(error|fatal|panic|exception)\b/i.test(line))
    : lines;
  return visibleLines.join("\n");
}

async function updateServer() {
  if (updateInProgress) {
    throw new HttpError(409, "update_already_in_progress");
  }
  updateInProgress = true;
  const output = [];
  try {
    const inspectedMounts = await requireSuccessfulCommand(
      "docker_inspect",
      "docker",
      ["inspect", "--format", "{{json .Mounts}}", "zarka-admin-api"],
      serverDirectory,
      10_000,
    );
    let mounts;
    try {
      mounts = JSON.parse(inspectedMounts);
    } catch {
      throw new HttpError(500, "host_repository_path_unavailable");
    }
    const repositoryMount = Array.isArray(mounts)
      ? mounts.find(
          (mount) =>
            mount &&
            typeof mount === "object" &&
            mount.Destination === "/workspace" &&
            typeof mount.Source === "string",
        )
      : undefined;
    const hostRepositoryPath = repositoryMount?.Source;
    if (
      typeof hostRepositoryPath !== "string" ||
      !path.isAbsolute(hostRepositoryPath)
    ) {
      throw new HttpError(500, "host_repository_path_unavailable");
    }
    const hostRepositoryDirectory = path.resolve(hostRepositoryPath);
    if (hostRepositoryDirectory === path.parse(hostRepositoryDirectory).root) {
      throw new HttpError(500, "host_repository_path_unavailable");
    }
    const status = await requireSuccessfulCommand(
      "git_status",
      "git",
      ["status", "--porcelain"],
      repositoryDirectory,
      10_000,
    );
    if (status.trim().length > 0) {
      throw new HttpError(409, "repository_has_local_changes");
    }
    const branch = await requireSuccessfulCommand(
      "git_branch",
      "git",
      ["branch", "--show-current"],
      repositoryDirectory,
      10_000,
    );
    if (branch.trim() !== "main") {
      throw new HttpError(409, "repository_not_on_main");
    }
    output.push(
      await requireSuccessfulCommand(
        "git_pull",
        "git",
        ["pull", "--ff-only"],
        repositoryDirectory,
        120_000,
      ),
    );
    output.push(
      await requireSuccessfulCommand(
        "dependency_install",
        "npm",
        ["ci", "--ignore-scripts"],
        modulesDirectory,
        180_000,
      ),
    );
    output.push(
      await requireSuccessfulCommand(
        "module_build",
        "npm",
        ["run", "build"],
        modulesDirectory,
        180_000,
      ),
    );
    const quoteYaml = (value) =>
      `'${value.replaceAll("'", "''").replaceAll("$", "$$")}'`;
    const overrideDirectory = await mkdtemp(path.join(tmpdir(), "zarka-admin-"));
    const overrideFile = path.join(overrideDirectory, "compose.override.yml");
    try {
      await writeFile(
        overrideFile,
        [
          "services:",
          "  nakama:",
          "    volumes:",
          `      - ${quoteYaml(`${path.join(hostRepositoryDirectory, "server", "modules")}:/nakama/data/modules`)}`,
          `      - ${quoteYaml(`${path.join(hostRepositoryDirectory, "server", "local.yml")}:/nakama/data/local.yml:ro`)}`,
          "",
        ].join("\n"),
        { encoding: "utf8", mode: 0o600 },
      );
      output.push(
        await requireSuccessfulCommand(
          "nakama_rebuild",
          "docker",
          [
            "compose",
            "--project-directory",
            serverDirectory,
            "-f",
            composeFile,
            "-f",
            overrideFile,
            "up",
            "-d",
            "--force-recreate",
            "--no-deps",
            "nakama",
          ],
          serverDirectory,
          300_000,
        ),
      );
    } finally {
      await rm(overrideDirectory, { recursive: true, force: true });
    }
    return output.join("\n").slice(-32_000);
  } finally {
    updateInProgress = false;
  }
}

async function handleRequest(request, response) {
  setResponseHeaders(request, response);
  const origin = request.headers.origin;
  if (typeof origin === "string" && !allowedOrigins.has(origin)) {
    sendJson(response, 403, { ok: false, error: "origin_not_allowed" });
    return;
  }
  const requestUrl = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if (
    request.headers["content-type"]?.split(";")[0].toLowerCase() !==
    "application/json"
  ) {
    sendJson(response, 415, { ok: false, error: "application_json_required" });
    return;
  }
  if (requestUrl.pathname !== "/admin/logs" && requestUrl.pathname !== "/admin/update") {
    sendJson(response, 404, { ok: false, error: "not_found" });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const address = getClientAddress(request);
    const attempts = getAttemptRecord(address);
    if (attempts.attempts >= 5) {
      sendJson(response, 429, { ok: false, error: "too_many_attempts" });
      return;
    }
    const expectedPassword = await readConsolePassword();
    if (!passwordMatches(body.password, expectedPassword)) {
      const locked = recordFailedAttempt(address);
      sendJson(response, locked ? 429 : 401, {
        ok: false,
        error: locked ? "too_many_attempts" : "invalid_password",
      });
      return;
    }
    failedAttemptsByAddress.delete(address);

    if (requestUrl.pathname === "/admin/logs") {
      const logs = await getLogs(body.errorOnly === true);
      sendJson(response, 200, { ok: true, logs });
      return;
    }
    const output = await updateServer();
    sendJson(response, 200, { ok: true, output });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, {
        ok: false,
        error: error.code,
        ...(error.details ? { details: error.details } : {}),
      });
      return;
    }
    console.error("Admin API request failed:", error.message);
    sendJson(response, 500, { ok: false, error: "admin_operation_failed" });
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, "0.0.0.0", () => {
  console.info(`Admin API listening on port ${port}`);
});
