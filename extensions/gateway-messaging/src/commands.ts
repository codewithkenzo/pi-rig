import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TurnPatchQueueService } from "./turn-state.js";
import type { GatewayDiscordAdapter } from "./discord-adapter.js";

const formatDiscordDecision = (decision: { allowed: boolean; reason?: string }): string =>
  decision.allowed ? "allowed" : `denied: ${decision.reason ?? "no reason"}`;

const toCsv = (value: string): string[] =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const formatTurnLine = (turn: {
  turnId: string;
  chatId: number;
  phase: string;
  pendingPatch: string | undefined;
  droppedPatches: number;
  lastPatchMode: string | undefined;
}): string => {
  const pending = turn.pendingPatch === undefined ? "no-patch" : "has-patch";
  const mode = turn.lastPatchMode ?? "n/a";
  return `${turn.turnId} (chat ${turn.chatId}) phase=${turn.phase} mode=${mode} ${pending} dropped=${turn.droppedPatches}`;
};

export function registerGatewayCommands(
  pi: ExtensionAPI,
  queue: TurnPatchQueueService,
  discordAdapter: GatewayDiscordAdapter,
): void {
  pi.registerCommand("gateway", {
    description: "Gateway diagnostics. Subcommands: status, discord",
    getArgumentCompletions: () => null,
    handler: async (args: string, _ctx) => {
      const tokens = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = tokens[0] ?? "status";

      if (subcommand === "discord") {
        const mode = tokens[1] ?? "normalize";
        if (mode === "normalize") {
          const target = tokens[2];
          if (target === undefined) {
            await _ctx.ui.notify("Usage: /gateway discord normalize <discord:<channel_or_thread_id>[ :<thread_id]>");
            return;
          }
          const destination = discordAdapter.normalizeDiscordDestination(target);
          if (destination === null) {
            await _ctx.ui.notify("Invalid Discord destination. Use discord:<id> or discord:<channel>:<thread>");
            return;
          }
          await _ctx.ui.notify(
            `discord destination ok: ${destination.platform}/${destination.kind} id=${destination.id}` +
              `${destination.threadId === undefined ? "" : ` thread=${destination.threadId}`}`,
          );
          return;
        }

        if (mode === "moderation") {
          const action = tokens[2];
          if (action === undefined) {
            await _ctx.ui.notify("Usage: /gateway discord moderation <action> <role> <perm1,perm2> <audit_reason>");
            return;
          }
          const role = tokens[3] ?? "member";
          const permissions = toCsv(tokens[4] ?? "");
          const auditReason = tokens.slice(5).join(" ") || undefined;
          const input: {
            actorRole: string;
            actorPermissions?: readonly string[];
            auditReason?: string;
          } = { actorRole: role };
          if (permissions.length > 0) {
            input.actorPermissions = permissions;
          }
          if (auditReason !== undefined) {
            input.auditReason = auditReason;
          }
          const decision = discordAdapter.checkModerationActionPolicy(action, input);
          await _ctx.ui.notify(`Moderation policy for "${action}" => ${formatDiscordDecision(decision)}`);
          return;
        }

        await _ctx.ui.notify(
          "Usage: /gateway discord normalize <target> | /gateway discord moderation <action> <role> <perm1,perm2> <audit_reason>",
        );
        return;
      }

      if (subcommand !== "status") {
        await _ctx.ui.notify("Usage: /gateway status");
        return;
      }

      const turns = queue.getTurns();
      if (turns.length === 0) {
        await _ctx.ui.notify("No active gateway turns.");
        return;
      }

      const lines = [`Gateway turns: ${turns.length}`, ...turns.map((turn) => formatTurnLine(turn))];
      await _ctx.ui.notify(lines.join("\n"));
    },
  });
}
