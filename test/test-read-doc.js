/**
 * Tests for read-doc remote-URL extension.
 *
 * Covers fetchToTempFile (URL fetch + temp materialization) and the
 * handleReadDoc URL-branch glue (try/finally cleanup, security guards).
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import os from "os";

import { fetchToTempFile, handleReadDoc } from "../src/tools/read-doc-tool.js";
import { documentProcessor } from "../src/services/document-processor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGINAL_FETCH = globalThis.fetch;

function makeJsonResponse(body, { status = 200, contentType = "application/json" } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

function stubFetch(impl) {
  let calls = 0;
  globalThis.fetch = async (...args) => {
    calls += 1;
    return impl(calls, ...args);
  };
  return () => calls;
}

function restoreFetch() {
  globalThis.fetch = ORIGINAL_FETCH;
}

// ---------------------------------------------------------------------------
// fetchToTempFile — direct unit tests
// ---------------------------------------------------------------------------

describe("fetchToTempFile", () => {
  afterEach(restoreFetch);

  test("happy path: writes base64 payload to a unique temp dir under os.tmpdir()", async () => {
    const body = "hello world";
    stubFetch(() =>
      makeJsonResponse({
        data: Buffer.from(body).toString("base64"),
        filename: "hello.txt",
        mimeType: "text/plain",
        size: body.length,
      }),
    );

    const fetched = await fetchToTempFile("https://example.test/x", "Bearer t");
    assert.strictEqual(fetched.originalFilename, "hello.txt");
    assert.strictEqual(fetched.mimeType, "text/plain");
    assert.ok(fetched.tempDir.startsWith(os.tmpdir()), "tempDir must be under os.tmpdir()");
    assert.ok(fetched.tempDir.includes("doc-reader-"), "tempDir must use the doc-reader- prefix");
    assert.strictEqual(path.basename(fetched.tempPath), "hello.txt");

    const written = await fs.promises.readFile(fetched.tempPath, "utf8");
    assert.strictEqual(written, body);

    await fs.promises.rm(fetched.tempDir, { recursive: true, force: true });
  });

  test("rejects non-https URLs", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return makeJsonResponse({});
    };
    await assert.rejects(
      fetchToTempFile("http://example.test/x", "Bearer t"),
      /must use https/i,
    );
    assert.strictEqual(called, false, "fetch must not be called for non-https URLs");
  });

  test("rejects oversized payload (READ_DOC_MAX_BYTES)", async () => {
    const original = process.env.READ_DOC_MAX_BYTES;
    process.env.READ_DOC_MAX_BYTES = "100";
    try {
      const big = Buffer.alloc(500, "x").toString("base64");
      stubFetch(() =>
        makeJsonResponse({ data: big, filename: "big.bin", mimeType: "application/octet-stream" }),
      );
      await assert.rejects(
        fetchToTempFile("https://example.test/x", "Bearer t"),
        /too large/i,
      );
    } finally {
      if (original === undefined) delete process.env.READ_DOC_MAX_BYTES;
      else process.env.READ_DOC_MAX_BYTES = original;
    }
  });

  test("rejects non-JSON Content-Type", async () => {
    stubFetch(() =>
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await assert.rejects(
      fetchToTempFile("https://example.test/x", "Bearer t"),
      /unexpected Content-Type/i,
    );
  });

  test("rejects HTTP 401 without retry", async () => {
    const callCount = stubFetch(() => new Response("", { status: 401 }));
    await assert.rejects(
      fetchToTempFile("https://example.test/x", "Bearer wrong"),
      /HTTP 401/,
    );
    assert.strictEqual(callCount(), 1, "fetch must be called exactly once on 401");
  });

  test("rejects HTTP 404 without retry", async () => {
    const callCount = stubFetch(() => new Response("", { status: 404 }));
    await assert.rejects(
      fetchToTempFile("https://example.test/x", "Bearer t"),
      /HTTP 404/,
    );
    assert.strictEqual(callCount(), 1, "fetch must be called exactly once on 404");
  });

  test("rejects payload missing 'data' field", async () => {
    stubFetch(() => makeJsonResponse({ filename: "x.bin", mimeType: "application/octet-stream" }));
    await assert.rejects(
      fetchToTempFile("https://example.test/x", "Bearer t"),
      /missing required 'data'/i,
    );
  });

  test("propagates redirect-error from fetch", async () => {
    stubFetch(() => {
      throw new TypeError("unexpected redirect to https://attacker.test/");
    });
    await assert.rejects(
      fetchToTempFile("https://example.test/x", "Bearer t"),
      /redirect/i,
    );
  });

  test("falls back to suggestedFilename when response omits filename", async () => {
    stubFetch(() =>
      makeJsonResponse({
        data: Buffer.from("abc").toString("base64"),
        mimeType: "text/plain",
      }),
    );
    const fetched = await fetchToTempFile("https://example.test/x", "Bearer t", "fallback.txt");
    assert.strictEqual(path.basename(fetched.tempPath), "fallback.txt");
    await fs.promises.rm(fetched.tempDir, { recursive: true, force: true });
  });

  test("passes Authorization header to fetch (verified via captured args)", async () => {
    let capturedHeaders = null;
    globalThis.fetch = async (_url, init) => {
      capturedHeaders = init.headers;
      return makeJsonResponse({
        data: Buffer.from("x").toString("base64"),
        filename: "x.bin",
        mimeType: "application/octet-stream",
      });
    };
    const fetched = await fetchToTempFile("https://example.test/x", "Bearer secret-123");
    assert.strictEqual(capturedHeaders.Authorization, "Bearer secret-123");
    assert.strictEqual(capturedHeaders.Accept, "application/json");
    await fs.promises.rm(fetched.tempDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// handleReadDoc — URL branch end-to-end (with stubbed processor)
// ---------------------------------------------------------------------------

describe("handleReadDoc URL branch", () => {
  let originalProcessDocument;

  beforeEach(() => {
    originalProcessDocument = documentProcessor.processDocument.bind(documentProcessor);
  });

  afterEach(() => {
    documentProcessor.processDocument = originalProcessDocument;
    restoreFetch();
  });

  test("end-to-end: fetches URL, runs processor, cleans up temp dir", async () => {
    const fileBody = "remote document body";
    stubFetch(() =>
      makeJsonResponse({
        data: Buffer.from(fileBody).toString("base64"),
        filename: "remote.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    let processorSawPath = null;
    documentProcessor.processDocument = async (filePath, _mode) => {
      processorSawPath = filePath;
      // Verify the file actually exists at this point and contains the fetched bytes
      const onDisk = await fs.promises.readFile(filePath, "utf8");
      assert.strictEqual(onDisk, fileBody);
      return { success: true, text: "PROCESSED", images: [], metadata: null };
    };

    const result = await handleReadDoc({
      url: "https://example.test/attachment",
      authHeader: "Bearer one-shot",
      mode: "summary",
      filename: "fallback.docx",
    });

    assert.ok(result.content?.[0]?.text, "response must have text content");
    assert.ok(processorSawPath, "processor must have been invoked with a temp filePath");
    assert.ok(processorSawPath.includes("doc-reader-"), "temp path must be under doc-reader- dir");

    // Cleanup must have run (try/finally) — temp dir no longer exists
    const tempDir = path.dirname(processorSawPath);
    assert.strictEqual(fs.existsSync(tempDir), false, "temp dir must be cleaned up after handleReadDoc returns");
  });

  test("cleans up temp dir even when processor throws", async () => {
    stubFetch(() =>
      makeJsonResponse({
        data: Buffer.from("x").toString("base64"),
        filename: "boom.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );

    let processorSawPath = null;
    documentProcessor.processDocument = async (filePath) => {
      processorSawPath = filePath;
      throw new Error("synthetic processor failure");
    };

    await assert.rejects(
      handleReadDoc({
        url: "https://example.test/x",
        authHeader: "Bearer t",
        mode: "summary",
      }),
      /synthetic processor failure/,
    );

    assert.ok(processorSawPath, "processor must have been called");
    const tempDir = path.dirname(processorSawPath);
    assert.strictEqual(fs.existsSync(tempDir), false, "temp dir must be cleaned up even on processor error");
  });

  test("returns isError when neither filePath nor url are provided", async () => {
    const result = await handleReadDoc({ mode: "summary" });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /requires either filePath OR url/i);
  });

  test("returns isError on non-https URL (no temp dir created)", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return makeJsonResponse({});
    };

    const result = await handleReadDoc({
      url: "http://insecure.test/x",
      authHeader: "Bearer t",
      mode: "summary",
    });
    assert.strictEqual(result.isError, true);
    assert.match(result.content[0].text, /must use https/i);
    assert.strictEqual(called, false, "fetch must not be called for non-https URL");
  });
});
