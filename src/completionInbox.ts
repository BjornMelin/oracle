import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getOracleHomeDir } from "./oracleHome.js";
import type { SessionMode } from "./sessionManager.js";

export interface CompletionUsageSummary {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost?: number;
}

export interface CompletionEnvelope {
  id: string;
  createdAt: string;
  completedAt?: string;
  readAt?: string | null;
  sessionId: string;
  sessionName?: string;
  mode: SessionMode;
  model?: string;
  status: "completed";
  answerText: string;
  preview: string;
  usage?: CompletionUsageSummary;
  producerPid?: number;
  resources: {
    metadata: string;
    log: string;
    request: string;
  };
}

export interface CreateCompletionEnvelopeInput {
  sessionId: string;
  sessionName?: string;
  completedAt?: string;
  mode: SessionMode;
  model?: string;
  answerText: string;
  usage?: CompletionUsageSummary;
  resources: CompletionEnvelope["resources"];
  producerPid?: number;
}

export interface ListCompletionEnvelopeOptions {
  unreadOnly?: boolean;
  limit?: number;
}

const COMPLETION_INBOX_DIRNAME = "completion-inbox";
const DEFAULT_PREVIEW_MAX_CHARS = 240;
const DEFAULT_RETENTION_HOURS = 24 * 7;

export function getCompletionInboxDir(): string {
  return path.join(getOracleHomeDir(), COMPLETION_INBOX_DIRNAME);
}

function entryPath(id: string): string {
  return path.join(getCompletionInboxDir(), `${id}.json`);
}

export async function ensureCompletionInboxStorage(): Promise<void> {
  await fs.mkdir(getCompletionInboxDir(), { recursive: true });
}

export async function writeCompletionEnvelope(
  input: CreateCompletionEnvelopeInput,
): Promise<CompletionEnvelope> {
  await ensureCompletionInboxStorage();
  await pruneCompletionEnvelopes();
  const now = new Date().toISOString();
  const envelope: CompletionEnvelope = {
    id: randomUUID(),
    createdAt: now,
    completedAt: input.completedAt ?? now,
    readAt: null,
    sessionId: input.sessionId,
    sessionName: input.sessionName,
    mode: input.mode,
    model: input.model,
    status: "completed",
    answerText: input.answerText,
    preview: buildPreview(input.answerText),
    usage: input.usage,
    producerPid: input.producerPid,
    resources: input.resources,
  };
  await fs.writeFile(entryPath(envelope.id), `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  return envelope;
}

export async function readCompletionEnvelope(id: string): Promise<CompletionEnvelope | null> {
  try {
    const raw = await fs.readFile(entryPath(id), "utf8");
    return JSON.parse(raw) as CompletionEnvelope;
  } catch {
    return null;
  }
}

export async function ackCompletionEnvelope(id: string): Promise<CompletionEnvelope | null> {
  const existing = await readCompletionEnvelope(id);
  if (!existing) {
    return null;
  }
  if (existing.readAt) {
    return existing;
  }
  const updated: CompletionEnvelope = {
    ...existing,
    readAt: new Date().toISOString(),
  };
  await fs.writeFile(entryPath(id), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export async function listCompletionEnvelopes(
  options: ListCompletionEnvelopeOptions = {},
): Promise<CompletionEnvelope[]> {
  await ensureCompletionInboxStorage();
  await pruneCompletionEnvelopes();
  const unreadOnly = options.unreadOnly ?? false;
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  const entries = await fs.readdir(getCompletionInboxDir()).catch(() => []);
  const envelopes: CompletionEnvelope[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const envelope = await readCompletionEnvelope(path.basename(entry, ".json"));
    if (!envelope) {
      continue;
    }
    if (unreadOnly && envelope.readAt) {
      continue;
    }
    envelopes.push(envelope);
  }
  return envelopes
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    })
    .slice(0, limit);
}

export async function pruneCompletionEnvelopes(
  retentionHours = DEFAULT_RETENTION_HOURS,
): Promise<number> {
  await ensureCompletionInboxStorage();
  const cutoff = Date.now() - retentionHours * 60 * 60 * 1000;
  const entries = await fs.readdir(getCompletionInboxDir()).catch(() => []);
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    const id = path.basename(entry, ".json");
    const envelope = await readCompletionEnvelope(id);
    if (!envelope) {
      await fs
        .rm(path.join(getCompletionInboxDir(), entry), { force: true })
        .catch(() => undefined);
      deleted += 1;
      continue;
    }
    const ageSource = envelope.readAt ?? envelope.createdAt;
    if (new Date(ageSource).getTime() < cutoff) {
      await fs
        .rm(path.join(getCompletionInboxDir(), entry), { force: true })
        .catch(() => undefined);
      deleted += 1;
    }
  }
  return deleted;
}

function buildPreview(answerText: string): string {
  const normalized = answerText.replace(/\s+/g, " ").trim();
  if (normalized.length <= DEFAULT_PREVIEW_MAX_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, DEFAULT_PREVIEW_MAX_CHARS - 1)}…`;
}
