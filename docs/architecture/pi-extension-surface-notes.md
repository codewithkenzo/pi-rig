# pi-extension-surface-notes

Scope: exact `pi-mono` ExtensionAPI surfaces needed for fastedit wrapper. No speculation.

## 1) `pi.registerTool()` + `execute(...)`

### Exact surface
```ts
registerTool<TParams extends TSchema = TSchema, TDetails = unknown, TState = any>(
	tool: ToolDefinition<TParams, TDetails, TState>,
): void;
```
[upstream: `packages/coding-agent/src/core/extensions/types.ts:1113-1116`]

```ts
execute(
	toolCallId: string,
	params: Static<TParams>,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
	ctx: ExtensionContext,
): Promise<AgentToolResult<TDetails>>;
```
[upstream: `packages/coding-agent/src/core/extensions/types.ts:449-456`]

### Concrete result shape used in repo
```ts
const textResult = (text: string, isError = false, details?: ThemeRenderDetails): AgentToolResult<unknown> => ({
	content: [{ type: "text" as const, text }],
	details,
	...(isError ? { isError: true } : {}),
});
```
[local: `extensions/theme-switcher/src/tools.ts:21-25`]

```ts
const toolTextResult = (text: string, isError = false) =>
	isError
		? { content: [{ type: "text" as const, text }], isError: true, details: undefined }
		: { content: [{ type: "text" as const, text }], details: undefined };
```
[local: `extensions/notify-cron/src/tool.ts:17-24`]

### Error signaling rule
```md
**Signaling errors:** To mark a tool execution as failed (sets `isError: true` on the result and reports it to the LLM), throw an error from `execute`. Returning a value never sets the error flag regardless of what properties you include in the return object.
```
[upstream: `packages/coding-agent/docs/extensions.md:1725-1727`]

```md
- Tool `execute` errors must be signaled by throwing; the thrown error is caught, reported to the LLM with `isError: true`, and execution continues
```
[upstream: `packages/coding-agent/docs/extensions.md:2450-2452`]

## 2) User-friendly error when external binary missing

### Repo pattern
1. Preflight binary existence with shared helper:
```ts
/** Checks if a binary is available in PATH. */
export const binaryExists = async (name: string): Promise<boolean> => {
	const result = await spawnCollect(["which", name]).catch(() => null);
	return result !== null && result.exitCode === 0;
};
```
[local: `shared/subprocess.ts:93-97`]

2. Surface user-facing failure from tool with text + `isError: true`:
```ts
if (!auth.ok) {
	return toolTextResult(`notify-cron auth rejected: ${auth.reason ?? "unauthorized"}.`, true);
}
```
[local: `extensions/notify-cron/src/tool.ts:74-80`]

3. Same pattern in theme tool:
```ts
if (Exit.isFailure(exit)) {
	const message = error instanceof ThemeNotFoundError
		? `Unknown theme "${error.name}".`
		: error instanceof ThemeLoadError
			? `Failed to load theme "${params.theme}": ${error.reason}`
			: `Failed to set theme "${params.theme}"`;
	return textResult(message, true, { ... });
}
```
[local: `extensions/theme-switcher/src/tools.ts:71-88`]

### Exact recommendation for fastedit wrapper
- if binary missing: return `{ content: [{ type: "text", text: "fastedit binary not found. Install fastedit and retry." }], isError: true }`
- if want LLM to treat tool as hard failure: throw from `execute` instead

Why: repo tools use `isError: true` for friendly UI/result text, while docs say `throw` is actual failure signal.

## 3) `appendEntry` + `session_start` persistence flow

### Flow-system pattern
```ts
const states = new WeakMap<ExtensionAPI, FlowSystemInitState>();
```
[local: `extensions/flow-system/index.ts:42-57`]

```ts
const persistQueueSnapshot = async (
	pi: ExtensionAPI,
	queue: FlowQueueService,
	state: FlowSystemInitState,
): Promise<void> => {
	const snap = await Effect.runPromise(queue.snapshot());
	const persistJobs = snap.jobs.slice(-100);
	const key = queueSnapshotKey(persistJobs);
	if (state.lastPersistedQueueKey === key) {
		return;
	}
	pi.appendEntry(FLOW_ENTRY_TYPE, { jobs: persistJobs } satisfies FlowStateEntry);
	state.lastPersistedQueueKey = key;
};
```
[local: `extensions/flow-system/index.ts:61-74`]

