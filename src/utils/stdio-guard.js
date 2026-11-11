/**
 * Keep the process alive when its log sink fails.
 *
 * Under launchd, stdout and stderr are a log file. When that disk is full a
 * write fails with ENOSPC; Node turns the failure into an 'error' event on
 * process.stdout / process.stderr, and an 'error' event with no listener
 * throws, which killed the server (exit 1) and launchd restarted it into a
 * loop. The same happens with EPIPE when a stdio client goes away.
 *
 * This installs one listener per stream that drops the line on a known
 * "the sink is unwritable" error. The stream is not destroyed (stdout/stderr
 * are SyncWriteStreams on a file), so logging resumes on its own once space
 * is freed. Any OTHER error code is re-thrown, so a real bug still surfaces
 * exactly as before: this is not a blanket swallow.
 *
 * Idempotent; imported first by both entry points (server.js, index.js).
 */

/** Errors that mean "the log sink cannot take this write", nothing more. */
export const SINK_ERROR_CODES = new Set([
  "ENOSPC", // disk full
  "EDQUOT", // quota exceeded
  "EFBIG", // file too large
  "EPIPE", // reader went away (stdio client closed)
  "EIO", // terminal/device gone
  "EAGAIN", // non-blocking sink momentarily full
  "ECONNRESET",
  "ERR_STREAM_DESTROYED",
]);

let dropped = 0;
let installed = false;

/**
 * How many lines the logger's own writes (logs/server.log and its stderr
 * notices) dropped because the sink failed. Counted per write callback in
 * logger.js: a Writable emits its 'error' EVENT only once, so the event alone
 * cannot count. console.error lines that fail are dropped uncounted.
 */
export function droppedLogLines() {
  return dropped;
}

/** True when `err` is a log-sink failure we may drop. */
export function isSinkError(err) {
  const code = err?.code;
  return typeof code === "string" && SINK_ERROR_CODES.has(code);
}

/** Count one dropped log line. */
export function noteDroppedWrite() {
  dropped++;
}

export function installStdioErrorGuards() {
  if (installed) return;
  installed = true;
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (err) => {
      if (isSinkError(err)) return;
      throw err;
    });
  }
}

installStdioErrorGuards();
