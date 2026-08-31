import path from "path";
import dotenv from "dotenv";

// Load backend/.env, falling back to the repo-root .env if present.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const bool = (v: string | undefined, fallback: boolean) =>
  v === undefined || v === "" ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase());

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : fallback;
};

const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();

/**
 * Demo Mode is ON when explicitly requested *or* when no Anthropic key exists.
 * In Demo Mode every outbound integration is replaced by a deterministic local
 * engine, so the whole product works with zero credentials.
 */
const demoModeRequested = bool(process.env.DEMO_MODE, true);
const demoMode = demoModeRequested || anthropicKey.length === 0;

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: num(process.env.PORT, 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  jwtSecret: process.env.JWT_SECRET ?? "dev-only-change-me-please-0123456789",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),

  demoMode,
  demoModeRequested,

  anthropicApiKey: anthropicKey,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
  aiEffort: (process.env.AI_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max",

  slackWebhookUrl: (process.env.SLACK_WEBHOOK_URL ?? "").trim(),
  slackChannel: process.env.SLACK_CHANNEL ?? "#luxenails-support",

  slaScanIntervalSeconds: num(process.env.SLA_SCAN_INTERVAL_SECONDS, 60),
  slaWarningThreshold: num(process.env.SLA_WARNING_THRESHOLD, 0.75),

  ragChunkSize: num(process.env.RAG_CHUNK_SIZE, 900),
  ragChunkOverlap: num(process.env.RAG_CHUNK_OVERLAP, 150),
  ragTopK: num(process.env.RAG_TOP_K, 4),
  ragMinScore: num(process.env.RAG_MIN_SCORE, 0.12),
};

/** What the frontend is allowed to know about the runtime configuration. */
export function publicRuntimeConfig() {
  return {
    demoMode: env.demoMode,
    aiProvider: env.demoMode ? "Local Demo Engine" : "Anthropic Claude",
    aiModel: env.demoMode ? "luxenails-demo-v1" : env.anthropicModel,
    aiEffort: env.aiEffort,
    slackConfigured: env.slackWebhookUrl.length > 0 && !env.demoMode,
    slackChannel: env.slackChannel,
    ragTopK: env.ragTopK,
    slaWarningThreshold: env.slaWarningThreshold,
    slaScanIntervalSeconds: env.slaScanIntervalSeconds,
  };
}
