import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LoggingMessageNotificationParamsSchema } from "@modelcontextprotocol/sdk/types.js";
import { listCompletionEnvelopes } from "../completionInbox.js";

const POLL_INTERVAL_MS = 5_000;

export function startCompletionInboxWatcher(server: McpServer): () => void {
  const seenUnreadIds = new Set<string>();
  let stopped = false;

  const tick = async (primeOnly = false) => {
    try {
      const unread = await listCompletionEnvelopes({ unreadOnly: true, limit: 200 });
      const currentIds = new Set(unread.map((entry) => entry.id));
      for (const id of seenUnreadIds) {
        if (!currentIds.has(id)) {
          seenUnreadIds.delete(id);
        }
      }
      for (const entry of unread) {
        const alreadySeen = seenUnreadIds.has(entry.id);
        seenUnreadIds.add(entry.id);
        if (primeOnly || alreadySeen || entry.producerPid === process.pid) {
          continue;
        }
        await server.server
          .sendLoggingMessage(
            LoggingMessageNotificationParamsSchema.parse({
              level: "info",
              data: {
                text: `Oracle completion ready · ${entry.sessionName ?? entry.sessionId} · ${entry.preview}`,
                completionId: entry.id,
                sessionId: entry.sessionId,
              },
            }),
          )
          .catch(() => {});
      }
    } catch {
      // best effort only
    }
  };

  void tick(true);
  const timer = setInterval(() => {
    if (stopped) {
      return;
    }
    void tick(false);
  }, POLL_INTERVAL_MS);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
