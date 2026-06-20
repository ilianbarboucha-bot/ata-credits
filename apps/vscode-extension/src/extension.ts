import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type {
  AdHistoryItem,
  AuthProvider,
  EstimateResponse,
  RequestHistoryItem,
  SettingsResponse,
  SponsorCard,
  WalletResponse
} from "@atacredits/shared";
import { AtaCreditsApiClient } from "./api.js";
import { getApiBaseUrl } from "./config.js";
import { LocalOfficialAiClient } from "./officialClient.js";
import { AtaCreditsStatusBar } from "./statusBar.js";
import { renderWebviewHtml } from "./webview/html.js";

const SESSION_TOKEN_KEY = "ataCredits.sessionToken";
const SESSION_EMAIL_KEY = "ataCredits.sessionEmail";
const SESSION_PROVIDER_KEY = "ataCredits.sessionProvider";
const INSTALLATION_ID_KEY = "ataCredits.installationId";

interface ViewState {
  loggedIn: boolean;
  email: string;
  authProvider: AuthProvider;
  busy: boolean;
  wallet: WalletResponse | null;
  estimate: EstimateResponse | null;
  ad: SponsorCard | null;
  adMessage: string;
  settings: SettingsResponse | null;
  requestHistory: RequestHistoryItem[];
  adHistory: AdHistoryItem[];
  resultText: string;
  info: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAuthProvider(value: unknown): AuthProvider {
  return value === "google_mock" ? "google_mock" : "email_magic_link";
}

class AtaCreditsViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private readonly api = new AtaCreditsApiClient(() => getApiBaseUrl());
  private readonly officialClient = new LocalOfficialAiClient();
  private readonly statusBar = new AtaCreditsStatusBar();
  private readonly installationId: string;

  private state: ViewState = {
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

  constructor(private readonly context: vscode.ExtensionContext) {
    this.installationId = this.getOrCreateInstallationId();
  }

  dispose(): void {
    this.statusBar.dispose();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };
    webviewView.webview.html = renderWebviewHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((message) => {
      void this.handleMessage(message);
    });
    void this.refresh();
  }

  async promptForRequest(): Promise<void> {
    const prompt = await vscode.window.showInputBox({
      prompt: "Prompt to route through ATA Credits",
      placeHolder: "Summarize this bug and propose a fix."
    });
    if (!prompt) return;
    await this.runRequest(prompt);
  }

