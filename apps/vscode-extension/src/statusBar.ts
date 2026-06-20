import * as vscode from "vscode";
import type { EstimateResponse, WalletResponse } from "@atacredits/shared";

export class AtaCreditsStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

  constructor() {
    this.item.command = "ataCredits.refresh";
    this.item.show();
  }

  update(input: {
    loggedIn: boolean;
    wallet: WalletResponse | null;
    estimate: EstimateResponse | null;
    busy: boolean;
  }): void {
    if (!input.loggedIn) {
      this.item.text = "ATA Credits: sign in";
      this.item.tooltip = "Login to load sponsored credits and routing.";
      return;
    }

    const wallet = input.wallet;
    const route = input.estimate?.route ?? wallet?.routePreview ?? "official";
    if (!wallet) {
      this.item.text = "ATA Credits: loading";
      this.item.tooltip = "Loading wallet and route state.";
      return;
    }

    this.item.text =
      `Sponsored: ${wallet.availableCreditsUsd} / ${wallet.minSponsoredBalanceUsd}`
      + ` | Route: ${route === "sponsored" ? "Sponsored" : "Official"}`
      + (input.busy ? " | Running" : "");
    this.item.tooltip = [
      `Available: ${wallet.availableCreditsUsd}`,
      `Pending: ${wallet.pendingCreditsUsd}`,
      `Route preview: ${route}`
    ].join("\n");
  }

  dispose(): void {
    this.item.dispose();
  }
}
