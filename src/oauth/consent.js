// Minimal, dependency-free HTML for the OAuth consent / login step.
// The OAuth "user authentication" here is: paste the doc-processor access token
// (the per-tenant bearer minted via the admin API). On submit the form POSTs the
// token plus the carried-through authorization params to the consent route, which
// validates the token and redirects back to the client with an auth code.

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

/**
 * @param {object} opts
 * @param {string} opts.action       form POST target (the consent route)
 * @param {string} opts.clientName   display name of the requesting client
 * @param {Record<string,string>} opts.params  hidden fields carried through the flow
 * @param {string} [opts.error]      optional error message to show
 */
export function renderConsentPage({ action, clientName, params, error }) {
  const hidden = Object.entries(params)
    .map(([k, v]) => `      <input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("\n");

  const errorHtml = error
    ? `<p class="error">${esc(error)}</p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authorize — MCP Document Processor</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           display: grid; place-items: center; min-height: 100vh; margin: 0;
           background: #0b0d12; color: #e7e9ee; }
    .card { width: min(420px, 92vw); background: #151823; border: 1px solid #262b3a;
            border-radius: 14px; padding: 28px 26px; box-shadow: 0 10px 40px rgba(0,0,0,.4); }
    h1 { font-size: 1.15rem; margin: 0 0 4px; }
    p.sub { margin: 0 0 18px; color: #9aa3b2; font-size: .9rem; }
    .client { font-weight: 600; color: #8ab4ff; }
    label { display: block; font-size: .8rem; color: #9aa3b2; margin: 0 0 6px; }
    input[type=password] { width: 100%; box-sizing: border-box; padding: 11px 12px;
            border-radius: 9px; border: 1px solid #2c3242; background: #0e1119;
            color: #e7e9ee; font-size: .95rem; }
    button { width: 100%; margin-top: 16px; padding: 11px; border: 0; border-radius: 9px;
            background: #3b82f6; color: white; font-size: .95rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #2f6fe0; }
    .error { color: #ff8585; font-size: .85rem; margin: 0 0 12px; }
    .hint { color: #6b7280; font-size: .75rem; margin-top: 14px; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Authorize access</h1>
    <p class="sub"><span class="client">${esc(clientName)}</span> is requesting access to your MCP Document Processor.</p>
    ${errorHtml}
    <form method="POST" action="${esc(action)}">
${hidden}
      <label for="tenant_token">Your access token</label>
      <input id="tenant_token" name="tenant_token" type="password" autocomplete="off"
             placeholder="Paste your doc-processor token" required autofocus>
      <button type="submit">Authorize</button>
    </form>
    <p class="hint">Paste the token issued to you by the administrator. It is sent only to this server and exchanged for a scoped session.</p>
  </main>
</body>
</html>`;
}
