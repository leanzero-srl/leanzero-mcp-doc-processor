// Disk full must not take the hosted server down.
//
// Under launchd the server's stdout/stderr are a log file, and logger.js also
// appends to <cwd>/logs/server.log. When that disk is full a write fails with
// ENOSPC. Before the fix that killed the process (an 'error' event with no
// listener on process.stderr and on the log-file WriteStream, and an async
// provision/admin route whose tenants.json write rejected with nothing to
// catch it), and launchd restarted it into a loop.
//
// This runs the REAL entry point (src/server.js) in a child process with its
// cwd, DATA_DIR and launchd-style log on a genuinely full 4 MB disk image
// (hdiutil, macOS only), drives the paths that write, checks the process is
// still alive and serving, that a save running out of space part-way leaves
// no temp file, then frees the space and checks that logging and tenants.json
// writes work again.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(REPO, "src", "server.js");

function hasHdiutil() {
  if (process.platform !== "darwin") return false;
  try { execFileSync("/usr/bin/hdiutil", ["help"], { stdio: "ignore" }); return true; } catch { return false; }
}
const SKIP = hasHdiutil() ? false : "needs macOS hdiutil to make a full disk";

const PROVISION_SECRET = "enospc-test-provision-secret-0123456789";
const ADMIN_TOKEN = "enospc-test-admin-token-0123456789";

let workDir = "";
let mnt = "";
let dataDir = "";
let launchdLog = "";
let serverLog = "";
let filler = "";
let child = null;
let port = 0;
let exitInfo = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = () => !!child && child.exitCode === null && child.signalCode === null;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

