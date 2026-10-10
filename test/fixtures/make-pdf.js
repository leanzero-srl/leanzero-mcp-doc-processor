// Generated test fixtures — replaces the personal PDFs that used to sit in
// testfiles/ (removed 2026-10-10). Builds a small, valid, text-layer PDF from
// scratch (Helvetica, one page, correct xref offsets) so no binary fixture has
// to live in the repo and no real document is needed to run the tests.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Default fixture text: >100 characters, a heading-like first line, numbers. */
export const SAMPLE_LINES = [
  "Quarterly Operations Report",
  "Revenue grew 18% in Q2 2026 compared with the previous quarter.",
  "The support team closed 412 tickets with a median response time of 3 hours.",
  "Two new markets were opened and onboarding time dropped to 5 days.",
];

/**
 * Build a one-page PDF whose text layer contains `lines` (Latin-1 only).
 * @param {string[]} [lines]
 * @returns {Buffer}
 */
export function makeTextPdf(lines = SAMPLE_LINES) {
  const esc = (t) => String(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const content = ["BT", "/F1 11 Tf", "16 TL", "72 740 Td", ...lines.map((l) => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Where the evaluation scenarios expect the generated sample PDF. */
export const GENERATED_DIR = path.join(here, "generated");
export const SAMPLE_PDF = path.join(GENERATED_DIR, "sample.pdf");

/** Write test/fixtures/generated/sample.pdf (idempotent) and return its path. */
export function ensureSampleFixtures() {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(SAMPLE_PDF, makeTextPdf());
  return SAMPLE_PDF;
}
