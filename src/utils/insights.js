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

/**
 * Append one structured insight event.
 * @param {Object} event - e.g. { server, tool, event, client, ...detail }
 */
export function logInsight(event) {
  try {
    const file = insightsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n";
    fs.appendFile(file, line, () => {});
  } catch (err) {
    log("warn", "[insights] failed to record event", { error: err.message });
  }
}

/**
 * Wrap a concrete "what worked / what to try" suggestion as a memory nudge the
 * agent can act on. Returns undefined when there's nothing to suggest.
 * @param {string} suggestion
 */
export function memoryNudge(suggestion) {
  if (!suggestion) return undefined;
  return `💡 You look like a memory-capable agent. If this helped, save a durable memory so you reuse it next time: ${suggestion}`;
}