  async login(email?: string, provider: AuthProvider = "email_magic_link"): Promise<void> {
    const chosenEmail = email?.trim()
      || await vscode.window.showInputBox({
        prompt: "Email used for ATA Credits mock login",
        placeHolder: "you@example.com"
      });
    if (!chosenEmail) return;

    this.state.busy = true;
    this.pushState();
    try {
      const session = await this.api.login(chosenEmail, provider);
      await this.context.globalState.update(SESSION_TOKEN_KEY, session.sessionToken);
      await this.context.globalState.update(SESSION_EMAIL_KEY, session.user.email);
      await this.context.globalState.update(SESSION_PROVIDER_KEY, provider);
      this.state.loggedIn = true;
      this.state.email = session.user.email;
      this.state.authProvider = provider;
      this.state.wallet = session.wallet;
      this.state.settings = session.settings;
      this.state.info =
        `Signed in as ${session.user.email} via ${
          provider === "google_mock" ? "Google Mock" : "Email Magic Link Mock"
        }.`;
      await this.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `ATA Credits login failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.busy = false;
      this.pushState();
    }
  }

  async logout(): Promise<void> {
    await this.context.globalState.update(SESSION_TOKEN_KEY, undefined);
    await this.context.globalState.update(SESSION_EMAIL_KEY, undefined);
    await this.context.globalState.update(SESSION_PROVIDER_KEY, undefined);
    this.state = {
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
      info: "Logged out."
    };
    this.pushState();
  }

  async validateCredits(): Promise<void> {
    const token = this.getSessionToken();
    if (!token) {
      await this.login();
      return;
    }
    try {
      this.state.busy = true;
      this.pushState();
      let result = await this.api.validateCredits(token);
      if (result.processed === 0 && result.wallet.pendingCreditsCents > 0) {
        await delay(3_200);
        result = await this.api.validateCredits(token);
      }
      this.state.wallet = result.wallet;
      const validationInfo = result.processed === 0 && result.wallet.pendingCreditsCents > 0
        ? "Pending sponsor credits are still settling. Retry validation in a few seconds."
        : `Validated ${result.confirmed} credits, rejected ${result.rejected}, processed ${result.processed}.`;
      await this.refresh(validationInfo);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Credit validation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.state.busy = false;
      this.pushState();
    }
  }

  async refresh(infoOverride?: string): Promise<void> {
    const token = this.getSessionToken();
    const email = this.context.globalState.get<string>(SESSION_EMAIL_KEY) ?? "";
    const provider = normalizeAuthProvider(
      this.context.globalState.get<string>(SESSION_PROVIDER_KEY) ?? "email_magic_link"
    );
    if (!token) {
      this.state.loggedIn = false;
      this.state.email = email;
      this.state.authProvider = provider;
      this.state.wallet = null;
      this.state.settings = null;
      this.state.requestHistory = [];
      this.state.adHistory = [];
      this.state.ad = null;
      this.state.adMessage = "Sponsor cards appear during AI wait time.";
      this.state.info = "Not authenticated.";
      this.pushState();
      return;
    }

    try {
      const [wallet, settings, requestHistory, adHistory] = await Promise.all([
        this.api.getWallet(token),
        this.api.getSettings(token),
        this.api.getRequestHistory(token),
        this.api.getAdHistory(token)
      ]);
      this.state.loggedIn = true;
      this.state.email = email;
      this.state.authProvider = provider;
      this.state.wallet = wallet;
      this.state.settings = settings;
      this.state.requestHistory = requestHistory.items;
      this.state.adHistory = adHistory.items;
      if (!settings.adsEnabled) {
        this.state.ad = null;
        this.state.adMessage = "Ads are disabled. Recharge is paused until ads are enabled again.";
      } else if (!this.state.ad) {
        this.state.adMessage = "Sponsor cards appear during AI wait time.";
      }
      this.state.info = infoOverride ?? `Signed in as ${email}. Backend: ${getApiBaseUrl()}`;
    } catch (error) {
      this.state.info = `Refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    this.pushState();
  }

  async runRequest(prompt: string): Promise<void> {
    const token = this.getSessionToken();
    if (!token) {
      await this.login();
      return;
    }
    if (!prompt.trim()) {
      void vscode.window.showWarningMessage("Enter a prompt first.");
      return;
    }

    try {
      this.state.busy = true;
      this.state.resultText = "Request in progress...";
      this.pushState();

      const estimate = await this.api.estimate(token, {
        prompt,
        mode: this.state.settings?.tokenOptimizationMode ?? "recommended"
      });
      this.state.estimate = estimate;

      const adResponse = await this.api.requestAd(token, {
        route: estimate.route,
        sessionId: this.installationId
      });
      this.state.ad = adResponse.ad;
      this.state.adMessage = adResponse.message;
      if (adResponse.ad) {
        await this.api.trackImpression(token, {
          adId: adResponse.ad.adId,
          campaignId: adResponse.ad.campaignId,
          providerName: adResponse.ad.providerName,
          sessionId: this.installationId
        });
      }

      if (estimate.route === "sponsored") {
        const response = await this.api.sponsoredRequest(token, {
          prompt,
          sessionId: this.installationId,
          mode: this.state.settings?.tokenOptimizationMode ?? "recommended"
        });
        this.state.resultText = response.text;
        this.state.wallet = response.wallet;
        const routeInfo = "Route actuelle : Sponsored. This request was covered by sponsored credits.";
        this.state.info = routeInfo;
        await this.refresh(routeInfo);
      } else {
        const localResponse = await this.officialClient.run(prompt);
        this.state.resultText = localResponse.text;
        const routeInfo =
          "Route actuelle : Official. Sponsored credits are insufficient. Your normal setup keeps working.";
        this.state.info = routeInfo;
        await this.api.logOfficialRequest(token, {
          prompt,
          responseText: localResponse.text,
          model: localResponse.model,
          estimate
        });
        await this.refresh(routeInfo);
      }
    } catch (error) {
      this.state.ad = null;
      this.state.resultText = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`
      );
      this.pushState();
    } finally {
      this.state.busy = false;
      this.pushState();
    }
  }

  async openCurrentAd(): Promise<void> {
    const token = this.getSessionToken();
    const ad = this.state.ad;
    if (!token || !ad) return;
    await this.api.trackClick(token, {
      adId: ad.adId,
      campaignId: ad.campaignId,
      providerName: ad.providerName,
      href: ad.href
    });
    await vscode.env.openExternal(vscode.Uri.parse(ad.href));
  }

  async saveSettings(input: {
    tokenOptimizationMode: string;
    country: string;
    adsEnabled: boolean;
  }): Promise<void> {
    const token = this.getSessionToken();
    if (!token) return;
    if (
      input.tokenOptimizationMode !== "recommended"
      && input.tokenOptimizationMode !== "conservative"
      && input.tokenOptimizationMode !== "off"
    ) {
      return;
    }
    try {
      this.state.settings = await this.api.updateSettings(token, {
        tokenOptimizationMode: input.tokenOptimizationMode,
        country: input.country.trim() || undefined,
        adsEnabled: input.adsEnabled
      });
      if (!this.state.settings.adsEnabled) {
        this.state.ad = null;
        this.state.adMessage = "Ads are disabled. Recharge is paused until ads are enabled again.";
      } else {
        this.state.adMessage = "Sponsor cards appear during AI wait time.";
      }
      this.state.info =
        `Settings updated. Optimization: ${input.tokenOptimizationMode}. Ads ${
          input.adsEnabled ? "enabled" : "disabled"
        }.`;
      this.pushState();
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Saving settings failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== "object") return;
    const body = message as Record<string, unknown>;
    switch (body.type) {
      case "login":
        await this.login(
          typeof body.email === "string" ? body.email : undefined,
          normalizeAuthProvider(body.provider)
        );
        break;
      case "logout":
        await this.logout();
        break;
      case "refresh":
        await this.refresh();
        break;
      case "validateCredits":
        await this.validateCredits();
        break;
      case "runRequest":
        await this.runRequest(typeof body.prompt === "string" ? body.prompt : "");
        break;
      case "openAd":
        await this.openCurrentAd();
        break;
      case "saveSettings":
        await this.saveSettings({
          tokenOptimizationMode:
            typeof body.tokenOptimizationMode === "string"
              ? body.tokenOptimizationMode
              : "",
          country: typeof body.country === "string" ? body.country : "",
          adsEnabled: typeof body.adsEnabled === "boolean" ? body.adsEnabled : true
        });
        break;
      default:
        break;
    }
  }

  private pushState(): void {
    this.statusBar.update({
      loggedIn: this.state.loggedIn,
      wallet: this.state.wallet,
      estimate: this.state.estimate,
      busy: this.state.busy
    });
    this.view?.webview.postMessage({
      type: "state",
      state: this.state
    });
  }

  private getSessionToken(): string | null {
    return this.context.globalState.get<string>(SESSION_TOKEN_KEY) ?? null;
  }

  private getOrCreateInstallationId(): string {
    const existing = this.context.globalState.get<string>(INSTALLATION_ID_KEY);
    if (existing) return existing;
    const value = randomUUID();
    void this.context.globalState.update(INSTALLATION_ID_KEY, value);
    return value;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const provider = new AtaCreditsViewProvider(context);
  context.subscriptions.push(provider);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("ataCredits.sidebar", provider),
    vscode.commands.registerCommand("ataCredits.login", async () => {
      await provider.login();
    }),
    vscode.commands.registerCommand("ataCredits.logout", async () => {
      await provider.logout();
    }),
    vscode.commands.registerCommand("ataCredits.refresh", async () => {
      await provider.refresh();
    }),
    vscode.commands.registerCommand("ataCredits.runPrompt", async () => {
      await provider.promptForRequest();
    }),
    vscode.commands.registerCommand("ataCredits.validateCredits", async () => {
      await provider.validateCredits();
    })
  );
}

export function deactivate(): void {}