```ts
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
		state.lastPersistedQueueKey = queueSnapshotKey(last.jobs.slice(-100));
	} else {
		delete state.lastPersistedQueueKey;
	}
});
```
[local: `extensions/flow-system/index.ts:152-174`]

### Underlying session API
```ts
/** Append a custom entry (for extensions) as child of current leaf, then advance leaf. Returns entry id. */
appendCustomEntry(customType: string, data?: unknown): string {
	const entry: CustomEntry = {
		type: "custom",
		customType,
		data,
		id: generateId(this.byId),
		parentId: this.leafId,
		timestamp: new Date().toISOString(),
	};
	this._appendEntry(entry);
	return entry.id;
}
```
[upstream: `packages/coding-agent/src/core/session-manager.ts:896-907`]

```ts
export const findLatestCustomEntry = <T>(
	entries: readonly SessionEntryLike[],
	customType: string,
	isData: (value: unknown) => value is T,
): T | undefined =>
	entries
		.filter(
			(entry): entry is CustomEntryLike<T> =>
				entry.type === "custom" && entry.customType === customType && isData(entry.data),
		)
		.at(-1)?.data;
```
[local: `shared/session.ts:13-23`]

### Theme-switcher uses same lifecycle shape
```ts
pi.on("session_start", async (_event: SessionStartEvent, ctx: ExtensionContext) => {
	const projectThemeName = readProjectThemeName(ctx.cwd);
	const saved = findSavedThemeEntry(ctx.sessionManager.getEntries());
	...
});
```
[local: `extensions/theme-switcher/src/lifecycle.ts:64-93`]

```ts
pi.on("agent_end", async (_event, ctx: ExtensionContext) => {
	syncThemeStateFromUi(state, ctx.ui.theme.name);
	...
	pi.appendEntry(THEME_ENTRY_TYPE, snapshotThemeEntry(state));
});
```
[local: `extensions/theme-switcher/src/lifecycle.ts:97-105`]

### Relevant docs
```md
Extensions are auto-discovered ... Session persistence - Store state that survives restarts via `pi.appendEntry()`
```
[upstream: `packages/coding-agent/docs/extensions.md:7-16`]

## 4) Built-in MCP-client surface?

No built-in MCP-client surface found in provided docs/source.

Evidence: available-imports list only `@mariozechner/pi-coding-agent`, `typebox`, `@mariozechner/pi-ai`, `@mariozechner/pi-tui`.
[upstream: `packages/coding-agent/docs/extensions.md:137-144`]

Also: grep across listed upstream extension/source files for `mcp` returned no matches.

## 5) Extension loading from `package.json` `extensions` field

### Loader behavior
```ts
interface PiManifest {
	extensions?: string[];
	themes?: string[];
	skills?: string[];
	prompts?: string[];
}

function readPiManifest(packageJsonPath: string): PiManifest | null {
	...
	if (pkg.pi && typeof pkg.pi === "object") {
		return pkg.pi as PiManifest;
	}
	return null;
}
```
[upstream: `packages/coding-agent/src/core/extensions/loader.ts:448-463`]

```ts
function resolveExtensionEntries(dir: string): string[] | null {
	// Check for package.json with "pi" field first
	const packageJsonPath = path.join(dir, "package.json");
	if (fs.existsSync(packageJsonPath)) {
		const manifest = readPiManifest(packageJsonPath);
		if (manifest?.extensions?.length) {
			const entries: string[] = [];
			for (const extPath of manifest.extensions) {
				const resolvedExtPath = path.resolve(dir, extPath);
				if (fs.existsSync(resolvedExtPath)) {
					entries.push(resolvedExtPath);
				}
			}
			if (entries.length > 0) {
				return entries;
			}
		}
	}
	...
}
```
[upstream: `packages/coding-agent/src/core/extensions/loader.ts:472-505`]

### Repo manifests mirror this
```json
{
  "extensions": ["./dist/index.js"],
  "pi": {
    "extensions": ["./dist/index.js"]
  }
}
```
[local: `extensions/flow-system/package.json:7-14`]
[local: `extensions/notify-cron/package.json:7-10`]
[local: `extensions/theme-switcher/package.json:7-14`]

