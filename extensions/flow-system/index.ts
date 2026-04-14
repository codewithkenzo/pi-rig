import type { ExtensionAPI } from "@mariozechner/pi-agent-core";
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

	pi.on("session_start", async (event) => {
		const entries = (event as { entries?: Array<{ type: string; data: unknown }> }).entries ?? [];
		const last = entries.filter((e) => e.type === FLOW_ENTRY_TYPE).at(-1) as
			| { data: FlowStateEntry }
			| undefined;
		if (last) {
			await Effect.runPromise(queue.restoreFrom(last.data.jobs));
		}
	});

	pi.on("agent_end", async () => {
		const snap = await Effect.runPromise(queue.snapshot());
		await pi.appendEntry(FLOW_ENTRY_TYPE, { jobs: snap.jobs } satisfies FlowStateEntry);
	});
}
