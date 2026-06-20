import * as vscode from "vscode";

export function getApiBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("ataCredits")
    .get<string>("apiBaseUrl", "http://127.0.0.1:8787");
}
