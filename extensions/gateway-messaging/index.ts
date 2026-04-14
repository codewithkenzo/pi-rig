import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { makeDiscordAdapter } from "./src/discord-adapter.js";
import { makeGatewayTurnPreviewTool } from "./src/tool.js";
import { registerGatewayCommands } from "./src/commands.js";
import { makeTurnStateQueue } from "./src/turn-state.js";

export default async function gatewayMessaging(_pi: ExtensionAPI): Promise<void> {
  const queue = makeTurnStateQueue();
  const discordAdapter = makeDiscordAdapter();
  _pi.registerTool(makeGatewayTurnPreviewTool(queue));
  registerGatewayCommands(_pi, queue, discordAdapter);
}
