import { generateText } from "ai";
import { inngest } from "./client";
import { anthropic } from "@ai-sdk/anthropic";

export const demoGenerate = inngest.createFunction(
  { id: "demo-generate" },
  { event: "demo/generate" },
  async ({ step }) => {
    return await step.run("generate-text", async () => {
      const response = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        prompt: "Write a vegetarian lasagna recipe for 4 people.",
      });
      return response;
    });
  }
);
