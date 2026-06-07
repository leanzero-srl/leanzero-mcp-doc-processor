import path from "path";

import { documentProcessor } from "../services/document-processor.js";
import { callWebSearchTool, mapWithConcurrency, DEFAULT_WEB_SEARCH_URL } from "../services/web-search-client.js";
import { createPdf } from "./create-pdf.js";
import { resolveClientHint } from "./utils.js";
import { resolveClientProfile } from "../utils/client-profile.js";
import { logInsight } from "../utils/insights.js";

const STOP = new Set(
  "the a an of to in on for and or but is are was were be been being by with as at from that this these those it its their his her our your you we they he she them his hers ours into over under than then so such not no nor only also very more most some any each".split(
    " ",
  ),
);

/** Significant (>=4 char, non-stopword) terms of a claim, deduped. */
function significantWords(claim) {
  const words = String(claim).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  return [...new Set(words)].filter((w) => !STOP.has(w));
}

/**
 * Heuristically pull verifiable factual sentences out of a document. No LLM —
 * we favor sentences with numbers, years, proper nouns, or assertion verbs, and
 * drop very short/long ones. Returns the top `max` by score.
 */
export function extractClaims(text, max = 8) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean
    .split(/(?<=[.!?])\s+(?=["A-Z0-9])/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const ASSERT = /\b(is|are|was|were|will|has|have|had|increased|decreased|grew|rose|fell|reached|reduces?|improves?|causes?|leads?\s+to|launched|founded|reported|announced|the\s+(first|largest|fastest|only|best|leading))\b/i;
  const scored = sentences.map((s) => {
    let score = 0;
    if (/\d/.test(s)) score += 2;
    if (/\b(19|20)\d{2}\b/.test(s)) score += 1;
    if (/\b\d+(\.\d+)?\s?%/.test(s)) score += 1;
    if (ASSERT.test(s)) score += 1;
    if (/[A-Z][a-z]+\s+[A-Z][a-z]+/.test(s)) score += 1;
    const words = s.split(" ").length;
    if (words < 4 || words > 40) score -= 2;
    return { s, score };
  });
  return scored
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.s);
}

/** From a web-search summaries blob, pull source URLs + a rough support score. */
export function evidenceFromText(claim, evidenceText) {
  const text = String(evidenceText || "");
  const urls = [...new Set((text.match(/https?:\/\/[^\s)\]]+/g) || []).map((u) => u.replace(/[.,;]+$/, "")))].slice(0, 6);
  const words = significantWords(claim);
  const lower = text.toLowerCase();
  const hits = words.filter((w) => lower.includes(w)).length;
  const supportScore = words.length ? Math.round((hits / words.length) * 100) / 100 : 0;
  return { sources: urls, supportScore };
}

function buildReportMarkdown(results, sourceDoc) {
  const lines = [];
  lines.push("## Summary");
  lines.push(`Checked ${results.length} claim(s)${sourceDoc ? ` from \`${path.basename(sourceDoc)}\`` : ""} against the live web (via the web-search MCP).`);
  lines.push("\n> The keyword-support % is a rough heuristic over the retrieved snippets — not a verdict. Review the sources before deciding support vs. refute.");
  results.forEach((r, i) => {
    lines.push(`\n### Claim ${i + 1}`);
    lines.push(`*"${r.claim}"*`);
    lines.push(`\n- **Keyword support:** ${Math.round((r.supportScore || 0) * 100)}%`);
    if (r.sources && r.sources.length) {
      lines.push("- **Sources:**");
      r.sources.forEach((u) => lines.push(`  - ${u}`));
    } else {
      lines.push(`- **Sources:** ${r.searchOk ? "none retrieved" : "search did not return evidence"}`);
    }
  });
  return lines.join("\n");
}

/**
 * Fact-check a document (or explicit claims) against the live web — a CROSS-MCP
 * function: doc-processor extracts the claims, then CALLS the web-search MCP's
 * `get-web-search-summaries` per claim to gather evidence, and (optionally)
 * writes a cited verification report with create-pdf.
 *
 * doc-processor has no LLM, so it GATHERS evidence (sources + a keyword-overlap
 * heuristic) rather than issuing a verdict — the calling agent makes the final
 * support/refute call from the returned evidence.
 *
 * @param {Object|string} input
 * @param {Object} [deps] - { callWebSearchTool } injectable for tests.
 */
