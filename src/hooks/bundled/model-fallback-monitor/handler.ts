import type { InternalHookHandler } from "../../../hooks/internal-hooks.js";
import { sendMessageTelegram } from "../../../telegram/send.js";
import { loadConfig } from "../../../config/config.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";

const log = createSubsystemLogger("model-fallback-monitor");

// Log when handler is loaded
log.debug("model-fallback-monitor handler loaded");

const handler: InternalHookHandler = async (event) => {
  // Log all events received (for debugging)
  log.debug("Event received", { type: event.type, action: event.action });

  // Only handle model:fallback events
  if (event.type !== "model" || event.action !== "fallback") {
    return;
  }

  try {
    log.debug("Processing model fallback event");
    const cfg = loadConfig();
    const chatId = cfg?.agents?.defaults?.telegramMonitorChat;

    if (!chatId) {
      log.debug("Telegram monitor chat not configured");
      return;
    }

    // Extract context fields (handle both nested and flat field formats)
    const rawCtx = event.context as Record<string, unknown>;
    
    // Log raw context for debugging
    log.debug("Raw context fields", {
      decision: rawCtx.decision,
      nextCandidateProvider: rawCtx.nextCandidateProvider,
      nextCandidateModel: rawCtx.nextCandidateModel,
    });

    const ctx = {
      decision: String(rawCtx.decision ?? "unknown"),
      requestedProvider: String(rawCtx.requestedProvider ?? "unknown"),
      requestedModel: String(rawCtx.requestedModel ?? "unknown"),
      candidateProvider: String(rawCtx.candidateProvider ?? "unknown"),
      candidateModel: String(rawCtx.candidateModel ?? "unknown"),
      attempt: typeof rawCtx.attempt === "number" ? rawCtx.attempt : undefined,
      total: typeof rawCtx.total === "number" ? rawCtx.total : undefined,
      reason: rawCtx.reason ? String(rawCtx.reason) : undefined,
      error: rawCtx.error ? String(rawCtx.error) : undefined,
      isPrimary: typeof rawCtx.isPrimary === "boolean" ? rawCtx.isPrimary : undefined,
      // Reconstruct nextCandidate from flat fields
      nextCandidate:
        rawCtx.nextCandidateProvider && rawCtx.nextCandidateModel
          ? {
              provider: String(rawCtx.nextCandidateProvider),
              model: String(rawCtx.nextCandidateModel),
            }
          : undefined,
    };

    log.debug("Sending Telegram notification", { chatId, decision: ctx.decision });

    // Build notification message
    const message = buildModelFallbackMessage(ctx);

    log.debug("Built message", { messageLength: message.length, messagePreview: message.substring(0, 100) });

    // Send to Telegram
    await sendMessageTelegram(String(chatId), message, {
      cfg,
      textMode: "markdown",
      silent: true, // Don't trigger notification sound
    });

    log.debug("Model fallback notification sent successfully", {
      decision: ctx.decision,
      candidate: `${ctx.candidateProvider}/${ctx.candidateModel}`,
      chatId,
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