### Discovery fallback order
```md
Discovery rules:
1. Direct files: `extensions/*.ts` or `*.js` → load
2. Subdirectory with index: `extensions/*/index.ts` or `index.js` → load
3. Subdirectory with package.json: `extensions/*/package.json` with "pi" field → load what it declares
```
[upstream: `packages/coding-agent/src/core/extensions/loader.ts:513-521`]

## 6) How `skills/<name>/SKILL.md` is discovered

### `resources_discover` hook
```ts
pi.on("resources_discover", () => ({
	skillPaths: [skillDir],
}));
```
[local: `extensions/flow-system/index.ts:146-150`]

Theme-switcher same pattern:
```ts
pi.on("resources_discover", async () => {
	if (!themeSkillDirExists()) {
		return {};
	}
	return { skillPaths: [themeSkillPackageDir] };
});
```
[local: `extensions/theme-switcher/src/lifecycle.ts:53-61`]

### Pi docs: event timing + payload
```md
Fired after `session_start` so extensions can contribute additional skill, prompt, and theme paths.
...
return {
  skillPaths: ["/path/to/skills"],
  promptPaths: ["/path/to/prompts"],
  themePaths: ["/path/to/themes"],
};
```
[upstream: `packages/coding-agent/docs/extensions.md:334-347`]

### Resource loader maps directories to `SKILL.md`
```ts
const skillFile = join(resource.path, "SKILL.md");
if (existsSync(skillFile)) {
	if (!metadataByPath.has(skillFile)) {
		metadataByPath.set(skillFile, resource.metadata);
	}
	return skillFile;
}
return resource.path;
```
[upstream: `packages/coding-agent/src/core/resource-loader.ts:354-373`]

### Skill discovery rules
```md
Pi loads skills from:
- Packages: `skills/` directories or `pi.skills` entries in `package.json`
- Discovery rules: directories containing `SKILL.md` are discovered recursively
```
[upstream: `packages/coding-agent/docs/skills.md:24-41`]

```md
A skill is a directory with a `SKILL.md` file.
```
[upstream: `packages/coding-agent/docs/skills.md:92-98`]

## 7) Idempotent registration pattern

### Flow-system state guard
```ts
type FlowSystemInitState = {
	...
	initialized: boolean;
	...
};

const states = new WeakMap<ExtensionAPI, FlowSystemInitState>();
```
[local: `extensions/flow-system/index.ts:26-42`]

```ts
const state = states.get(pi) ?? makeFlowSystemState();

if (state.initialized) {
	console.warn("[flow-system] Extension already initialized for this API instance; skipping duplicate registration.");
	return;
}
```
[local: `extensions/flow-system/index.ts:103-109`]

```ts
if (!state.flowToolRegistered) {
	pi.registerTool(makeFlowTool(queue));
	state.flowToolRegistered = true;
}
...
if (!state.resourcesDiscoverRegistered) {
	pi.on("resources_discover", () => ({ skillPaths: [skillDir] }));
	state.resourcesDiscoverRegistered = true;
}
```
[local: `extensions/flow-system/index.ts:117-150`]

### Theme-switcher uses per-hook booleans too
```ts
type ThemeLifecycleRegistrationState = {
	resourcesDiscoverRegistered: boolean;
	sessionStartRegistered: boolean;
	agentEndRegistered: boolean;
	...
};
```
[local: `extensions/theme-switcher/src/lifecycle.ts:10-17`]

```ts
if (!registrationState.resourcesDiscoverRegistered) {
	pi.on("resources_discover", async () => { ... });
	registrationState.markResourcesDiscoverRegistered();
}
```
[local: `extensions/theme-switcher/src/lifecycle.ts:53-61`]

## Fastedit wrap checklist

- `registerTool(...)` + `execute(...)` exact surface above.
- Preflight binary with `binaryExists(...)`.
- User-facing miss: return text result with `isError: true`.
- If need true tool failure for LLM: throw from `execute`.
- Persist state with `appendEntry(...)` on end/shutdown; restore on `session_start`.
- Register `resources_discover` to expose skill dir.
- Use `WeakMap<ExtensionAPI, State>` + booleans for idempotent init.
