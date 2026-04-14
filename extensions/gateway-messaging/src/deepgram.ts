export interface DeepgramFlags {
  readonly sttEnabled: boolean;
  readonly ttsEnabled: boolean;
}

const parseBoolean = (value: string | undefined): boolean =>
  value === "1" || value?.toLowerCase() === "true";

export const loadDeepgramFlags = (env: NodeJS.ProcessEnv = process.env): DeepgramFlags => ({
  sttEnabled: parseBoolean(env["PI_GATEWAY_DEEPGRAM_STT_ENABLED"]),
  ttsEnabled: parseBoolean(env["PI_GATEWAY_DEEPGRAM_TTS_ENABLED"]),
});

export interface DeepgramHookInput {
  readonly transcript?: string;
  readonly requestTts?: boolean;
  readonly finalText?: string;
}

export interface DeepgramHookOutput {
  readonly sttSummary?: string;
  readonly ttsQueued: boolean;
}

export const applyDeepgramHooks = (
  flags: DeepgramFlags,
  input: DeepgramHookInput,
): DeepgramHookOutput => {
  const trimmedTranscript = input.transcript?.trim();
  const sttSummary =
    flags.sttEnabled && trimmedTranscript !== undefined && trimmedTranscript.length > 0
      ? `Voice transcript: ${trimmedTranscript}`
      : undefined;
  const ttsQueued =
    flags.ttsEnabled === true &&
    input.requestTts === true &&
    input.finalText !== undefined &&
    input.finalText.trim().length > 0;

  return {
    ...(sttSummary === undefined ? {} : { sttSummary }),
    ttsQueued,
  };
};
