/**
 * fact-check tests — claim extraction, evidence shaping, and the cross-MCP
 * orchestration (with the web-search call stubbed via dependency injection, so
 * no network / Serper key is needed).
 */
import { describe, test } from "node:test";
import assert from "node:assert";

import { factCheck, extractClaims, evidenceFromText } from "../src/tools/fact-check.js";

describe("fact-check claim extraction", () => {
  test("extracts factual sentences (numbers / proper nouns / assertions), drops fluff", () => {
    const text =
      "This is a vague intro with no facts. Acme Corp reported revenue of $42 million in 2026, up 40% year over year. " +
      "We think it might be nice maybe. The company launched its flagship product in Berlin in 2025.";
    const claims = extractClaims(text, 8);
    assert.ok(claims.length >= 2, `expected >= 2 claims, got ${claims.length}: ${JSON.stringify(claims)}`);
    assert.ok(claims.some((c) => /42 million/.test(c)), "should keep the revenue claim");
    assert.ok(claims.some((c) => /Berlin/.test(c)), "should keep the launch claim");
    assert.ok(!claims.some((c) => /vague intro/.test(c)), "should drop the fluff sentence");
  });

  test("evidenceFromText pulls source URLs and a keyword-overlap score", () => {
    const { sources, supportScore } = evidenceFromText(
      "Acme revenue grew 40 percent in 2026",
      "Acme reported revenue growth of 40% in 2026 — https://example.com/a — and https://example.org/b confirm it.",
    );
    assert.deepStrictEqual(sources.sort(), ["https://example.com/a", "https://example.org/b"]);
    assert.ok(supportScore > 0.4, `expected decent overlap, got ${supportScore}`);
  });
});

describe("fact-check cross-MCP orchestration (stubbed web-search)", () => {
  test("calls the web-search MCP once per claim and structures the evidence", async () => {
    const calls = [];
    const stub = async (cfg, tool, args) => {
      calls.push({ tool, query: args.query, bearer: cfg.bearer, serperKey: cfg.serperKey });
      return { ok: true, text: `Top results for "${args.query}": https://news.example/x reports it. https://wiki.example/y`, isError: false };
    };
    const r = await factCheck(
      {
        claims: ["Solid-state batteries reached 500 Wh/kg in 2026", "The Eiffel Tower is located in Paris"],
        webSearchBearer: "tenant-x",
        serperKey: "serper-y",
      },
      { callWebSearchTool: stub },
    );
    assert.strictEqual(r.success, true, r.error);
    assert.strictEqual(r.claimsChecked, 2);
    assert.strictEqual(r.results.length, 2);
    assert.strictEqual(calls.length, 2, "one web-search call per claim");
    assert.strictEqual(calls[0].tool, "get-web-search-summaries");
    assert.strictEqual(calls[0].bearer, "tenant-x");
    assert.strictEqual(calls[0].serperKey, "serper-y");
    assert.ok(r.results[0].sources.length >= 1, "should extract source URLs");
    assert.strictEqual(typeof r.results[0].supportScore, "number");
    assert.match(r.note, /not a verdict/i);
  });

  test("requires a web-search bearer and a serper key (the cross-MCP credentials)", async () => {
    const stub = async () => ({ ok: true, text: "" });
    const r1 = await factCheck({ claims: ["x is true now"] }, { callWebSearchTool: stub });
    assert.strictEqual(r1.success, false);
    assert.match(r1.error, /webSearchBearer/);
    const r2 = await factCheck({ claims: ["x is true now"], webSearchBearer: "b" }, { callWebSearchTool: stub });
    assert.strictEqual(r2.success, false);
    assert.match(r2.error, /serperKey/);
  });

  test("errors clearly when neither claims nor a document is given", async () => {
    const r = await factCheck({ webSearchBearer: "b", serperKey: "s" }, { callWebSearchTool: async () => ({ ok: true, text: "" }) });
    assert.strictEqual(r.success, false);
    assert.match(r.error, /claims|filePath|content/i);
  });
});
