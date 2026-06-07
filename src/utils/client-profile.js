/**
 * Client profile — is the caller a memory-capable AGENT, or a chat UI?
 *
 * Why: we want to nudge memory-capable coding agents (Claude Code, Qwen Coder,
 * Hermes, OpenCode, Cursor, Cline, …) to save durable "how to use this tool
 * well" memories on success — but stay silent for chat UIs like LM Studio that
 * have no long-term memory and can't act on the nudge.
 *
 * Signal: the MCP `initialize` handshake reports `clientInfo.name`. For a stdio
 * server (how coding agents self-host this) there's one persistent session, so
 * we capture it via `oninitialized` (see index.js) and read it here. The HOSTED
 * HTTP server is stateless (fresh Server per request) — clientInfo isn't
 * available at tools/call time there, so this resolves to "not capable" unless
 * the operator forces it with MCP_CLIENT_MEMORY. That's exactly what we want:
 * LM Studio over the Funnel gets no nudge.
 */

let _clientInfo = null;

/** Called from the stdio entrypoint's oninitialized hook. */
export function setClientInfo(info) {
  if (info && info.name) {
    _clientInfo = { name: String(info.name), version: String(info.version || "") };
  }
}

export function getClientInfo() {
  return _clientInfo;
}

// Coding/agentic frontends that maintain long-term memory and run a tool loop.
const MEMORY_CAPABLE = /claude[-\s]?code|\bcursor\b|\bcline\b|\broo\b|windsurf|aider|\bcontinue\b|opencode|open[-\s]?code|\bqwen\b|hermes|\bcodex\b|\bzed\b|\bcody\b|goose|\bkilo\b|\bamp\b|crush/i;

function envMemoryOverride() {
  const v = (process.env.MCP_CLIENT_MEMORY || "").toLowerCase();
  if (/^(1|true|yes|on)$/.test(v)) return true;
  if (/^(0|false|no|off)$/.test(v)) return false;
  return undefined;
}

/**
 * @param {Object} [params] - tool params (may carry an explicit clientName)
 * @returns {{clientName:string, canPersistMemory:boolean}}
 */
export function resolveClientProfile(params = {}) {
  const name = (_clientInfo?.name || params.clientName || "").toString();
  const override = envMemoryOverride();
  const canPersistMemory =
    override !== undefined ? override : MEMORY_CAPABLE.test(name);
  return { clientName: name || "unknown", canPersistMemory };
}
