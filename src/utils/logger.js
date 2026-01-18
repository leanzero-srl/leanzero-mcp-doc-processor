import fs from "fs";
import path from "path";

// Define log file path relative to current working directory
const LOG_FILE = path.join(process.cwd(), "logs", "server.log");

// Ensure logs directory exists using absolute path from current working directory
let logFileStream = null;

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
    logFileStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

    // Log header with separator for readability
    const separator = "=".repeat(80);
    logFileStream.write(`\n${separator}\n`);
    logFileStream.write(`MCP Doc-Reader Server Started: ${timestamp}\n`);
    logFileStream.write(`${separator}\n`);
    logFileStream.write(`Log file path: ${LOG_FILE}\n\n`);
  } catch (error) {
    console.error("[FATAL] Failed to setup logging:", error.message);
    console.error("Server will continue but logs will only go to stderr");
    logFileStream = null;
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

  // Write to stderr for MCP transport
  console.error(logLine);

  // Also write to log file
  if (logFileStream && !logFileStream.destroyed) {
    logFileStream.write(`${logLine}\n`);
  }
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

  if (logFileStream && !logFileStream.destroyed) {
    logFileStream.write(`${logLine}\n`);
  }
}
