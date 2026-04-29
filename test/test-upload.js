/**
 * Tests for the upload bridge — uploadFileToTarget helper + the
 * uploadUrl/uploadAuthHeader integration in create-doc / create-markdown / create-excel.
 *
 * The upload path mirrors the read-doc URL fetch path (same security rules,
 * same envelope shape) — these tests guard the same invariants on the write
 * side: HTTPS-only, never log the auth header, redact URL token in logs,
 * no auto-retry on 401/404, oversize rejection before fetch.
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

import { uploadFileToTarget, mimeTypeFromExtension } from "../src/tools/utils.js";
import { createDoc } from "../src/tools/create-doc.js";

const ORIGINAL_FETCH = globalThis.fetch;

function jsonOk(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function writeTempFile(name, contents) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "upload-test-"));
  const p = path.join(dir, name);
  await fs.promises.writeFile(p, contents);
  return { dir, path: p };
}

function restoreFetch() {
  globalThis.fetch = ORIGINAL_FETCH;
}

// ---------------------------------------------------------------------------
// uploadFileToTarget — direct unit tests
// ---------------------------------------------------------------------------

describe("uploadFileToTarget — direct", () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = null;
  });

  afterEach(async () => {
    restoreFetch();
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  test("happy path: reads file, base64-encodes, POSTs envelope, returns attachment", async () => {
    const fileBody = "hello, attachment world";
    const { dir, path: filePath } = await writeTempFile("hello.docx", fileBody);
    tempDir = dir;

    let capturedUrl, capturedInit;
    globalThis.fetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return jsonOk({ success: true, attachment: { id: "10001", filename: "hello.docx", content: "https://example.test/atl/10001" } });
    };

    const result = await uploadFileToTarget({
      filePath,
      uploadUrl: "https://example.test/upload?t=tok",
      uploadAuthHeader: "Bearer secret-bearer-1",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.attachment.id, "10001");

    // Verify the envelope shape
    const envelope = JSON.parse(capturedInit.body);
    assert.strictEqual(envelope.filename, "hello.docx");
    assert.strictEqual(envelope.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.strictEqual(envelope.size, fileBody.length);
    assert.strictEqual(Buffer.from(envelope.data, "base64").toString("utf8"), fileBody);

    // Verify the request shape
    assert.strictEqual(capturedInit.method, "POST");
    assert.strictEqual(capturedInit.headers.Authorization, "Bearer secret-bearer-1");
    assert.strictEqual(capturedInit.headers["Content-Type"], "application/json");
    assert.strictEqual(capturedInit.redirect, "error");
  });

  test("rejects non-https URLs without calling fetch", async () => {
    const { dir, path: filePath } = await writeTempFile("x.docx", "x");
    tempDir = dir;

    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return jsonOk({});
    };

    await assert.rejects(
      uploadFileToTarget({
        filePath,
        uploadUrl: "http://insecure.test/upload",
        uploadAuthHeader: "Bearer t",
      }),
      /must use https/i,
    );
    assert.strictEqual(called, false, "fetch must not be called for non-https URL");
  });

  test("rejects oversized payload (WRITE_DOC_MAX_BYTES)", async () => {
    const original = process.env.WRITE_DOC_MAX_BYTES;
    process.env.WRITE_DOC_MAX_BYTES = "100";
    try {
      const { dir, path: filePath } = await writeTempFile("big.bin", Buffer.alloc(500, "x"));
      tempDir = dir;

      let called = false;
      globalThis.fetch = async () => {
        called = true;
        return jsonOk({});
      };

      await assert.rejects(
        uploadFileToTarget({
          filePath,
          uploadUrl: "https://example.test/upload",
          uploadAuthHeader: "Bearer t",
        }),
        /too large/i,
      );
      assert.strictEqual(called, false, "fetch must not be called when oversize");
    } finally {
      if (original === undefined) delete process.env.WRITE_DOC_MAX_BYTES;
      else process.env.WRITE_DOC_MAX_BYTES = original;
    }
  });

  test("rejects HTTP 401 without retry", async () => {
    const { dir, path: filePath } = await writeTempFile("a.docx", "a");
    tempDir = dir;

    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("nope", { status: 401 });
    };

    await assert.rejects(
      uploadFileToTarget({
        filePath,
        uploadUrl: "https://example.test/upload",
        uploadAuthHeader: "Bearer wrong",
      }),
      /HTTP 401/,
    );
    assert.strictEqual(calls, 1, "fetch must be called exactly once on 401");
  });

  test("rejects HTTP 404 without retry", async () => {
    const { dir, path: filePath } = await writeTempFile("a.docx", "a");
    tempDir = dir;

    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("expired", { status: 404 });
    };

    await assert.rejects(
      uploadFileToTarget({
        filePath,
        uploadUrl: "https://example.test/upload",
        uploadAuthHeader: "Bearer t",
      }),
      /HTTP 404/,
    );
    assert.strictEqual(calls, 1, "fetch must be called exactly once on 404");
  });

  test("rejects HTTP 413 (payload too large from server)", async () => {
    const { dir, path: filePath } = await writeTempFile("a.docx", "a");
    tempDir = dir;

    globalThis.fetch = async () => new Response("too big for server", { status: 413 });

    await assert.rejects(
      uploadFileToTarget({
        filePath,
        uploadUrl: "https://example.test/upload",
        uploadAuthHeader: "Bearer t",
      }),
      /HTTP 413/,
    );
  });

  test("rejects HTTP 415 (disallowed mimeType)", async () => {
    const { dir, path: filePath } = await writeTempFile("script.exe", "MZ\0\0");
    tempDir = dir;

    globalThis.fetch = async () => new Response("disallowed extension", { status: 415 });

    await assert.rejects(
      uploadFileToTarget({
        filePath,
        uploadUrl: "https://example.test/upload",
        uploadAuthHeader: "Bearer t",
      }),
      /HTTP 415/,
    );
  });

  test("propagates redirect-error from fetch", async () => {
    const { dir, path: filePath } = await writeTempFile("a.docx", "a");
    tempDir = dir;

    globalThis.fetch = async () => {
      throw new TypeError("unexpected redirect to https://attacker.test/");
    };

    await assert.rejects(
      uploadFileToTarget({
        filePath,
        uploadUrl: "https://example.test/upload",
        uploadAuthHeader: "Bearer t",
      }),
      /redirect/i,
    );
  });

  test("uploadFilename override takes precedence over basename", async () => {
    const { dir, path: filePath } = await writeTempFile("ugly-temp-name.docx", "x");
    tempDir = dir;

    let envelope;
    globalThis.fetch = async (_url, init) => {
      envelope = JSON.parse(init.body);
      return jsonOk({ success: true, attachment: {} });
    };

    await uploadFileToTarget({
      filePath,
      uploadUrl: "https://example.test/upload",
      uploadAuthHeader: "Bearer t",
      filename: "Pretty Name.docx",
    });

    assert.strictEqual(envelope.filename, "Pretty Name.docx");
  });

  test("missing required args throw immediately", async () => {
    await assert.rejects(
      uploadFileToTarget({ uploadUrl: "https://example.test", uploadAuthHeader: "Bearer t" }),
      /filePath is required/,
    );
    await assert.rejects(
      uploadFileToTarget({ filePath: "/tmp/x", uploadAuthHeader: "Bearer t" }),
      /uploadUrl is required/,
    );
    await assert.rejects(
      uploadFileToTarget({ filePath: "/tmp/x", uploadUrl: "https://example.test" }),
      /uploadAuthHeader is required/,
    );
  });
});

// ---------------------------------------------------------------------------
// mimeTypeFromExtension — small but worth pinning
// ---------------------------------------------------------------------------

describe("mimeTypeFromExtension", () => {
  test("returns the right MIME for known extensions", () => {
    assert.strictEqual(mimeTypeFromExtension("foo.docx"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.strictEqual(mimeTypeFromExtension("foo.xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.strictEqual(mimeTypeFromExtension("foo.md"), "text/markdown");
    assert.strictEqual(mimeTypeFromExtension("foo.pdf"), "application/pdf");
    assert.strictEqual(mimeTypeFromExtension("foo.txt"), "text/plain");
    assert.strictEqual(mimeTypeFromExtension("foo.csv"), "text/csv");
  });

  test("falls back to octet-stream for unknown extensions", () => {
    assert.strictEqual(mimeTypeFromExtension("foo.unknown"), "application/octet-stream");
    assert.strictEqual(mimeTypeFromExtension("noext"), "application/octet-stream");
    assert.strictEqual(mimeTypeFromExtension(""), "application/octet-stream");
    assert.strictEqual(mimeTypeFromExtension(null), "application/octet-stream");
  });

  test("handles uppercase extensions", () => {
    assert.strictEqual(mimeTypeFromExtension("FOO.DOCX"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
});

// ---------------------------------------------------------------------------
// create-doc end-to-end with upload
// ---------------------------------------------------------------------------

describe("create-doc upload integration", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = null;
  });

  afterEach(async () => {
    restoreFetch();
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  test("create-doc with uploadUrl+uploadAuthHeader writes locally AND uploads", async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "create-upload-"));
    const outputPath = path.join(tempDir, "test.docx");

    let envelope;
    globalThis.fetch = async (url, init) => {
      envelope = JSON.parse(init.body);
      return jsonOk({ success: true, attachment: { id: "55555", filename: "test.docx", content: "https://atl.test/55555" } });
    };

    const result = await createDoc({
      title: "Upload Integration Test Doc",
      paragraphs: ["First paragraph.", "## A heading", "Second paragraph."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      uploadUrl: "https://example.test/upload?t=mock",
      uploadAuthHeader: "Bearer mock-bearer",
    });

    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(result.filePath), "local file must exist");
    assert.strictEqual(result.uploaded, true);
    assert.strictEqual(result.uploadAttachment.id, "55555");
    assert.strictEqual(result.uploadStatus, 200);
    assert.strictEqual(result.uploadError, null);

    // Sanity: envelope shape is correct
    assert.ok(typeof envelope.data === "string" && envelope.data.length > 0, "data must be base64");
    assert.strictEqual(envelope.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.ok(envelope.size > 0);
  });

  test("create-doc with failing upload still writes the local file and surfaces uploadError", async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "create-upload-fail-"));
    const outputPath = path.join(tempDir, "fail.docx");

    globalThis.fetch = async () => new Response("token consumed", { status: 404 });

    const result = await createDoc({
      title: "Upload Failure Path Doc",
      paragraphs: ["Some content."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      uploadUrl: "https://example.test/upload?t=expired",
      uploadAuthHeader: "Bearer t",
    });

    assert.strictEqual(result.success, true, "create-doc should still succeed locally");
    assert.ok(fs.existsSync(result.filePath), "local file must still exist on upload failure");
    assert.strictEqual(result.uploaded, false);
    assert.strictEqual(result.uploadAttachment, null);
    assert.match(result.uploadError, /HTTP 404/);
  });

  test("create-doc with only uploadUrl (no auth header) reports a clear error", async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "create-upload-partial-"));
    const outputPath = path.join(tempDir, "partial.docx");

    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return jsonOk({});
    };

    const result = await createDoc({
      title: "Partial Upload Params Test",
      paragraphs: ["Body."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      uploadUrl: "https://example.test/upload",
      // uploadAuthHeader: missing
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.uploaded, false);
    assert.match(result.uploadError, /must be provided together/);
    assert.strictEqual(called, false, "fetch must not be called when auth header is missing");
  });

  test("create-doc without upload params behaves identically to before (backward compat)", async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "create-no-upload-"));
    const outputPath = path.join(tempDir, "no-upload.docx");

    const result = await createDoc({
      title: "No Upload Sanity Check",
      paragraphs: ["Plain content."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.uploaded, false);
    assert.strictEqual(result.uploadAttachment, null);
    assert.strictEqual(result.uploadError, null);
    assert.ok(fs.existsSync(result.filePath));
  });

  test("interactive clientHint + successful upload produces concise message", async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "create-interactive-up-"));
    const outputPath = path.join(tempDir, "ix.docx");

    globalThis.fetch = async () => jsonOk({
      success: true,
      attachment: { id: "1", content: "https://atl.test/atl/1", filename: "ix.docx" },
    });

    const result = await createDoc({
      title: "Interactive Upload Concise Message Test",
      paragraphs: ["Body."],
      outputPath,
      enforceDocsFolder: false,
      preventDuplicates: false,
      uploadUrl: "https://example.test/upload",
      uploadAuthHeader: "Bearer t",
      clientHint: "interactive",
    });

    assert.strictEqual(result.uploaded, true);
    assert.match(result.message, /^Created and uploaded:/);
    assert.match(result.message, /https:\/\/atl\.test\/atl\/1/);
    // No chatty fields
    assert.strictEqual(result.enforcement, undefined);
  });
});
