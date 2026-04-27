import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mocked spawn runner for this test file only.
const spawnCollectMock = mock(async () => ({
	stdout: JSON.stringify({
		status: "applied",
		operation: "replace_body_span",
		file: "src/app.ts",
		validation: {
			parseClean: true,
		},
		metrics: {
			estimatedPayloadSavedPctVsRealisticAnchor: 33,
			estimatedTokensSavedBytesDiv4VsRealisticAnchor: 88,
			wallMs: 14,
		},
		diffSummary: "+2 -0",
	}),
	stderr: "",
	exitCode: 0,
	durationMs: 10,
}) );

await mock.module("../src/spawn.js", () => ({
	spawnCollectNode: spawnCollectMock,
}));

const tools = await import("../src/tools.js");

describe("pi_blitz_apply runtime path", () => {
	let tmpDir = "";
	let file = "";

	beforeEach(() => {
		spawnCollectMock.mockClear();
		tmpDir = mkdtempSync(join(tmpdir(), "pi-blitz-apply-"));
		file = join(tmpDir, "app.ts");
		writeFileSync(file, "export function foo() { return 1; }\n");
	});

	afterEach(() => {
		if (tmpDir) {
			rmSync(tmpDir, { recursive: true, force: true });
			tmpDir = "";
		}
	});

	test("invokes blitz apply --edit - --json with JSON IR", async () => {
		const tool = tools.piBlitzApplyToolDef("blitz", tmpDir);
		const result = await tool.execute("1", {
			file: "app.ts",
			operation: "replace_body_span",
			target: { symbol: "foo" },
			edit: {
				find: "return 1;",
				replace: "return 2;",
			},
			dry_run: true,
			include_diff: true,
		});

		expect(result.isError).toBeUndefined();
		expect(spawnCollectMock).toHaveBeenCalledTimes(1);
		expect(result.content[0]?.text).toContain("status=applied");

		const firstCall = spawnCollectMock.mock.calls[0] as unknown as [string[], { stdin: string }];
		expect(firstCall).toBeDefined();
		const cmd = firstCall[0];
		const opts = firstCall[1];
		expect(cmd).toEqual(["blitz", "apply", "--edit", "-", "--json", "--dry-run", "--diff"]);
		const payload = JSON.parse(opts.stdin);
		expect(payload.version).toBe(1);
		expect(payload.file).toBe(file);
		expect(payload.operation).toBe("replace_body_span");
		expect(payload.target.symbol).toBe("foo");
		expect(payload.edit).toEqual({ find: "return 1;", replace: "return 2;" });
		expect(payload.options.dryRun).toBe(true);
		expect(payload.options.diffContext).toBe(12);
	});
});
