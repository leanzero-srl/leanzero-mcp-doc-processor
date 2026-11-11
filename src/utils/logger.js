import fs from "fs";
import path from "path";
import { installStdioErrorGuards, isSinkError, noteDroppedWrite } from "./stdio-guard.js";

// Define log file path relative to current working directory
const LOG_FILE = path.join(process.cwd(), "logs", "server.log");

// Ensure logs directory exists using absolute path from current working directory
let logFileStream = null;
// Set when the log file failed (disk full: ENOSPC). The stream is dropped and
// reopened on a later log() call once LOG_REOPEN_MS has passed, so a full disk
// costs log lines, never the process, and logging comes back by itself.
let logFileBrokenAt = 0;
const reopenAfterMs = () => {
  const n = Number(process.env.LOG_REOPEN_MS);
  return Number.isFinite(n) && n >= 0 ? n : 30_000;
};

/**
 * Write to stderr without ever taking the process down: a full disk under the
 * launchd log file (ENOSPC) or a closed reader (EPIPE) drops the line and
 * counts it (stdio-guard.js). Used by the logger's own notices.
 */
function writeStderr(text) {
  installStdioErrorGuards();
  try {
    process.stderr.write(text, (err) => { if (err) noteDroppedWrite(); });
  } catch (err) {
    if (!isSinkError(err)) throw err;
    noteDroppedWrite();
  }
}

/** Open logs/server.log for append, with an 'error' listener (never unhandled). */
function openLogFile() {
  const stream = fs.createWriteStream(LOG_FILE, { flags: "a" });
  stream.on("error", (err) => {
    // ENOSPC/EDQUOT/EACCES/...: whatever the cause, the file log is a side
    // channel; drop it and retry later instead of crashing the server.
    if (logFileStream === stream) {
      logFileStream = null;
      logFileBrokenAt = Date.now();
    }
    stream.destroy();
    writeStderr(`[logger] log file write failed (${err.code || err.message}); file logging paused\n`);
  });
  return stream;
}

/** Append one line to the log file, reopening it after a failure once the cooldown passed. */
function writeLogFile(text) {
  if (!logFileStream && logFileBrokenAt && Date.now() - logFileBrokenAt >= reopenAfterMs()) {
    logFileBrokenAt = 0;
    try {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
      logFileStream = openLogFile();
    } catch {
      logFileBrokenAt = Date.now();
      return;
    }
  }
  if (!logFileStream || logFileStream.destroyed) return;
  logFileStream.write(text, (err) => { if (err) noteDroppedWrite(); });
}

/**
 * Setup logging to file
 */
export function setupLogging() {
  try {
    const timestamp = new Date().toISOString();

    // Create the logs directory if it doesn't exist
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Open the log file in append mode
    logFileStream = openLogFile();

    // Log header with separator for readability
    const separator = "=".repeat(80);
    writeLogFile(`\n${separator}\n`);
    writeLogFile(
      `MCP Document Processor Server Started: ${timestamp}\n`,
    );
    writeLogFile(`${separator}\n`);
    writeLogFile(`Log file path: ${LOG_FILE}\n\n`);
  } catch (error) {
    writeStderr(`[FATAL] Failed to setup logging: ${error.message}\n`);
    writeStderr("Server will continue but logs will only go to stderr\n");
    logFileStream = null;
    logFileBrokenAt = Date.now();
  }
}

/**
 * Simple logger for tracking function calls and logic flow
 */
export function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  let logLine = `${prefix} ${message}`;
  if (data) {
    logLine += ` ${JSON.stringify(data)}`;
  }

  // Write to stderr for MCP transport. Through console.error on purpose: the
  // tests capture log lines there. A failing sink cannot kill the process:
  // stdio-guard.js listens for the stream's 'error' event.
  console.error(logLine);

  // Also write to log file
  writeLogFile(`${logLine}\n`);
}

/**
 * Log function entry
 */
export function logFunctionCall(funcName, args = {}) {
  log("debug", `ENTER: ${funcName}`, args);
}

/**
 * Log function exit with result summary
 */
export function logResult(funcName, result) {
  let resultInfo;
  if (result === undefined) {
    resultInfo = "undefined";
  } else if (result === null) {
    resultInfo = "null";
  } else if (typeof result === "object") {
    // For objects, show key count and success flag
    const keys = Object.keys(result);
    resultInfo = `{keys: ${keys.join(", ")}, success: ${!!result.success}}`;
  } else {
    resultInfo = String(result);
  }
  log("debug", `EXIT: ${funcName} =>`, { result: resultInfo });
}

/**
 * Strategic logger for tracking code paths - marks which branch is taken
 */
export function logPath(pathName, description = "") {
  const timestamp = new Date().toISOString();
  const marker = `>>> PATH: ${pathName}`;
  const desc = description ? ` (${description})` : "";
  const logLine = `[${timestamp}] [PATH] ${marker}${desc}`;

  console.error(logLine);
  writeLogFile(`${logLine}\n`);
}
