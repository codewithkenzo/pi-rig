import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { TurnPatchQueueService } from "./turn-state.js";

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

export function registerGatewayCommands(pi: ExtensionAPI, queue: TurnPatchQueueService): void {
  pi.registerCommand("gateway", {
    description: "Gateway runtime diagnostics. Subcommand: status",
    getArgumentCompletions: () => null,
    handler: async (args: string, _ctx) => {
      const subcommand = args.trim().split(/\s+/).filter(Boolean)[0] ?? "status";

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
