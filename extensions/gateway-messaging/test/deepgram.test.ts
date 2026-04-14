import { describe, expect, it } from "bun:test";
import { applyDeepgramHooks, loadDeepgramFlags } from "../src/deepgram.js";

describe("deepgram feature flags", () => {
  it("reads flags from env", () => {
    const flags = loadDeepgramFlags({
      PI_GATEWAY_DEEPGRAM_STT_ENABLED: "true",
      PI_GATEWAY_DEEPGRAM_TTS_ENABLED: "1",
    });
    expect(flags).toEqual({ sttEnabled: true, ttsEnabled: true });
  });

  it("wires stt/tts hooks behind flags", () => {
    const hooks = applyDeepgramHooks(
      { sttEnabled: true, ttsEnabled: true },
      {
        transcript: "hello from voice",
        requestTts: true,
        finalText: "final answer",
      },
    );
    expect(hooks.sttSummary).toContain("hello from voice");
    expect(hooks.ttsQueued).toBeTrue();
  });

  it("does not queue tts when disabled", () => {
    const hooks = applyDeepgramHooks(
      { sttEnabled: false, ttsEnabled: false },
      {
        transcript: "hello",
        requestTts: true,
        finalText: "final answer",
      },
    );
    expect(hooks.sttSummary).toBeUndefined();
    expect(hooks.ttsQueued).toBeFalse();
  });
});

