import { describe, expect, it } from "bun:test";
import { checkDiscordModerationPolicy, parseDiscordDestination } from "../src/discord-adapter.js";

describe("Discord adapter destination normalization", () => {
  it("normalizes discord channel targets", () => {
    const destination = parseDiscordDestination("discord:123456789012345678");

    expect(destination).toEqual({
      platform: "discord",
      kind: "channel",
      id: "123456789012345678",
    });
  });

  it("normalizes discord thread targets when thread id is present", () => {
    const destination = parseDiscordDestination("discord:123456789012345678:123456789098765432");

    expect(destination).toEqual({
      platform: "discord",
      kind: "thread",
      id: "123456789012345678",
      threadId: "123456789098765432",
    });
  });

  it("rejects malformed discord targets", () => {
    expect(parseDiscordDestination("telegram:123")).toBeNull();
    expect(parseDiscordDestination("discord:abc")).toBeNull();
    expect(parseDiscordDestination("discord:123:abc")).toBeNull();
    expect(parseDiscordDestination("discord:")).toBeNull();
  });
});

describe("Discord adapter moderation policy", () => {
  it("allows moderation when actor is allowed and has required permission and audit reason", () => {
    const decision = checkDiscordModerationPolicy("ban_member", {
      actorRole: "admin",
      actorPermissions: ["BAN_MEMBERS", "MANAGE_MESSAGES"],
      auditReason: "community safeguard",
    });

    expect(decision).toEqual({ allowed: true });
  });

  it("denies moderation when actor role is not allowed", () => {
    const decision = checkDiscordModerationPolicy("ban_member", {
      actorRole: "member",
      actorPermissions: ["BAN_MEMBERS", "MANAGE_MESSAGES"],
      auditReason: "community safeguard",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("actor role not eligible for moderation actions");
  });

  it("denies moderation when actor lacks moderation permissions", () => {
    const decision = checkDiscordModerationPolicy("kick_member", {
      actorRole: "admin",
      actorPermissions: ["VIEW_CHANNEL"],
      auditReason: "cleanup request",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("actor lacks required moderation permissions");
  });

  it("requires audit reason for moderation-capable actions", () => {
    const decision = checkDiscordModerationPolicy("timeout_member", {
      actorRole: "admin",
      actorPermissions: ["MODERATE_MEMBERS"],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("audit reason is required for moderation actions");
  });

  it("passes non-moderation actions without audit reason", () => {
    const decision = checkDiscordModerationPolicy("ping", {
      actorPermissions: [],
    });

    expect(decision).toEqual({ allowed: true });
  });
});
