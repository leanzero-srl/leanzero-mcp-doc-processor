/**
 * Insights log — server-side capture of notable tool events (successes and
 * failures) as JSONL, so the MCP's creator can review real usage and improve
 * the tools. Written ALWAYS (regardless of client type); the per-agent
 * `memoryNudge` is a separate, client-gated thing.
 *
 * Location: INSIGHTS_LOG env, else <DATA_DIR or cwd>/logs/insights.jsonl.
 * Writing is best-effort and never throws into a tool handler.
 */

import fs from "fs";
import path from "path";

import { log } from "./logger.js";

function insightsPath() {
  if (process.env.INSIGHTS_LOG) return process.env.INSIGHTS_LOG;
  const base = process.env.DATA_DIR || process.cwd();
  return path.join(base, "logs", "insights.jsonl");
}

let _dirReady = false;

/**
 * Append one structured insight event.
 * @param {Object} event - e.g. { server, tool, event, client, ...detail }
 */
export function logInsight(event) {
  try {
    const file = insightsPath();
    if (!_dirReady) { fs.mkdirSync(path.dirname(file), { recursive: true }); _dirReady = true; }
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
    fs.appendFile(file, line, () => {});
  } catch (err) {
    log("warn", "[insights] failed to record event", { error: err.message });
  }
}

// IT JUST WORKS: teach once, don't nag. A nudge for a given situation is shown
// at most once per process (= once per stdio agent session), keyed by dedupeKey.
const _seenNudges = new Set();

/**
 * Wrap a concrete "what worked / what to try" suggestion as a memory nudge the
 * agent can act on. Deduped per session by `dedupeKey` so repeated identical
 * operations don't spam the agent. Returns undefined when nothing to add.
 * @param {string} suggestion
 * @param {string} [dedupeKey] - omit to always return (e.g. one-off events)
 */
export function memoryNudge(suggestion, dedupeKey) {
  if (!suggestion) return undefined;
  if (dedupeKey) {
    if (_seenNudges.has(dedupeKey)) return undefined;
    _seenNudges.add(dedupeKey);
  }
  return `💡 You look like a memory-capable agent. If this helped, save a durable memory so you reuse it next time: ${suggestion}`;
}
