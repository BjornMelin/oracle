import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ackCompletionEnvelope,
  listCompletionEnvelopes,
  readCompletionEnvelope,
} from "../../completionInbox.js";

const completionInboxInputSchema = z.object({
  id: z.string().optional().describe("Specific completion inbox item id."),
  unreadOnly: z
    .boolean()
    .optional()
    .describe("When listing, return only unread items (default: true)."),
  limit: z
    .number()
    .optional()
    .describe("When listing, cap the result set (default: 20, max: 500)."),
  ack: z
    .boolean()
    .optional()
    .describe("When fetching by id, mark the item as read before returning it."),
});

const completionInboxEntryShape = z.object({
  id: z.string(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  readAt: z.string().nullable().optional(),
  sessionId: z.string(),
  sessionName: z.string().optional(),
  mode: z.string(),
  model: z.string().optional(),
  status: z.string(),
  preview: z.string(),
});

const completionInboxOutputSchema = {
  entries: z.array(completionInboxEntryShape).optional(),
  total: z.number().optional(),
  item: z
    .object({
      id: z.string(),
      createdAt: z.string(),
      completedAt: z.string().optional(),
      readAt: z.string().nullable().optional(),
      sessionId: z.string(),
      sessionName: z.string().optional(),
      mode: z.string(),
      model: z.string().optional(),
      status: z.string(),
      preview: z.string(),
      answerText: z.string(),
      resources: z.object({
        metadata: z.string(),
        log: z.string(),
        request: z.string(),
      }),
      usage: z
        .object({
          inputTokens: z.number(),
          outputTokens: z.number(),
          reasoningTokens: z.number(),
          totalTokens: z.number(),
          cost: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
} satisfies z.ZodRawShape;

export function registerCompletionInboxTool(server: McpServer): void {
  server.registerTool(
    "completion_inbox",
    {
      title: "List or fetch Oracle completion inbox items",
      description:
        "Inspect completed Oracle responses captured in the durable completion inbox. Use this for runs that finished outside the current MCP tool call, then ack items once consumed.",
      inputSchema: completionInboxInputSchema.shape,
      outputSchema: completionInboxOutputSchema,
    },
    async (input: unknown) => {
      const textContent = (text: string) => [{ type: "text" as const, text }];
      const {
        id,
        unreadOnly = true,
        limit = 20,
        ack = false,
      } = completionInboxInputSchema.parse(input);

      if (id) {
        const item = ack ? await ackCompletionEnvelope(id) : await readCompletionEnvelope(id);
        if (!item) {
          throw new Error(`Completion inbox item "${id}" not found.`);
        }
        return {
          content: textContent(item.answerText),
          structuredContent: { item },
        };
      }

      const entries = await listCompletionEnvelopes({ unreadOnly, limit });
      return {
        content: textContent(
          entries
            .map((entry) => {
              const state = entry.readAt ? "read" : "unread";
              const label = entry.sessionName ?? entry.sessionId;
              return `${entry.createdAt} | ${state} | ${label} | ${entry.preview}`;
            })
            .join("\n"),
        ),
        structuredContent: {
          entries: entries.map((entry) => ({
            id: entry.id,
            createdAt: entry.createdAt,
            completedAt: entry.completedAt,
            readAt: entry.readAt,
            sessionId: entry.sessionId,
            sessionName: entry.sessionName,
            mode: entry.mode,
            model: entry.model,
            status: entry.status,
            preview: entry.preview,
          })),
          total: entries.length,
        },
      };
    },
  );
}
