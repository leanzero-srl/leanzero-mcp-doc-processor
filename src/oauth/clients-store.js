import { promises as fs } from "node:fs";
import path from "node:path";
import { log } from "../utils/logger.js";

// File-backed OAuthRegisteredClientsStore for dynamic client registration.
// claude.ai (and other MCP clients) register themselves via POST /register; we
// persist the registration so the client_id survives server restarts. Mirrors
// the tmp+rename, mode-0600 persistence pattern used by src/auth.js (tenants).
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const CLIENTS_PATH = path.join(DATA_DIR, "oauth-clients.json");

export class FileClientsStore {
  constructor() {
    this.cache = null;
  }

  async _load() {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await fs.readFile(CLIENTS_PATH, "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") this.cache = {};
      else throw err;
    }
    return this.cache;
  }

  async _save(clients) {
    await fs.mkdir(path.dirname(CLIENTS_PATH), { recursive: true });
    const tmp = `${CLIENTS_PATH}.tmp.${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(clients, null, 2), { mode: 0o600 });
    await fs.rename(tmp, CLIENTS_PATH);
    try { await fs.chmod(CLIENTS_PATH, 0o600); } catch { /* best effort on non-POSIX FS */ }
    this.cache = clients;
  }

  async getClient(clientId) {
    const clients = await this._load();
    return clients[clientId];
  }

  async registerClient(client) {
    const clients = await this._load();
    clients[client.client_id] = client;
    await this._save(clients);
    log("info", "[oauth] registered client", {
      client_id: client.client_id,
      client_name: client.client_name,
    });
    return client;
  }
}
