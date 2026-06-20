import {
  estimateTokenCount,
  type OptimizationMode,
  type OptimizedPromptContext,
  type PromptContext
} from "@atacredits/shared";

export interface TokenOptimizer {
  optimize(
    input: PromptContext,
    mode: OptimizationMode
  ): Promise<OptimizedPromptContext>;
}

function removeRepeatedLines(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim();
      if (!normalized) return true;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join("\n");
}

function compactWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripVerboseLogs(text: string, aggressive: boolean): { prompt: string; removed: boolean } {
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const lower = line.trim().toLowerCase();
    if (!aggressive && lower.startsWith("error")) return true;
    if (lower.startsWith("trace:") || lower.startsWith("debug:")) return false;
    if (aggressive && (lower.startsWith("log:") || lower.startsWith("stack:"))) return false;
    return true;
  });
  return {
    prompt: kept.join("\n"),
    removed: kept.length !== lines.length
  };
}

export class BasicTokenOptimizer implements TokenOptimizer {
  async optimize(
    input: PromptContext,
    mode: OptimizationMode
  ): Promise<OptimizedPromptContext> {
    const originalTokens = estimateTokenCount(input.prompt);
    if (mode === "off") {
      return {
        prompt: input.prompt,
        mode,
        originalTokens,
        optimizedTokens: originalTokens,
        savingsPercent: 0,
        notes: ["Optimization disabled."]
      };
    }

    const notes: string[] = [];
    const logPass = stripVerboseLogs(input.prompt, mode === "recommended");
    let optimized = logPass.prompt;
    if (logPass.removed) {
      notes.push("Dropped repetitive log-heavy lines.");
    }

    const deduped = removeRepeatedLines(optimized);
    if (deduped !== optimized) {
      notes.push("Removed duplicated context lines.");
      optimized = deduped;
    }

    const compacted = compactWhitespace(optimized);
    if (compacted !== optimized) {
      notes.push("Compacted whitespace and blank sections.");
      optimized = compacted;
    }

    const optimizedTokens = estimateTokenCount(optimized);
    const savingsPercent = originalTokens === 0
      ? 0
      : Math.max(0, Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100));

    if (notes.length === 0) {
      notes.push("No safe optimization opportunity found.");
    }

    return {
      prompt: optimized,
      mode,
      originalTokens,
      optimizedTokens,
      savingsPercent,
      notes
    };
  }
}

export class HeadroomOptimizer implements TokenOptimizer {
  constructor(private readonly fallback: TokenOptimizer = new BasicTokenOptimizer()) {}

  async optimize(
    input: PromptContext,
    mode: OptimizationMode
  ): Promise<OptimizedPromptContext> {
    const result = await this.fallback.optimize(input, mode);
    return {
      ...result,
      notes: [...result.notes, "Headroom adapter not wired yet. Using BasicTokenOptimizer."]
    };
  }
}
