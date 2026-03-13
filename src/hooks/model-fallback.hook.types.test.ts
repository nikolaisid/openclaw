import { describe, it, expect } from "vitest";
import type { ModelFallbackHookEvent, ModelFallbackHookContext } from "../hooks/internal-hooks.js";

describe("model-fallback hook types", () => {
  it("should have correct ModelFallbackHookContext structure", () => {
    const context: ModelFallbackHookContext = {
      decision: "candidate_succeeded",
      requestedProvider: "anthropic",
      requestedModel: "claude-3-opus",
      candidateProvider: "openai",
      candidateModel: "gpt-4-turbo",
      attempt: 1,
      total: 2,
      reason: undefined,
      error: undefined,
      nextCandidate: { provider: "google", model: "gemini-2.0" },
    };

    expect(context.decision).toBe("candidate_succeeded");
    expect(context.candidateProvider).toBe("openai");
    expect(context.candidateModel).toBe("gpt-4-turbo");
    expect(context.attempt).toBe(1);
  });

  it("should have correct ModelFallbackHookEvent structure", () => {
    const event: ModelFallbackHookEvent = {
      type: "model",
      action: "fallback",
      sessionKey: "session-123",
      timestamp: new Date(),
      messages: [],
      context: {
        decision: "candidate_failed",
        requestedProvider: "anthropic",
        requestedModel: "claude-3-opus",
        candidateProvider: "openai",
        candidateModel: "gpt-4-turbo",
        attempt: 2,
        total: 3,
        error: "Rate limit exceeded",
      },
    };

    expect(event.type).toBe("model");
    expect(event.action).toBe("fallback");
    expect(event.context.decision).toBe("candidate_failed");
  });

  it("should accept all decision types", () => {
    const decisions: ModelFallbackHookContext["decision"][] = [
      "skip_candidate",
      "probe_cooldown_candidate",
      "candidate_failed",
      "candidate_succeeded",
    ];

    for (const decision of decisions) {
      const context: ModelFallbackHookContext = {
        decision,
        requestedProvider: "test",
        requestedModel: "test",
        candidateProvider: "test",
        candidateModel: "test",
        attempt: 1,
        total: 2,
      };
      expect(context.decision).toBe(decision);
    }
  });
});
