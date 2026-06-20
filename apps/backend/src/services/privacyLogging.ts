import { previewText } from "@atacredits/shared";

export function privacySafePromptPreview(): string {
  return "Prompt hidden by privacy default.";
}

export function privacySafeResponsePreview(responseText: string): string {
  const trimmed = previewText(responseText, 100);
  if (!trimmed) {
    return "Response hidden by privacy default.";
  }
  return "Response stored in minimized form for history.";
}

export function privacySafePromptMetadata(prompt: string): string {
  return JSON.stringify({
    chars: prompt.length,
    lines: prompt.split(/\r?\n/).length
  });
}
