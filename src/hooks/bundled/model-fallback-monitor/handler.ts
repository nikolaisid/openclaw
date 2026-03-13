import { loadConfig } from "../../../config/config.js";
import type { InternalHookHandler } from "../../../hooks/internal-hooks.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { sendMessageTelegram } from "../../../telegram/send.js";

const log = createSubsystemLogger("model-fallback-monitor");

const handler: InternalHookHandler = async (event) => {
  // Only handle model:fallback events
  if (event.type !== "model" || event.action !== "fallback") {
    return;
  }

  try {
    const cfg = loadConfig();
    const chatId = cfg?.agents?.defaults?.telegramMonitorChat;

    if (!chatId) {
      return;
    }

    // Extract context fields (handle both nested and flat field formats)
    const rawCtx = event.context;

    const ctx = {
      decision: typeof rawCtx.decision === "string" ? rawCtx.decision : "unknown",
      requestedProvider: typeof rawCtx.requestedProvider === "string" ? rawCtx.requestedProvider : "unknown",
      requestedModel: typeof rawCtx.requestedModel === "string" ? rawCtx.requestedModel : "unknown",
      candidateProvider: typeof rawCtx.candidateProvider === "string" ? rawCtx.candidateProvider : "unknown",
      candidateModel: typeof rawCtx.candidateModel === "string" ? rawCtx.candidateModel : "unknown",
      attempt: typeof rawCtx.attempt === "number" ? rawCtx.attempt : undefined,
      total: typeof rawCtx.total === "number" ? rawCtx.total : undefined,
      reason: typeof rawCtx.reason === "string" ? rawCtx.reason : undefined,
      error: typeof rawCtx.error === "string" ? rawCtx.error : undefined,
      isPrimary: typeof rawCtx.isPrimary === "boolean" ? rawCtx.isPrimary : undefined,
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
        if (typeof rawCtx.nextCandidateProvider === "string" && typeof rawCtx.nextCandidateModel === "string") {
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
  error?: string;
  nextCandidate?: { provider: string; model: string };
  isPrimary?: boolean;
}): string {
  const decisionEmoji = getDecisionEmoji(ctx.decision);
  const attemptText = ctx.attempt && ctx.total ? ` (${ctx.attempt}/${ctx.total})` : "";
  const primaryMarker = ctx.isPrimary ? " [Primary]" : "";

  let message = "";

  // Main header
  message += `${decisionEmoji} *Model Fallback*${primaryMarker}${attemptText}\n\n`;

  // Requested and candidate models
  message += `*Requested:* \`${ctx.requestedProvider}/${ctx.requestedModel}\`\n`;
  message += `*Candidate:* \`${ctx.candidateProvider}/${ctx.candidateModel}\`\n`;

  // Decision-specific content
  if (ctx.decision === "candidate_succeeded") {
    message += `\n✅ *Success* — Model switched to fallback candidate\n`;
  } else if (ctx.decision === "candidate_failed") {
    message += `\n❌ *Failed*`;
    if (ctx.reason) {
      message += ` — ${ctx.reason}`;
    }
    message += "\n";
    if (ctx.error) {
      const shortError = ctx.error.length > 80 ? ctx.error.substring(0, 77) + "..." : ctx.error;
      message += `\n_Error:_ \`${shortError}\``;
    }
  } else if (ctx.decision === "skip_candidate") {
    message += `\n⏭️  *Skipped*`;
    if (ctx.reason) {
      message += ` — ${ctx.reason}`;
    }
  } else if (ctx.decision === "probe_cooldown_candidate") {
    message += `\n🔍 *Probing* cooldown candidate`;
    if (ctx.reason) {
      message += ` — ${ctx.reason}`;
    }
  }

  // Next candidate info
  if (ctx.nextCandidate && ctx.decision !== "candidate_succeeded") {
    message += `\n*Next attempt:* \`${ctx.nextCandidate.provider}/${ctx.nextCandidate.model}\``;
  }

  return message;
}

function getDecisionEmoji(decision: string): string {
  switch (decision) {
    case "candidate_succeeded":
      return "🎯";
    case "candidate_failed":
      return "⚠️";
    case "skip_candidate":
      return "⏭️";
    case "probe_cooldown_candidate":
      return "🔍";
    default:
      return "🔄";
  }
}

export default handler;