/** Write zeros until the volume refuses with ENOSPC (the disk is then really full). */
function fillDisk(file) {
  const fd = fs.openSync(file, "w");
  try {
    for (const size of [256 * 1024, 4096, 512, 1]) {
      const buf = Buffer.alloc(size);
      for (;;) {
        try { fs.writeSync(fd, buf); } catch (e) {
          if (e.code === "ENOSPC") break;
          throw e;
        }
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

function assertDiskFull() {
  let code;
  try { fs.appendFileSync(launchdLog, "probe-should-not-fit\n"); } catch (e) { code = e.code; }
  assert.equal(code, "ENOSPC", "the test volume must really be full");
}

function req(p, init = {}) {
  return fetch(`http://127.0.0.1:${port}${p}`, { ...init, signal: AbortSignal.timeout(10_000) });
}

function provision(label) {
  return req("/v1/provision", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${PROVISION_SECRET}` },
    body: JSON.stringify({ label }),
  });
}

function tmpLeftovers() {
  const names = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.includes(".tmp.")) names.push(path.relative(dataDir, path.join(d, e.name)));
    }
  };
  walk(dataDir);
  return names;
}

before(async () => {
  if (SKIP) return;
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-enospc-"));
  const image = path.join(workDir, "full.dmg");
  mnt = path.join(workDir, "mnt");
  fs.mkdirSync(mnt);
  execFileSync("/usr/bin/hdiutil", ["create", "-size", "4m", "-fs", "HFS+", "-volname", "dpenospc", "-layout", "NONE", image], { stdio: "ignore" });
  execFileSync("/usr/bin/hdiutil", ["attach", "-nobrowse", "-mountpoint", mnt, image], { stdio: "ignore" });

  dataDir = path.join(mnt, "data");
  fs.mkdirSync(path.join(dataDir, "logs"), { recursive: true });
  fs.mkdirSync(path.join(mnt, "logs"), { recursive: true });
  // A tenants.json bigger than the space freed later, so a save writes a
  // PARTIAL temp file before ENOSPC (the leftover-temp-file case).
  const padded = {};
  for (let i = 0; i < 300; i++) {
    padded[`pad-${i}`] = {
      displayName: `padding-${i}-${"p".repeat(360)}`, tokenHash: "", expiringHashes: [],
      createdAt: new Date(0).toISOString(), lastUsedAt: null,
    };
  }
  fs.writeFileSync(path.join(dataDir, "tenants.json"), JSON.stringify(padded, null, 2));
  launchdLog = path.join(mnt, "launchd.log");
  serverLog = path.join(mnt, "logs", "server.log");
  fs.writeFileSync(launchdLog, "");
  fs.writeFileSync(serverLog, "");
  filler = path.join(mnt, "filler.bin");
  fillDisk(filler);
  assertDiskFull();

  port = await freePort();
  const fd = fs.openSync(launchdLog, "a");
  child = spawn(process.execPath, [ENTRY], {
    cwd: mnt,
    stdio: ["ignore", fd, fd],
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      PORT: String(port),
      BIND_HOST: "127.0.0.1",
      DATA_DIR: dataDir,
      PROVISION_SECRET,
      DOC_PROCESSOR_ADMIN_TOKEN: ADMIN_TOKEN,
      LOG_REOPEN_MS: "0",
    },
  });
  fs.closeSync(fd);
  child.on("exit", (code, signal) => { exitInfo = { code, signal }; });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline && alive()) {
    try { if ((await req("/healthz")).ok) break; } catch { /* not up yet */ }
    await sleep(250);
  }
});

after(async () => {
  if (SKIP) return;
  if (child && alive()) {
    child.kill("SIGKILL");
    await sleep(300);
  }
  try { execFileSync("/usr/bin/hdiutil", ["detach", mnt, "-force"], { stdio: "ignore" }); } catch { /* already gone */ }
  fs.rmSync(workDir, { recursive: true, force: true });
});

test("boots and serves /healthz while every log write fails", { skip: SKIP }, async () => {
  assert.ok(alive(), `server died on a full disk: ${JSON.stringify(exitInfo)}`);
  assert.equal((await req("/healthz")).status, 200);
});

test("survives the write paths: refused log, provisioning, admin create", { skip: SKIP }, async () => {
  assertDiskFull();
  const unauth = await req("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(unauth.status, 401);
  assert.equal((await req("/.env")).status, 404);

  assert.equal((await provision("enospc-test")).status, 500);
  const admin = await req("/v1/admin/tenants", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({ displayName: "enospc-admin" }),
  });
  assert.equal(admin.status, 500);
  const revoke = await req("/v1/provision/does-not-exist", {
    method: "DELETE",
    headers: { authorization: `Bearer ${PROVISION_SECRET}` },
  });
  assert.ok([404, 500].includes(revoke.status), `revoke status ${revoke.status}`);

  await sleep(1500);
  assert.ok(alive(), `server died on a full disk: ${JSON.stringify(exitInfo)}`);
  assert.equal((await req("/healthz")).status, 200);
});

test("a save that runs out of space part-way leaves no temp file behind", { skip: SKIP }, async () => {
  // Free 64 KB: less than the ~120 KB tenants.json, so the temp file is
  // partly written before ENOSPC.
  fs.truncateSync(filler, fs.statSync(filler).size - 64 * 1024);
  const st = fs.statfsSync(mnt);
  assert.ok(st.bavail * st.bsize > 16 * 1024, "free space before the save");
  assert.equal((await provision("enospc-partial")).status, 500);
  await sleep(500);
  assert.ok(alive());
  assert.deepEqual(tmpLeftovers(), []);
});

test("writes again once space is freed (both logs and tenants.json recover)", { skip: SKIP }, async () => {
  fs.rmSync(filler);
  await sleep(200);
  assert.equal((await provision("enospc-recovered")).status, 201);
  await sleep(500);
  assert.ok(alive());
  assert.match(fs.readFileSync(launchdLog, "utf8"), /\[provision\] minted tenant/);
  assert.match(fs.readFileSync(serverLog, "utf8"), /\[provision\] minted tenant/);
  const tenants = JSON.parse(fs.readFileSync(path.join(dataDir, "tenants.json"), "utf8"));
  assert.ok(Object.values(tenants).some((t) => t.displayName === "enospc-recovered"));
});
