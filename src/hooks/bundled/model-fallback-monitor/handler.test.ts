import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { InternalHookEvent } from "../../../hooks/internal-hooks.js";
import handler from "./handler.js";

// Mock the dependencies
vi.mock("../../../telegram/send.js", () => ({
  sendMessageTelegram: vi.fn().mockResolvedValue({
    messageId: "msg-123",
    chatId: "123456789",
  }),
}));

vi.mock("../../../config/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    agents: {
      defaults: {
        telegramMonitorChat: "123456789",
      },
    },
  }),
}));

vi.mock("../../../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  })),
}));

const { sendMessageTelegram } = await import("../../../telegram/send.js");
const { loadConfig } = await import("../../../config/config.js");

describe("model-fallback-monitor hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should ignore non-model events", async () => {
    const event: InternalHookEvent = {
      type: "command",
      action: "new",
      sessionKey: "test-session",
      context: {},
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    expect(sendMessageTelegram).not.toHaveBeenCalled();
  });

  it("should send notification on model:fallback event with candidate_succeeded", async () => {
    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "candidate_succeeded",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
        attempt: 1,
        total: 3,
      },
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    expect(sendMessageTelegram).toHaveBeenCalledWith(
      "123456789",
      expect.stringContaining("🎯"),
      expect.objectContaining({
        textMode: "markdown",
        silent: true,
      }),
    );

    // Verify message content
    const callArgs = vi.mocked(sendMessageTelegram).mock.calls[0];
    const message = callArgs[1];
    expect(message).toContain("claude-3-opus");
    expect(message).toContain("gpt-4-turbo");
    expect(message).toContain("Success");
  });

  it("should send notification on model:fallback event with candidate_failed and error", async () => {
    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "candidate_failed",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
        attempt: 2,
        total: 3,
        reason: "rate_limit",
        error: "Rate limit exceeded: 1000 requests per minute",
        nextCandidate: { provider: "google", model: "gemini-2.0" },
      },
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    expect(sendMessageTelegram).toHaveBeenCalled();
    const callArgs = vi.mocked(sendMessageTelegram).mock.calls[0];
    const message = callArgs[1];

    expect(message).toContain("⚠️");
    expect(message).toContain("Failed");
    expect(message).toContain("rate_limit");
    expect(message).toContain("Rate limit exceeded");
    expect(message).toContain("gemini-2.0");
  });

  it("should send notification on skip_candidate decision", async () => {
    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "skip_candidate",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "anthropic",
        candidateModel: "claude-3-sonnet",
        attempt: 1,
        total: 2,
        reason: "rate_limit_cooldown",
      },
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    const callArgs = vi.mocked(sendMessageTelegram).mock.calls[0];
    const message = callArgs[1];

    expect(message).toContain("⏭️");
    expect(message).toContain("Skipped");
  });

  it("should send notification on probe_cooldown_candidate", async () => {
    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "probe_cooldown_candidate",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "anthropic",
        candidateModel: "claude-3-opus",
        attempt: 3,
        total: 3,
        reason: "rate_limit",
      },
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    const callArgs = vi.mocked(sendMessageTelegram).mock.calls[0];
    const message = callArgs[1];

    expect(message).toContain("🔍");
    expect(message).toContain("Probing");
  });

  it("should handle missing chat ID gracefully", async () => {
    vi.mocked(loadConfig).mockReturnValueOnce({
      agents: {
        defaults: {},
      },
    });

    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "candidate_succeeded",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
      },
      timestamp: new Date(),
      messages: [],
    };

    // Should not throw
    await handler(event);

    expect(sendMessageTelegram).not.toHaveBeenCalled();
  });

  it("should handle Telegram send errors gracefully", async () => {
    vi.mocked(sendMessageTelegram).mockRejectedValueOnce(new Error("Telegram API error"));

    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "candidate_failed",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
      },
      timestamp: new Date(),
      messages: [],
    };

    // Should not throw
    await handler(event);

    expect(sendMessageTelegram).toHaveBeenCalled();
  });

  it("should include full error message when available", async () => {
    const longError = "This is a very long error message that explains ".repeat(3);
    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "candidate_failed",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
        error: longError,
      },
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    const callArgs = vi.mocked(sendMessageTelegram).mock.calls[0];
    const message = callArgs[1];

    // Error should be truncated to ~100 chars
    expect(message).toContain("...");
    // Verify that truncation happened (error is shortened)
    expect(message).not.toContain(longError);
  });

  it("should display attempt count in message", async () => {
    const event: InternalHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "test-session",
      context: {
        decision: "candidate_failed",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
        attempt: 3,
        total: 5,
      },
      timestamp: new Date(),
      messages: [],
    };

    await handler(event);

    const callArgs = vi.mocked(sendMessageTelegram).mock.calls[0];
    const message = callArgs[1];

    expect(message).toContain("(3/5)");
  });
});
