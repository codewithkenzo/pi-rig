import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import type { CustomEntry } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { makeQueue } from "./src/queue.js";
import { makeFlowTool } from "./src/tool.js";
import { makeFlowBatchTool } from "./src/batch-tool.js";
import { registerFlowCommands } from "./src/commands.js";
import { FLOW_ENTRY_TYPE, FlowStateEntrySchema } from "./src/types.js";
import type { FlowStateEntry } from "./src/types.js";
import { Value } from "@sinclair/typebox/value";
import { attachFlowUi } from "./src/ui.js";

const baseDir = dirname(fileURLToPath(import.meta.url));

export default async function (pi: ExtensionAPI): Promise<void> {
	const queue = await Effect.runPromise(makeQueue());
	const skillDir = join(baseDir, "..", "skills", "flow-system");
	let detachUi: (() => void) | undefined;

	pi.on("resources_discover", () => ({
		skillPaths: [skillDir],
	}));

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

		if (last?.data !== undefined && Value.Check(FlowStateEntrySchema, last.data)) {
			await Effect.runPromise(
				queue.restoreFrom(last.data.jobs, { normalizeStaleActive: true, restoredAt: Date.now() }),
			);
		}
		detachUi?.();
		if (ctx.hasUI) {
			detachUi = attachFlowUi(queue, ctx);
		}
	});

	pi.on("agent_end", async (_event, _ctx: ExtensionContext) => {
		const snap = await Effect.runPromise(queue.snapshot());
		// Persist only the most recent 100 jobs to keep session state bounded.
		const persistJobs = snap.jobs.slice(-100);
		pi.appendEntry(FLOW_ENTRY_TYPE, { jobs: persistJobs } satisfies FlowStateEntry);
	});

	pi.on("session_shutdown", async () => {
		detachUi?.();
		detachUi = undefined;
	});
}
