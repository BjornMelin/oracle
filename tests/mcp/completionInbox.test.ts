import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompletionEnvelope } from "../../src/completionInbox.js";

const listCompletionEnvelopes = vi.fn(async () => [] as CompletionEnvelope[]);
const readCompletionEnvelope = vi.fn(async () => null as CompletionEnvelope | null);
const ackCompletionEnvelope = vi.fn(async () => null as CompletionEnvelope | null);

vi.mock("../../src/completionInbox.js", async () => {
  const original = await vi.importActual<typeof import("../../src/completionInbox.js")>(
    "../../src/completionInbox.js",
  );
  return {
    ...original,
    listCompletionEnvelopes,
    readCompletionEnvelope,
    ackCompletionEnvelope,
  };
});

const { registerCompletionInboxTool } = await import("../../src/mcp/tools/completionInbox.ts");

describe("completion_inbox MCP tool", () => {
  let handler: ((input: unknown) => Promise<unknown>) | null = null;

  beforeEach(() => {
    listCompletionEnvelopes.mockReset();
    readCompletionEnvelope.mockReset();
    ackCompletionEnvelope.mockReset();
    handler = null;
    registerCompletionInboxTool({
      registerTool: (_name: string, _def: unknown, fn: (input: unknown) => Promise<unknown>) => {
        handler = fn;
      },
    } as unknown as Parameters<typeof registerCompletionInboxTool>[0]);
    if (!handler) throw new Error("handler not registered");
  });

  it("lists unread completion inbox items by default", async () => {
    listCompletionEnvelopes.mockResolvedValue([
      {
        id: "c1",
        createdAt: "2026-04-17T00:00:00Z",
        sessionId: "sess-1",
        sessionName: "demo-run",
        mode: "browser",
        model: "gpt-5.2-pro",
        status: "completed",
        answerText: "Final answer body",
        preview: "Final answer body",
        resources: {
          metadata: "oracle-session://sess-1/metadata",
          log: "oracle-session://sess-1/log",
          request: "oracle-session://sess-1/request",
        },
      } satisfies CompletionEnvelope,
    ]);

    const result = (await handler?.({})) as {
      structuredContent: { entries: Array<{ id: string; sessionId: string }> };
    };
    expect(listCompletionEnvelopes).toHaveBeenCalledWith({ unreadOnly: true, limit: 20 });
    expect(result.structuredContent.entries[0]?.id).toBe("c1");
    expect(result.structuredContent.entries[0]?.sessionId).toBe("sess-1");
  });

  it("reads and acks a specific completion item", async () => {
    ackCompletionEnvelope.mockResolvedValue({
      id: "c2",
      createdAt: "2026-04-17T00:00:00Z",
      completedAt: "2026-04-17T00:01:00Z",
      readAt: "2026-04-17T00:02:00Z",
      sessionId: "sess-2",
      sessionName: "acked-run",
      mode: "api",
      model: "gpt-5.1",
      status: "completed",
      answerText: "Answer text",
      preview: "Answer text",
      resources: {
        metadata: "oracle-session://sess-2/metadata",
        log: "oracle-session://sess-2/log",
        request: "oracle-session://sess-2/request",
      },
    } satisfies CompletionEnvelope);

    const result = (await handler?.({ id: "c2", ack: true })) as {
      structuredContent: { item: CompletionEnvelope };
    };
    expect(ackCompletionEnvelope).toHaveBeenCalledWith("c2");
    expect(result.structuredContent.item.id).toBe("c2");
    expect(result.structuredContent.item.readAt).toBeTruthy();
  });
});
