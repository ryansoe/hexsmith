import Anthropic from "@anthropic-ai/sdk";

import { inngest } from "@/inngest/client";
import { Id } from "../../../../convex/_generated/dataModel";
import { NonRetriableError } from "inngest";
import { convex } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";
import {
  CODING_AGENT_SYSTEM_PROMPT,
  TITLE_GENERATOR_SYSTEM_PROMPT
} from "./constants";
import { DEFAULT_CONVERSATION_TITLE } from "../constants";
import { createReadFilesTool } from './tools/read-files';
import { createListFilesTool } from './tools/list-files';
import { createUpdateFileTool } from './tools/update-file';
import { createCreateFilesTool } from './tools/create-files';
import { createCreateFolderTool } from './tools/create-folder';
import { createRenameFileTool } from './tools/rename-file';
import { createDeleteFilesTool } from './tools/delete-files';
import { createScrapeUrlsTool } from './tools/scrape-urls';

interface MessageEvent {
  messageId: Id<"messages">;
  conversationId: Id<"conversations">;
  projectId: Id<"projects">;
  message: string;
};

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const processMessage = inngest.createFunction(
  {
    id: "process-message",
    cancelOn: [
      {
        event: "message/cancel",
        if: "event.data.messageId == async.data.messageId",
      },
    ],
    onFailure: async ({ event, step }) => {
      const { messageId } = event.data.event.data as MessageEvent;
      const internalKey = process.env.HEXSMITH_CONVEX_INTERNAL_KEY;

      if (internalKey) {
        await step.run("update-message-on-failure", async () => {
          await convex.mutation(api.system.updateMessageContent, {
            internalKey,
            messageId,
            content:
              "My apologies, I encountered an error while processing your request. Let me know if you need anything else!",
          });
        });
      }
    }
  },
  {
    event: "message/sent",
  },
  async ({ event, step }) => {
    const {
      messageId,
      conversationId,
      projectId,
      message
    } = event.data as MessageEvent;

    const internalKey = process.env.HEXSMITH_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      throw new NonRetriableError("HEXSMITH_CONVEX_INTERNAL_KEY is not configured");
    }

    await step.sleep("wait-for-db-sync", "1s");

    const conversation = await step.run("get-conversation", async () => {
      return await convex.query(api.system.getConversationById, {
        internalKey,
        conversationId,
      });
    });

    if (!conversation) {
      throw new NonRetriableError("Conversation not found");
    }

    const recentMessages = await step.run("get-recent-messages", async () => {
      return await convex.query(api.system.getRecentMessages, {
        internalKey,
        conversationId,
        limit: 10,
      });
    });

    let systemPrompt = CODING_AGENT_SYSTEM_PROMPT;

    const contextMessages = recentMessages.filter(
      (msg) => msg._id !== messageId && msg.content.trim() !== ""
    );

    if (contextMessages.length > 0) {
      const historyText = contextMessages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join("\n\n");

      systemPrompt += `\n\n## Previous Conversation (for context only - do NOT repeat these responses):\n${historyText}\n\n## Current Request:\nRespond ONLY to the user's new message below. Do not repeat or reference your previous responses.`;
    }

    // Generate conversation title if still default
    const shouldGenerateTitle = conversation.title === DEFAULT_CONVERSATION_TITLE;

    if (shouldGenerateTitle) {
      const title = await step.run("generate-title", async () => {
        const res = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 50,
          temperature: 0,
          system: TITLE_GENERATOR_SYSTEM_PROMPT,
          messages: [{ role: "user", content: message }],
        });
        const block = res.content[0];
        return block.type === "text" ? block.text.trim() : null;
      });

      if (title) {
        await step.run("update-conversation-title", async () => {
          await convex.mutation(api.system.updateConversationTitle, {
            internalKey,
            conversationId,
            title,
          });
        });
      }
    }

    // Build tools for Anthropic
    const listFilesTool = createListFilesTool({ internalKey, projectId });
    const readFilesTool = createReadFilesTool({ internalKey });
    const updateFileTool = createUpdateFileTool({ internalKey });
    const createFilesTool = createCreateFilesTool({ projectId, internalKey });
    const createFolderTool = createCreateFolderTool({ projectId, internalKey });
    const renameFileTool = createRenameFileTool({ internalKey });
    const deleteFilesTool = createDeleteFilesTool({ internalKey });
    const scrapeUrlsTool = createScrapeUrlsTool();

    const anthropicTools: Anthropic.Tool[] = [
      {
        name: listFilesTool.name,
        description: listFilesTool.description ?? "",
        input_schema: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: readFilesTool.name,
        description: readFilesTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            fileIds: { type: "array", items: { type: "string" }, description: "Array of file IDs to read" },
          },
          required: ["fileIds"],
        },
      },
      {
        name: updateFileTool.name,
        description: updateFileTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            fileId: { type: "string", description: "The ID of the file to update" },
            content: { type: "string", description: "The new content for the file" },
          },
          required: ["fileId", "content"],
        },
      },
      {
        name: createFilesTool.name,
        description: createFilesTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            parentId: { type: "string", description: "Parent folder ID or empty string for root" },
            files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  content: { type: "string" },
                },
                required: ["name", "content"],
              },
            },
          },
          required: ["parentId", "files"],
        },
      },
      {
        name: createFolderTool.name,
        description: createFolderTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Folder name" },
            parentId: { type: "string", description: "Parent folder ID or empty string for root" },
          },
          required: ["name", "parentId"],
        },
      },
      {
        name: renameFileTool.name,
        description: renameFileTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            fileId: { type: "string", description: "File or folder ID to rename" },
            newName: { type: "string", description: "New name" },
          },
          required: ["fileId", "newName"],
        },
      },
      {
        name: deleteFilesTool.name,
        description: deleteFilesTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            fileIds: { type: "array", items: { type: "string" }, description: "Array of file or folder IDs to delete" },
          },
          required: ["fileIds"],
        },
      },
      {
        name: scrapeUrlsTool.name,
        description: scrapeUrlsTool.description ?? "",
        input_schema: {
          type: "object" as const,
          properties: {
            urls: { type: "array", items: { type: "string" }, description: "Array of URLs to scrape" },
          },
          required: ["urls"],
        },
      },
    ];

    // Fake step object so tool handlers' toolStep?.run() actually executes
    const fakeToolStep = {
      run: async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn(),
    };

    // Agentic loop: call Anthropic, handle tool calls, repeat
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: message }
    ];

    let assistantResponse = "I processed your request. Let me know if you need anything else!";
    let iterations = 0;
    const MAX_ITER = 20;

    while (iterations < MAX_ITER) {
      iterations++;
      const iterLabel = `agent-iter-${iterations}`;

      const response = await step.run(iterLabel, async () => {
        return await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          temperature: 0.3,
          system: systemPrompt,
          tools: anthropicTools,
          messages,
        });
      });

      // Add assistant message to history
      messages.push({ role: "assistant", content: response.content });

      // Extract text response if any
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      if (textBlock) {
        assistantResponse = textBlock.text;
      }

      // If stop_reason is "end_turn" with no tool calls, we're done
      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      if (response.stop_reason === "end_turn" && toolUseBlocks.length === 0) {
        break;
      }

      if (toolUseBlocks.length === 0) {
        break;
      }

      // Execute tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolLabel = `tool-${toolUse.name}-${toolUse.id}`;
        const result = await step.run(toolLabel, async () => {
          const params = toolUse.input as Record<string, unknown>;

          switch (toolUse.name) {
            case "listFiles":
              return await listFilesTool.handler({}, { step: fakeToolStep } as never);
            case "readFiles":
              return await readFilesTool.handler(params as never, { step: fakeToolStep } as never);
            case "updateFile":
              return await updateFileTool.handler(params as never, { step: fakeToolStep } as never);
            case "createFiles":
              return await createFilesTool.handler(params as never, { step: fakeToolStep } as never);
            case "createFolder":
              return await createFolderTool.handler(params as never, { step: fakeToolStep } as never);
            case "renameFile":
              return await renameFileTool.handler(params as never, { step: fakeToolStep } as never);
            case "deleteFiles":
              return await deleteFilesTool.handler(params as never, { step: fakeToolStep } as never);
            case "scrapeUrls":
              return await scrapeUrlsTool.handler(params as never, { step: fakeToolStep } as never);
            default:
              return `Unknown tool: ${toolUse.name}`;
          }
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    await step.run("update-assistant-message", async () => {
      await convex.mutation(api.system.updateMessageContent, {
        internalKey,
        messageId,
        content: assistantResponse,
      });
    });

    return { success: true, messageId, conversationId };
  }
);