export async function factCheck(input, deps = {}) {
  try {
    const params = typeof input === "string" ? JSON.parse(input) : input;
    const callWS = deps.callWebSearchTool || callWebSearchTool;
    const maxClaims = Math.min(20, Math.max(1, parseInt(params.maxClaims, 10) || 8));

    // 1) Gather the claims to check.
    let claims = Array.isArray(params.claims)
      ? params.claims.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim())
      : [];
    let sourceDoc = null;
    if (!claims.length) {
      let text = "";
      if (params.filePath) {
        const proc = await documentProcessor.processDocument(path.resolve(params.filePath), "indepth");
        if (!proc.success) return { success: false, error: `Could not read ${params.filePath}: ${proc.error || "parse failed"}` };
        text = proc.text || "";
        sourceDoc = params.filePath;
      } else if (typeof params.content === "string") {
        text = params.content;
      }
      if (!text.trim()) return { success: false, error: "Provide claims[] OR a filePath/content to extract claims from." };
      claims = extractClaims(text, maxClaims);
      if (!claims.length) return { success: false, error: "No verifiable factual claims found. Pass claims[] explicitly to check specific statements." };
    }
    claims = claims.slice(0, maxClaims);

    // 2) Cross-MCP auth/config (the web-search MCP is keyless — caller brings the Serper key).
    const webSearchUrl = params.webSearchUrl || process.env.WEB_SEARCH_MCP_URL || DEFAULT_WEB_SEARCH_URL;
    const bearer = params.webSearchBearer || process.env.WEB_SEARCH_BEARER;
    const serperKey = params.serperKey || process.env.SERPER_API_KEY;
    if (!bearer) return { success: false, error: "webSearchBearer is required — this tool calls the web-search MCP, which needs a tenant bearer (your web-search demo key)." };
    if (!serperKey) return { success: false, error: "serperKey is required — the web-search MCP needs your Serper key to run the searches." };

    // 3) For each claim, call the web-search MCP and collect evidence (bounded concurrency).
    const results = await mapWithConcurrency(claims, 3, async (claim) => {
      try {
        const r = await callWS({ url: webSearchUrl, bearer, serperKey }, "get-web-search-summaries", { query: claim });
        const { sources, supportScore } = evidenceFromText(claim, r.text || "");
        return { claim, supportScore, sources, evidence: (r.text || "").slice(0, 1200), searchOk: !!r.ok };
      } catch (err) {
        return { claim, supportScore: 0, sources: [], evidence: `search failed: ${err.message}`, searchOk: false };
      }
    });

    const anyOk = results.some((r) => r.searchOk);
    logInsight({
      server: "doc-processor", tool: "fact-check", event: anyOk ? "success" : "failure",
      client: resolveClientProfile(params).clientName, claims: claims.length, sourceDoc,
    });

    // 4) Optional cited report (cross-MCP → write a doc with create-pdf).
    let report = null;
    if (params.generateReport) {
      const md = buildReportMarkdown(results, sourceDoc);
      const pdf = await createPdf({
        title: params.reportTitle || `Fact-Check Report${sourceDoc ? ` — ${path.basename(sourceDoc)}` : ""}`,
        content: md,
        stylePreset: "professional",
        clientHint: params.clientHint,
        uploadUrl: params.uploadUrl,
        uploadAuthHeader: params.uploadAuthHeader,
        uploadFilename: params.uploadFilename,
      });
      report = pdf.success
        ? { filePath: pdf.filePath, downloadUrl: pdf.downloadUrl || null }
        : { error: pdf.error || "report generation failed" };
    }

    return {
      success: true,
      crossMcp: "doc-processor → web-search MCP (get-web-search-summaries) per claim",
      claimsChecked: claims.length,
      sourceDocument: sourceDoc,
      results,
      report,
      note: "supportScore is a ROUGH keyword-overlap heuristic over the retrieved snippets — NOT a verdict. Review the evidence/sources for each claim and make the final support/refute judgment yourself.",
    };
  } catch (err) {
    return { success: false, error: err.message, message: `fact-check failed: ${err.message}` };
  }
}
