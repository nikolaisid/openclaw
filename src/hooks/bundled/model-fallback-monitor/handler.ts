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

    log.debug("Sending Telegram notification", { chatId });

    const ctx = event.context as {
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
    };

    // Build notification message
    const message = buildModelFallbackMessage(ctx);

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

  let message = `${decisionEmoji} *Model Fallback*${primaryMarker}${attemptText}\n`;
  message += `Requested: \`${ctx.requestedProvider}/${ctx.requestedModel}\`\n`;
  message += `Candidate: \`${ctx.candidateProvider}/${ctx.candidateModel}\`\n`;

  if (ctx.decision === "candidate_succeeded") {
    message += `✅ *Success* — Model switched to candidate\n`;
  } else if (ctx.decision === "candidate_failed") {
    message += `❌ *Failed*`;
    if (ctx.reason) {
      message += ` — ${ctx.reason}`;
    }
    message += "\n";
    if (ctx.error) {
      const shortError = ctx.error.length > 100 ? ctx.error.substring(0, 97) + "..." : ctx.error;
      message += `Error: \`${shortError}\`\n`;
    }
  } else if (ctx.decision === "skip_candidate") {
    message += `⏭️  *Skipped*`;
    if (ctx.reason) {
      message += ` — ${ctx.reason}`;
    }
    message += "\n";
  } else if (ctx.decision === "probe_cooldown_candidate") {
    message += `🔍 *Probing* cooldown candidate\n`;
    if (ctx.reason) {
      message += `Reason: ${ctx.reason}\n`;
    }
  }

  if (ctx.nextCandidate && ctx.decision !== "candidate_succeeded") {
    message += `Next: \`${ctx.nextCandidate.provider}/${ctx.nextCandidate.model}\``;
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
