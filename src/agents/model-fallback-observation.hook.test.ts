import { describe, it, expect, beforeEach, vi } from "vitest";
import * as hooksModule from "../hooks/internal-hooks.js";
import { logModelFallbackDecision } from "./model-fallback-observation.js";

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: vi.fn(() => ({
    child: vi.fn(() => ({
      warn: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}));

describe("model-fallback-observation: hook triggering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(hooksModule, "triggerInternalHook");
    vi.spyOn(hooksModule, "createInternalHookEvent");
  });

  it("should trigger model:fallback hook on successful fallback candidate", async () => {
    await logModelFallbackDecision({
      decision: "candidate_succeeded",
      requestedProvider: "anthropic",
      requestedModel: "claude-3-opus",
      candidate: { provider: "openai", model: "gpt-4-turbo" },
      attempt: 1,
      total: 2,
    });

    expect(hooksModule.createInternalHookEvent).toHaveBeenCalledWith(
      "model",
      "fallback",
      expect.any(String),
      expect.objectContaining({
        decision: "candidate_succeeded",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
        attempt: 1,
        total: 2,
      }),
    );

    expect(hooksModule.triggerInternalHook).toHaveBeenCalled();
  });

  it("should trigger model:fallback hook on failed fallback candidate", async () => {
    await logModelFallbackDecision({
      decision: "candidate_failed",
      requestedProvider: "anthropic",
      requestedModel: "claude-3-opus",
      candidate: { provider: "openai", model: "gpt-4-turbo" },
      error: "Rate limit exceeded",
      reason: "rate_limit",
      attempt: 2,
      total: 3,
    });

    expect(hooksModule.createInternalHookEvent).toHaveBeenCalledWith(
      "model",
      "fallback",
      expect.any(String),
      expect.objectContaining({
        decision: "candidate_failed",
        error: "Rate limit exceeded",
        reason: "rate_limit",
      }),
    );

    expect(hooksModule.triggerInternalHook).toHaveBeenCalled();
  });

  it("should trigger hook on skip_candidate decision", async () => {
    await logModelFallbackDecision({
      decision: "skip_candidate",
      requestedProvider: "anthropic",
      requestedModel: "claude-3-opus",
      candidate: { provider: "anthropic", model: "claude-3-sonnet" },
      reason: "rate_limit_cooldown",
    });

    expect(hooksModule.createInternalHookEvent).toHaveBeenCalledWith(
      "model",
      "fallback",
      expect.any(String),
      expect.objectContaining({
        decision: "skip_candidate",
        reason: "rate_limit_cooldown",
      }),
    );

    expect(hooksModule.triggerInternalHook).toHaveBeenCalled();
  });

  it("should include all context fields in hook event", async () => {
    await logModelFallbackDecision({
      decision: "candidate_failed",
      runId: "run-123",
      requestedProvider: "anthropic",
      requestedModel: "claude-3-opus",
      candidate: { provider: "openai", model: "gpt-4-turbo" },
      attempt: 2,
      total: 3,
      reason: "rate_limit",
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      error: "Too many requests",
      nextCandidate: { provider: "google", model: "gemini-2.0" },
      isPrimary: false,
      requestedModelMatched: false,
      fallbackConfigured: true,
    });

    const callArgs = vi.mocked(hooksModule.createInternalHookEvent).mock.calls[0];
    const context = callArgs[3] as Record<string, unknown>;

    expect(context).toEqual({
      decision: "candidate_failed",
      requestedProvider: "anthropic",
      requestedModel: "claude-3-opus",
      candidateProvider: "openai",
      candidateModel: "gpt-4-turbo",
      attempt: 2,
      total: 3,
      reason: "rate_limit",
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      error: "Too many requests",
      nextCandidate: { provider: "google", model: "gemini-2.0" },
      isPrimary: false,
      requestedModelMatched: false,
      fallbackConfigured: true,
    });
  });
});
