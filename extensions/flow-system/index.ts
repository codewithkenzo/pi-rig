import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { makeQueue, type FlowQueueService } from "./src/queue.js";
import { makeFlowTool } from "./src/tool.js";
import { makeFlowBatchTool } from "./src/batch-tool.js";
import { registerFlowCommands } from "./src/commands.js";
import {
	FLOW_ENTRY_TYPE,
	FlowStateEntrySchema,
	FlowSystemConfigSchema,
	type FlowStateEntry,
	type FlowSystemConfig,
} from "./src/types.js";
import { Value } from "@sinclair/typebox/value";
import { attachFlowUi } from "./src/ui.js";
import { findLatestCustomEntry } from "../../shared/session.js";

const baseDir = dirname(fileURLToPath(import.meta.url));
const FLOW_SYSTEM_CONFIG_FILE = "flow-system.json";

type FlowSystemInitState = {
	queue: FlowQueueService | undefined;
	detachUi: (() => void) | undefined;
	flowToolRegistered: boolean;
	flowBatchToolRegistered: boolean;
	commandsRegistered: boolean;
	resourcesDiscoverRegistered: boolean;
	sessionStartRegistered: boolean;
	agentEndRegistered: boolean;
	sessionShutdownRegistered: boolean;
	initialized: boolean;
};

const states = new WeakMap<ExtensionAPI, FlowSystemInitState>();

const makeFlowSystemState = (): FlowSystemInitState => ({
	queue: undefined,
	detachUi: undefined,
	flowToolRegistered: false,
	flowBatchToolRegistered: false,
	commandsRegistered: false,
	resourcesDiscoverRegistered: false,
	sessionStartRegistered: false,
	agentEndRegistered: false,
	sessionShutdownRegistered: false,
	initialized: false,
});

const loadFlowSystemConfig = (): FlowSystemConfig => {
	const cwd = typeof process.cwd === "function" ? process.cwd() : baseDir;
	const resolvedCwd: string = cwd === undefined ? baseDir : cwd;
	const locations = [
		join(homedir(), ".pi", FLOW_SYSTEM_CONFIG_FILE),
		join(resolvedCwd, ".pi", FLOW_SYSTEM_CONFIG_FILE),
	];
	const config: FlowSystemConfig = {};

	for (const location of locations) {
		if (!existsSync(location)) {
			continue;
		}
		try {
			const data = JSON.parse(readFileSync(location, "utf8"));
			if (Value.Check(FlowSystemConfigSchema, data)) {
				Object.assign(config, data);
			} else {
				console.warn(`[flow-system] Invalid ${location}; using defaults`);
			}
		} catch (error) {
			console.warn(`[flow-system] Failed to load ${location}:`, error);
		}
	}
	return config;
};

export default async function (pi: ExtensionAPI): Promise<void> {
	const state = states.get(pi) ?? makeFlowSystemState();

	if (state.initialized) {
		console.warn("[flow-system] Extension already initialized for this API instance; skipping duplicate registration.");
		return;
	}
	try {
		if (state.queue === undefined) {
			state.queue = await Effect.runPromise(makeQueue(loadFlowSystemConfig()));
		}
		const queue = state.queue;
		const skillDir = join(baseDir, "..", "skills", "flow-system");

		if (!state.flowToolRegistered) {
			pi.registerTool(makeFlowTool(queue));
			state.flowToolRegistered = true;
		}
		if (!state.flowBatchToolRegistered) {
			pi.registerTool(makeFlowBatchTool(queue));
			state.flowBatchToolRegistered = true;
		}
		if (!state.commandsRegistered) {
			registerFlowCommands(pi, queue);
			state.commandsRegistered = true;
		}
		if (!state.resourcesDiscoverRegistered) {
			pi.on("resources_discover", () => ({
				skillPaths: [skillDir],
			}));
			state.resourcesDiscoverRegistered = true;
		}
		if (!state.sessionStartRegistered) {
			pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
				const last = findLatestCustomEntry(
					ctx.sessionManager.getEntries(),
					FLOW_ENTRY_TYPE,
					(value): value is FlowStateEntry => Value.Check(FlowStateEntrySchema, value),
				);

				if (last !== undefined) {
					await Effect.runPromise(
						queue.restoreFrom(last.jobs, { normalizeStaleActive: true, restoredAt: Date.now() }),
					);
				}
				state.detachUi?.();
				if (ctx.hasUI) {
					state.detachUi = attachFlowUi(queue, ctx);
				}
			});
			state.sessionStartRegistered = true;
		}
		if (!state.agentEndRegistered) {
			pi.on("agent_end", async (_event, _ctx: ExtensionContext) => {
				const snap = await Effect.runPromise(queue.snapshot());
				// Persist only the most recent 100 jobs to keep session state bounded.
				const persistJobs = snap.jobs.slice(-100);
				pi.appendEntry(FLOW_ENTRY_TYPE, { jobs: persistJobs } satisfies FlowStateEntry);
			});
			state.agentEndRegistered = true;
		}
		if (!state.sessionShutdownRegistered) {
			pi.on("session_shutdown", async () => {
				state.detachUi?.();
				state.detachUi = undefined;
			});
			state.sessionShutdownRegistered = true;
		}

		state.initialized = true;
		states.set(pi, state);
	} catch (error) {
		states.set(pi, state);
		throw error;
	}
}
