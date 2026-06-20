import * as vscode from "vscode";

function nonce(): string {
  return Math.random().toString(36).slice(2);
}

export function renderWebviewHtml(webview: vscode.Webview): string {
  const scriptNonce = nonce();
  const styleNonce = nonce();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'nonce-${styleNonce}'; script-src 'nonce-${scriptNonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ATA Credits</title>
    <style nonce="${styleNonce}">
      :root {
        color-scheme: light dark;
        --bg: #0f172a;
        --panel: #13203b;
        --panel-soft: #1d2b49;
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #38bdf8;
        --accent-2: #f59e0b;
        --ok: #22c55e;
        --warn: #f97316;
        --border: rgba(148, 163, 184, 0.2);
      }
      body {
        margin: 0;
        padding: 16px;
        font-family: Georgia, "Times New Roman", serif;
        background:
          radial-gradient(circle at top right, rgba(56, 189, 248, 0.2), transparent 30%),
          linear-gradient(180deg, #08111f, var(--bg));
        color: var(--text);
      }
      .stack { display: grid; gap: 14px; }
      .card {
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 14px;
        background: linear-gradient(180deg, rgba(19, 32, 59, 0.98), rgba(8, 17, 31, 0.98));
      }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 20px; }
      h2 { font-size: 15px; margin-bottom: 8px; }
      .muted { color: var(--muted); }
      .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        background: rgba(56, 189, 248, 0.15);
      }
      input, textarea, select {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.8);
        color: var(--text);
        border-radius: 10px;
        padding: 10px 12px;
        font: inherit;
      }
      textarea { min-height: 120px; resize: vertical; }
      button {
        border: 0;
        border-radius: 999px;
        padding: 9px 14px;
        font: inherit;
        cursor: pointer;
        background: linear-gradient(90deg, var(--accent), #0ea5e9);
        color: #04111f;
        font-weight: 700;
      }
      button.secondary {
        background: rgba(148, 163, 184, 0.18);
        color: var(--text);
      }
      button.warn {
        background: linear-gradient(90deg, var(--accent-2), #fb923c);
      }
      pre {
        white-space: pre-wrap;
        margin: 0;
        font-family: Consolas, monospace;
        font-size: 12px;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      li { margin-bottom: 6px; }
      a {
        color: var(--accent);
        text-decoration: none;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .metric {
        padding: 10px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.75);
        border: 1px solid var(--border);
      }
      .label {
        font-size: 11px;
        text-transform: uppercase;
        color: var(--muted);
        letter-spacing: 0.08em;
      }
      .value {
        margin-top: 5px;
        font-size: 18px;
      }
    </style>
  </head>
  <body>
    <div class="stack">
      <div class="card">
        <h1>ATA Credits</h1>
        <p class="muted">Transparent sponsored routing for AI waits inside VS Code.</p>
      </div>

      <div class="card">
        <h2>Login</h2>
        <div class="row">
          <input id="email" type="email" placeholder="you@example.com" />
          <select id="authProvider">
            <option value="email_magic_link">Email Magic Link Mock</option>
            <option value="google_mock">Google Mock</option>
          </select>
          <button id="loginBtn">Login</button>
          <button id="logoutBtn" class="secondary">Logout</button>
        </div>
        <p id="sessionLine" class="muted" style="margin-top:8px;"></p>
      </div>

      <div class="card">
        <h2>Wallet</h2>
        <div id="walletMetrics" class="metrics"></div>
      </div>

      <div class="card">
        <h2>Prompt</h2>
        <textarea id="promptInput" placeholder="Ask the MVP to route this request."></textarea>
        <div class="row" style="margin-top:10px;">
          <button id="runBtn">Run Request</button>
          <button id="refreshBtn" class="secondary">Refresh</button>
          <button id="validateBtn" class="warn">Validate Credits</button>
        </div>
      </div>

      <div class="card">
        <h2>Settings</h2>
        <div class="row">
          <select id="optimizationMode">
            <option value="recommended">Recommended</option>
            <option value="conservative">Conservative</option>
            <option value="off">Off</option>
          </select>
          <input id="countryInput" type="text" placeholder="Country code or label" />
        </div>
        <div class="row" style="margin-top:10px;">
          <label style="display:flex; gap:8px; align-items:center;">
            <input id="adsEnabled" type="checkbox" style="width:auto;" />
            <span>Enable sponsor cards during AI waits</span>
          </label>
          <button id="saveSettingsBtn" class="secondary">Save</button>
        </div>
      </div>

      <div class="card">
        <h2>Route Decision</h2>
        <div id="decision"></div>
      </div>

      <div class="card">
        <h2>Current Sponsor Card</h2>
        <div id="adCard"></div>
      </div>

      <div class="card">
        <h2>Result</h2>
        <pre id="resultText">No request run yet.</pre>
      </div>

      <div class="card">
        <h2>Request History</h2>
        <ul id="requestHistory"></ul>
      </div>

      <div class="card">
        <h2>Ad History</h2>
        <ul id="adHistory"></ul>
      </div>

      <div class="card">
        <h2>Privacy</h2>
        <p>Ads fund the request, but ads never see the request.</p>
        <p class="muted" style="margin-top:8px;">
          Prompts, source code, repo names, files, API keys, and sensitive logs are never sent to ad providers.
        </p>
        <p class="muted" style="margin-top:8px;">
          If user API keys are added later, they stay local to VS Code and are not forwarded to sponsor networks.
        </p>
      </div>
    </div>

    <script nonce="${scriptNonce}">
      const vscode = acquireVsCodeApi();
      let state = {
        loggedIn: false,
        email: "",
        authProvider: "email_magic_link",
        busy: false,
        wallet: null,
        estimate: null,
        ad: null,
        adMessage: "Sponsor cards appear during AI wait time.",
        settings: null,
        requestHistory: [],
        adHistory: [],
        resultText: "No request run yet.",
        info: "Not authenticated."
      };

      const byId = (id) => document.getElementById(id);
      const escapeHtml = (value) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");

      function renderWallet() {
        const wallet = state.wallet;
        if (!wallet) {
          byId("walletMetrics").innerHTML = '<div class="metric"><div class="label">Status</div><div class="value">Login required</div></div>';
          return;
        }
        byId("walletMetrics").innerHTML = [
          ["Available", wallet.availableCreditsUsd],
          ["Pending", wallet.pendingCreditsUsd],
          ["Threshold", wallet.minSponsoredBalanceUsd],
          ["Safety Margin", Math.round(wallet.safetyMarginPercent * 100) + "%"],
          ["Max Sponsored Cost", "$" + (wallet.maxSponsoredCostPerRequestCents / 100).toFixed(2)],
          ["Route", state.estimate ? state.estimate.route : wallet.routePreview]
        ].map(([label, value]) =>
          '<div class="metric"><div class="label">' + escapeHtml(label) + '</div><div class="value">' + escapeHtml(value) + '</div></div>'
        ).join("");
      }

      function renderDecision() {
        if (!state.estimate) {
          byId("decision").innerHTML = '<p class="muted">Run a request to compute the route.</p>';
          return;
        }
        byId("decision").innerHTML = [
          '<div class="row"><span class="pill">Route actuelle : ' + escapeHtml(state.estimate.route) + '</span></div>',
          '<p style="margin-top:8px;">' + escapeHtml(state.estimate.reason) + '</p>',
          '<p class="muted" style="margin-top:8px;">Original context: ' + escapeHtml(state.estimate.originalTokens) + ' tokens</p>',
          '<p class="muted">Optimized context: ' + escapeHtml(state.estimate.optimizedTokens) + ' tokens</p>',
          '<p class="muted">Estimated savings: ' + escapeHtml(state.estimate.estimatedSavingsPercent) + '%</p>',
          '<p class="muted">Estimated cost: ' + escapeHtml(state.estimate.estimatedCostUsd) + '</p>',
          '<p class="muted">Required balance: ' + escapeHtml(state.estimate.requiredBalanceUsd) + '</p>',
          '<p class="muted">Available balance: ' + escapeHtml(state.estimate.availableCreditsUsd) + '</p>'
        ].join("");
      }

      function renderAd() {
        if (!state.ad) {
          byId("adCard").innerHTML =
            '<p class="muted">' + escapeHtml(state.adMessage || "No sponsor card loaded yet.") + '</p>';
          return;
        }
        byId("adCard").innerHTML = [
          '<div class="row"><span class="pill">' + escapeHtml(state.ad.providerName) + '</span><span class="pill">' + escapeHtml(state.ad.sponsoredBy) + '</span></div>',
          '<h3 style="margin-top:8px;">' + escapeHtml(state.ad.headline) + '</h3>',
          '<p class="muted" style="margin-top:8px;">' + escapeHtml(state.ad.body) + '</p>',
          '<p class="muted" style="margin-top:8px;">Pending reward on validation: $' + escapeHtml((state.ad.creditCents / 100).toFixed(2)) + '</p>',
          '<div class="row" style="margin-top:10px;"><button id="openAdBtn">' + escapeHtml(state.ad.cta) + '</button></div>'
        ].join("");
        const openAdBtn = byId("openAdBtn");
        if (openAdBtn) {
          openAdBtn.addEventListener("click", () => {
            vscode.postMessage({ type: "openAd" });
          });
        }
      }

      function renderHistory() {
        byId("requestHistory").innerHTML = state.requestHistory.length
          ? state.requestHistory.map((item) =>
              '<li><strong>' + escapeHtml(item.route) + '</strong> · '
              + escapeHtml(item.status) + ' · '
              + escapeHtml(item.estimatedCostUsd) + '<br />'
              + '<span class="muted">' + escapeHtml(item.promptPreview) + '</span></li>'
            ).join("")
          : '<li class="muted">No requests yet.</li>';

        byId("adHistory").innerHTML = state.adHistory.length
          ? state.adHistory.map((item) =>
              '<li><strong>' + escapeHtml(item.providerName) + '</strong> · '
              + escapeHtml(item.status) + ' · '
              + escapeHtml(item.creditUsd) + '</li>'
            ).join("")
          : '<li class="muted">No ads yet.</li>';
      }

      function render() {
        byId("sessionLine").textContent = state.info || "";
        byId("resultText").textContent = state.resultText || "No request run yet.";
        byId("authProvider").value = state.authProvider || "email_magic_link";
        if (state.settings) {
          byId("optimizationMode").value = state.settings.tokenOptimizationMode;
          byId("countryInput").value = state.settings.country || "";
          byId("adsEnabled").checked = !!state.settings.adsEnabled;
        }
        renderWallet();
        renderDecision();
        renderAd();
        renderHistory();
      }

      window.addEventListener("message", (event) => {
        if (event.data?.type === "state") {
          state = event.data.state;
          render();
        }
      });

      byId("loginBtn").addEventListener("click", () => {
        vscode.postMessage({
          type: "login",
          email: byId("email").value,
          provider: byId("authProvider").value
        });
      });
      byId("logoutBtn").addEventListener("click", () => {
        vscode.postMessage({ type: "logout" });
      });
      byId("runBtn").addEventListener("click", () => {
        vscode.postMessage({ type: "runRequest", prompt: byId("promptInput").value });
      });
      byId("refreshBtn").addEventListener("click", () => {
        vscode.postMessage({ type: "refresh" });
      });
      byId("validateBtn").addEventListener("click", () => {
        vscode.postMessage({ type: "validateCredits" });
      });
      byId("saveSettingsBtn").addEventListener("click", () => {
        vscode.postMessage({
          type: "saveSettings",
          tokenOptimizationMode: byId("optimizationMode").value,
          country: byId("countryInput").value,
          adsEnabled: byId("adsEnabled").checked
        });
      });
    </script>
  </body>
</html>`;
}
