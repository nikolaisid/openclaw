import { sendMessageTelegram } from "../../../../extensions/telegram/src/send.js";
import { loadConfig } from "../../../config/config.js";
import type { InternalHookHandler } from "../../../hooks/internal-hooks.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";

const log = createSubsystemLogger("model-fallback-monitor");

const handler: InternalHookHandler = async (event) => {
  // Only handle model:fallback events
  if (event.type !== "model" || event.action !== "fallback") {
    return;
  }

  try {
    const cfg = loadConfig();
    const monitorEnabled = cfg?.channels?.telegram?.modelFallbackMonitorEnabled === true;

    if (!monitorEnabled) {
      return;
    }

    const chatId = cfg?.agents?.defaults?.telegramMonitorChat;

    if (!chatId) {
      return;
    }

    // Extract context fields (handle both nested and flat field formats)
    const rawCtx = event.context;

    const ctx = {
      decision: typeof rawCtx.decision === "string" ? rawCtx.decision : "unknown",
      requestedProvider:
        typeof rawCtx.requestedProvider === "string" ? rawCtx.requestedProvider : "unknown",
      requestedModel: typeof rawCtx.requestedModel === "string" ? rawCtx.requestedModel : "unknown",
      candidateProvider:
        typeof rawCtx.candidateProvider === "string" ? rawCtx.candidateProvider : "unknown",
      candidateModel: typeof rawCtx.candidateModel === "string" ? rawCtx.candidateModel : "unknown",
      attempt: typeof rawCtx.attempt === "number" ? rawCtx.attempt : undefined,
      total: typeof rawCtx.total === "number" ? rawCtx.total : undefined,
      reason: typeof rawCtx.reason === "string" ? rawCtx.reason : undefined,
      status: typeof rawCtx.status === "number" ? rawCtx.status : undefined,
      code: typeof rawCtx.code === "string" ? rawCtx.code : undefined,
      error: typeof rawCtx.error === "string" ? rawCtx.error : undefined,
      // Reconstruct nextCandidate from flat fields or direct nextCandidate object
      nextCandidate: (() => {
        const direct = rawCtx.nextCandidate;
        if (
          direct &&
          typeof direct === "object" &&
          typeof (direct as Record<string, unknown>).provider === "string" &&
          typeof (direct as Record<string, unknown>).model === "string"
        ) {
          const obj = direct as Record<string, unknown>;
          return { provider: String(obj.provider), model: String(obj.model) };
        }
        if (
          typeof rawCtx.nextCandidateProvider === "string" &&
          typeof rawCtx.nextCandidateModel === "string"
        ) {
          return {
            provider: rawCtx.nextCandidateProvider,
            model: rawCtx.nextCandidateModel,
          };
        }
        return undefined;
      })(),
    };

    // Build notification message
    const message = buildModelFallbackMessage(ctx);

    // Send to Telegram
    await sendMessageTelegram(String(chatId), message, {
      cfg,
      textMode: "markdown",
      silent: true, // Don't trigger notification sound
    });

    log.info("Model fallback notification sent", {
      decision: ctx.decision,
      candidate: `${ctx.candidateProvider}/${ctx.candidateModel}`,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log.warn("Failed to send model fallback notification", { error: errMsg });
  }
};

function buildModelFallbackMessage(ctx: {
  decision: string;
  requestedProvider: string;
  requestedModel: string;
  candidateProvider: string;
  candidateModel: string;
  attempt?: number;
  total?: number;
  reason?: string;
  status?: number;
  code?: string;
  error?: string;
  nextCandidate?: { provider: string; model: string };
}): string {
  const lines: string[] = [];
  const attemptText = ctx.attempt && ctx.total ? ` (${ctx.attempt}/${ctx.total})` : "";
  lines.push(`*${getDecisionLabel(ctx.decision)}*${attemptText}`);

  const requested = `${ctx.requestedProvider}/${ctx.requestedModel}`;
  const candidate = `${ctx.candidateProvider}/${ctx.candidateModel}`;
  lines.push(`\`${requested}\` -> \`${candidate}\``);

  if (ctx.reason) {
    lines.push(`reason: ${ctx.reason.replace(/_/g, " ")}`);
  }
  if (typeof ctx.status === "number") {
    lines.push(`status: ${ctx.status}${ctx.code ? ` (${ctx.code})` : ""}`);
  } else if (ctx.code) {
    lines.push(`code: ${ctx.code}`);
  }

  if (ctx.decision === "candidate_succeeded") {
    lines.push(`active: \`${candidate}\``);
  } else if (ctx.nextCandidate) {
    lines.push(`next: \`${ctx.nextCandidate.provider}/${ctx.nextCandidate.model}\``);
  }

  const rateLimitSummary = summarizeRateLimit(ctx.error);
  if (rateLimitSummary) {
    lines.push(`rate: ${rateLimitSummary}`);
  }

  if (ctx.error && ctx.decision === "candidate_failed") {
    lines.push(`error: \`${truncateError(ctx.error)}\``);
  }

  return lines.join("\n");
}

function getDecisionLabel(decision: string): string {
  switch (decision) {
    case "candidate_succeeded":
      return "Model fallback switched";
    case "candidate_failed":
      return "Model fallback failed";
    case "skip_candidate":
      return "Model fallback skipped";
    case "probe_cooldown_candidate":
      return "Model fallback probing";
    default:
      return "Model fallback";
  }
}

function truncateError(error: string, max = 120): string {
  const compact = error.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function summarizeRateLimit(error?: string): string | null {
  const text = error?.trim();
  if (!text) {
    return null;
  }
  const lower = text.toLowerCase();
  if (
    !/rate limit|too many requests|\b429\b|retry[_ ]after|tpm|rpm|tokens per|requests per/.test(
      lower,
    )
  ) {
    return null;
  }

  const details: string[] = [];
  const reqLimitCurrent = text.match(
    /requests?\s+per\s+(min(?:ute)?|hour|day).*?limit:\s*([\d.,]+).*?current:\s*([\d.,]+)/i,
  );
  if (reqLimitCurrent) {
    details.push(`req ${reqLimitCurrent[3]}/${reqLimitCurrent[2]} per ${reqLimitCurrent[1]}`);
  }

  const reqCurrentLimit = text.match(
    /request[^\n]{0,60}current:\s*([\d.,]+)[^\n]{0,60}limit:\s*([\d.,]+)/i,
  );
  if (reqCurrentLimit && !reqLimitCurrent) {
    details.push(`req ${reqCurrentLimit[1]}/${reqCurrentLimit[2]}`);
  }

  const tokCurrentLimit = text.match(
    /(?:tokens?\s+per\s+\w+|\btpm\b|token\s+rate\s+limit)[^\n]{0,80}current:\s*([\d.,]+)[^\n]{0,60}limit:\s*([\d.,]+)/i,
  );
  if (tokCurrentLimit) {
    details.push(`tok ${tokCurrentLimit[1]}/${tokCurrentLimit[2]}`);
  }

  const resetAt = text.match(/reset\s+at\s+([^.)\n]+)/i);
  if (resetAt?.[1]) {
    details.push(`reset ${resetAt[1].trim()}`);
  }

  const retryAfter = text.match(
    /retry[_ ]after\s*[:=]?\s*([\d.]+)\s*(ms|s|sec|secs|seconds|m|min|minutes|h|hr|hours)?/i,
  );
  if (retryAfter?.[1]) {
    const amount = retryAfter[1];
    const unit = retryAfter[2]?.toLowerCase() ?? "s";
    details.push(`retry after ${amount}${unit}`);
  }

  if (details.length === 0) {
    return "rate-limited";
  }
  return details.join("; ");
}

export default handler;
