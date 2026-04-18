import { afterEach, beforeEach, describe, expect, test } from "vitest";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { setOracleHomeDirOverrideForTest } from "../src/oracleHome.js";
import {
  ackCompletionEnvelope,
  listCompletionEnvelopes,
  pruneCompletionEnvelopes,
  readCompletionEnvelope,
  writeCompletionEnvelope,
} from "../src/completionInbox.js";

describe("completionInbox", () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await mkdtemp(path.join(os.tmpdir(), "oracle-completions-"));
    setOracleHomeDirOverrideForTest(tmpHome);
  });

  afterEach(async () => {
    setOracleHomeDirOverrideForTest(null);
    await rm(tmpHome, { recursive: true, force: true });
  });

  test("writes, lists, and acks completion envelopes", async () => {
    const envelope = await writeCompletionEnvelope({
      sessionId: "sess-1",
      sessionName: "demo-run",
      mode: "browser",
      model: "gpt-5.2-pro",
      answerText: "Final answer body",
      resources: {
        metadata: "oracle-session://sess-1/metadata",
        log: "oracle-session://sess-1/log",
        request: "oracle-session://sess-1/request",
      },
      producerPid: 123,
    });

    const unread = await listCompletionEnvelopes({ unreadOnly: true, limit: 20 });
    expect(unread).toHaveLength(1);
    expect(unread[0]?.id).toBe(envelope.id);
    expect(unread[0]?.preview).toBe("Final answer body");

    const acked = await ackCompletionEnvelope(envelope.id);
    expect(acked?.readAt).toBeTruthy();

    const fetched = await readCompletionEnvelope(envelope.id);
    expect(fetched?.readAt).toBeTruthy();

    const unreadAfterAck = await listCompletionEnvelopes({ unreadOnly: true, limit: 20 });
    expect(unreadAfterAck).toHaveLength(0);
  });

  test("prunes old read envelopes by TTL", async () => {
    const envelope = await writeCompletionEnvelope({
      sessionId: "sess-2",
      sessionName: "old-run",
      mode: "api",
      model: "gpt-5.1",
      answerText: "Old answer",
      resources: {
        metadata: "oracle-session://sess-2/metadata",
        log: "oracle-session://sess-2/log",
        request: "oracle-session://sess-2/request",
      },
    });

    const acked = await ackCompletionEnvelope(envelope.id);
    expect(acked?.readAt).toBeTruthy();

    const fetched = await readCompletionEnvelope(envelope.id);
    expect(fetched).not.toBeNull();
    if (!fetched) {
      throw new Error("completion envelope missing");
    }
    fetched.readAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    fetched.createdAt = fetched.readAt;

    const rewritten = JSON.stringify(fetched, null, 2);
    const envelopePath = path.join(tmpHome, "completion-inbox", `${envelope.id}.json`);
    await writeFile(envelopePath, `${rewritten}\n`, "utf8");

    const deleted = await pruneCompletionEnvelopes();
    expect(deleted).toBe(1);
    expect(await readCompletionEnvelope(envelope.id)).toBeNull();
  });
});
