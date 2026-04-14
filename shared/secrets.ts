/**
 * Secret scrubber — strips common credential patterns from strings.
 * Used at memory/diff store boundaries before persisting user content.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{20,}/g,          // OpenAI / Anthropic keys
  /\b[A-Za-z0-9_-]{20,}\b(?=\s*[:=]\s*)/g,  // generic long tokens before = or :
  /Bearer\s+[A-Za-z0-9._\-+/]{20,}/g, // Bearer tokens
  /[A-Z_]+_API_KEY[=:]\s*\S+/g,       // ANY_API_KEY=value
  /[A-Z_]+_SECRET[=:]\s*\S+/g,        // ANY_SECRET=value
  /[A-Z_]+_TOKEN[=:]\s*\S+/g,         // ANY_TOKEN=value
  /ghp_[A-Za-z0-9]{36}/g,             // GitHub personal tokens
  /ghs_[A-Za-z0-9]{36}/g,             // GitHub service tokens
  /xoxb-[0-9]+-[A-Za-z0-9-]+/g,       // Slack bot tokens
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
];

const REDACTED = "[REDACTED]";

export const scrubSecrets = (text: string): string => {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
};

/**
 * Returns true if the string contains patterns that look like secrets.
 * Used for pre-flight checks before storing to memory.
 */
export const containsSecrets = (text: string): boolean =>
  SECRET_PATTERNS.some((p) => p.test(text));
