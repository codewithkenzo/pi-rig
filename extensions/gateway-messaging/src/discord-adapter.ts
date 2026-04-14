import type { GatewayDiscordDestination, GatewayDiscordModerationAction } from "./types.js";

const DISCORD_ID_RE = /^\d{17,20}$/;

const DEFAULT_ALLOWED_ROLES = ["owner", "admin", "moderator"] as const;
const DEFAULT_REQUIRED_PERMISSIONS = [
  "MODERATE_MEMBERS",
  "BAN_MEMBERS",
  "KICK_MEMBERS",
  "MANAGE_MESSAGES",
  "MUTE_MEMBERS",
] as const;

const MODERATION_ACTIONS = new Set<GatewayDiscordModerationAction>([
  "delete_message",
  "timeout_member",
  "kick_member",
  "ban_member",
  "unban_member",
  "mute_member",
  "move_member",
]);

const normalizeRole = (role: string | undefined): string | undefined =>
  role === undefined ? undefined : role.trim().toLowerCase();

const normalizePermissions = (permissions: readonly string[] | undefined): readonly string[] =>
  permissions === undefined
    ? []
    : permissions.map((permission) => permission.trim().toUpperCase()).filter((permission) => permission.length > 0);

export interface GatewayDiscordPolicyInput {
  readonly actorRole?: string;
  readonly actorPermissions?: readonly string[];
  readonly auditReason?: string;
}

export interface GatewayDiscordPolicyOptions {
  readonly allowedRoles?: readonly string[];
  readonly requiredPermissions?: readonly string[];
}

export interface GatewayDiscordPolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface GatewayDiscordAdapter {
  readonly normalizeDiscordDestination: (target: string) => GatewayDiscordDestination | null;
  readonly isModerationCapableAction: (action: string) => boolean;
  readonly checkModerationActionPolicy: (
    action: string,
    context: GatewayDiscordPolicyInput,
    options?: GatewayDiscordPolicyOptions,
  ) => GatewayDiscordPolicyDecision;
}

export const isDiscordModerationCapableAction = (action: string): boolean =>
  MODERATION_ACTIONS.has(action as GatewayDiscordModerationAction);

export const parseDiscordDestination = (target: string): GatewayDiscordDestination | null => {
  const raw = target.trim();
  if (!raw.startsWith("discord:")) {
    return null;
  }

  const body = raw.slice("discord:".length);
  const parts = body.split(":");
  if (parts.length === 0 || parts.length > 2) {
    return null;
  }

  const id = parts[0]?.trim();
  if (id === undefined || id.length === 0 || !DISCORD_ID_RE.test(id)) {
    return null;
  }

  const threadId = parts[1]?.trim();
  if (threadId !== undefined && threadId.length > 0) {
    if (!DISCORD_ID_RE.test(threadId)) {
      return null;
    }
    return {
      platform: "discord",
      kind: "thread",
      id,
      threadId,
    };
  }

  return {
    platform: "discord",
    kind: "channel",
    id,
  };
};

export const formatDiscordDestination = (destination: GatewayDiscordDestination): string => {
  if (destination.kind === "thread" && destination.threadId !== undefined) {
    return `discord:${destination.id}:${destination.threadId}`;
  }
  return `discord:${destination.id}`;
};

export const checkDiscordModerationPolicy = (
  action: string,
  context: GatewayDiscordPolicyInput,
  options?: GatewayDiscordPolicyOptions,
): GatewayDiscordPolicyDecision => {
  if (!isDiscordModerationCapableAction(action)) {
    return { allowed: true };
  }

  const role = normalizeRole(context.actorRole);
  const permissions = new Set(normalizePermissions(context.actorPermissions));
  const allowedRoles = (options?.allowedRoles ?? DEFAULT_ALLOWED_ROLES).map((value) => value.toLowerCase());
  const requiredPermissions = new Set(
    (options?.requiredPermissions ?? DEFAULT_REQUIRED_PERMISSIONS).map((value) => value.toUpperCase()),
  );

  if (role === undefined || !allowedRoles.includes(role)) {
    return { allowed: false, reason: "actor role not eligible for moderation actions" };
  }

  const hasPermission = Array.from(requiredPermissions).some((permission) => permissions.has(permission));
  if (!hasPermission) {
    return {
      allowed: false,
      reason: "actor lacks required moderation permissions",
    };
  }

  if (context.auditReason === undefined || context.auditReason.trim().length === 0) {
    return { allowed: false, reason: "audit reason is required for moderation actions" };
  }

  return { allowed: true };
};

export const makeDiscordAdapter = (policyDefaults?: GatewayDiscordPolicyOptions): GatewayDiscordAdapter => {
  return {
    normalizeDiscordDestination: parseDiscordDestination,
    isModerationCapableAction: isDiscordModerationCapableAction,
    checkModerationActionPolicy: (action, context, overrides) => {
      const merged: GatewayDiscordPolicyOptions = {
        ...(overrides?.allowedRoles !== undefined
          ? { allowedRoles: overrides.allowedRoles }
          : policyDefaults?.allowedRoles !== undefined
            ? { allowedRoles: policyDefaults.allowedRoles }
            : {}),
        ...(overrides?.requiredPermissions !== undefined
          ? { requiredPermissions: overrides.requiredPermissions }
          : policyDefaults?.requiredPermissions !== undefined
            ? { requiredPermissions: policyDefaults.requiredPermissions }
            : {}),
      };
      return checkDiscordModerationPolicy(action, context, merged);
    },
  };
};
