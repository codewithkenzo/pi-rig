import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerNotifyCronCommands } from "./src/commands.js";
import { makeNotifyCronScheduler } from "./src/scheduler.js";
import { makeNotifyCronListTool, makeNotifyCronRemoveTool, makeNotifyCronTickTool, makeNotifyCronUpsertTool } from "./src/tool.js";

export default async function notifyCron(pi: ExtensionAPI): Promise<void> {
	const scheduler = makeNotifyCronScheduler();
	pi.registerTool(makeNotifyCronUpsertTool(scheduler));
	pi.registerTool(makeNotifyCronTickTool(scheduler));
	pi.registerTool(makeNotifyCronListTool(scheduler));
	pi.registerTool(makeNotifyCronRemoveTool(scheduler));
	registerNotifyCronCommands(pi, scheduler);
}
