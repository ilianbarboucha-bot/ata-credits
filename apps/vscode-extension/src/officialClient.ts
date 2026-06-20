export class LocalOfficialAiClient {
  async run(prompt: string): Promise<{ model: string; text: string }> {
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      model: "local-official-demo",
      text: [
        "Official route kept working locally in this MVP.",
        "",
        "This path does not use the sponsored gateway.",
        "",
        `Prompt summary: ${prompt.replace(/\s+/g, " ").trim().slice(0, 180)}`
      ].join("\n")
    };
  }
}
