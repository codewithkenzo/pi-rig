import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import type { CustomEntry } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { makeQueue } from "./src/queue.js";
import { makeFlowTool } from "./src/tool.js";
import { makeFlowBatchTool } from "./src/batch-tool.js";
import { registerFlowCommands } from "./src/commands.js";
import { FLOW_ENTRY_TYPE } from "./src/types.js";
import type { FlowStateEntry } from "./src/types.js";

export default async function (pi: ExtensionAPI): Promise<void> {
	const queue = await Effect.runPromise(makeQueue());

	pi.registerTool(makeFlowTool(queue));
	pi.registerTool(makeFlowBatchTool(queue));
	registerFlowCommands(pi, queue);

	pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
		const entries = ctx.sessionManager.getEntries();
		const last = entries
			.filter(
				(e): e is CustomEntry<FlowStateEntry> =>
					e.type === "custom" && e.customType === FLOW_ENTRY_TYPE,
			)
			.at(-1);

		if (last?.data !== undefined) {
			await Effect.runPromise(queue.restoreFrom(last.data.jobs));
		}
	});

	pi.on("agent_end", async (_event, _ctx: ExtensionContext) => {
		const snap = await Effect.runPromise(queue.snapshot());
		pi.appendEntry(FLOW_ENTRY_TYPE, { jobs: snap.jobs } satisfies FlowStateEntry);
	});
}
