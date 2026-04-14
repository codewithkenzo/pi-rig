import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Effect } from "effect";
import { Container, Key, SelectList, Text, matchesKey, type SelectItem, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { FlowQueueService } from "./queue.js";
import type { FlowJob, FlowQueue } from "./types.js";

interface FlowOverlayUiContext {
	ui: ExtensionCommandContext["ui"];
}

type CustomUi = FlowOverlayUiContext["ui"] & {
	custom?: <T>(
		factory: Parameters<NonNullable<ExtensionCommandContext["ui"]["custom"]>>[0],
		options?: Parameters<NonNullable<ExtensionCommandContext["ui"]["custom"]>>[1],
	) => Promise<T>;
};

const statusIcon = (job: FlowJob): string => {
	switch (job.status) {
		case "running":
			return "▶";
		case "pending":
			return "○";
		case "done":
			return "✓";
		case "failed":
			return "✗";
		case "cancelled":
			return "⊘";
	}
};

const statusTone = (job: FlowJob): "accent" | "warning" | "success" | "error" | "muted" => {
	switch (job.status) {
		case "running":
			return "accent";
		case "pending":
			return "warning";
		case "done":
			return "success";
		case "failed":
			return "error";
		case "cancelled":
			return "muted";
	}
};

const buildItems = (snapshot: FlowQueue): SelectItem[] =>
	snapshot.jobs.map((job) => ({
		value: job.id,
		label: `${statusIcon(job)} ${job.profile}${job.toolCount !== undefined ? ` · ${job.toolCount}` : ""}`,
		description: `${job.task}${(job.lastAssistantText ?? job.lastProgress) !== undefined ? ` — ${job.lastAssistantText ?? job.lastProgress}` : ""}`,
	}));

const pickDetailText = (job: FlowJob | undefined): string[] => {
	if (job === undefined) {
		return ["No flow jobs yet."];
	}

	const header = [
		`Status: ${job.status}`,
		job.toolCount !== undefined ? `Tools: ${job.toolCount}` : undefined,
		job.startedAt !== undefined ? `Started: ${new Date(job.startedAt).toLocaleTimeString()}` : undefined,
		job.finishedAt !== undefined ? `Finished: ${new Date(job.finishedAt).toLocaleTimeString()}` : undefined,
		job.cwd !== undefined ? `cwd: ${job.cwd}` : undefined,
	]
		.filter(Boolean)
		.join(" · ");

	const detail =
		job.status === "failed"
			? job.error
			: job.status === "done"
				? job.output
				: job.lastAssistantText ?? job.lastProgress ?? job.task;

	return [
		`ID: ${job.id}`,
		header,
		job.lastAssistantText !== undefined ? "" : undefined,
		job.lastAssistantText !== undefined ? `Live: ${job.lastAssistantText}` : undefined,
		"",
		detail?.trim().length ? detail : "No output yet.",
	].filter((line): line is string => line !== undefined);
};

const findJob = (snapshot: FlowQueue, jobId: string | undefined): FlowJob | undefined =>
	snapshot.jobs.find((job) => job.id === jobId) ?? snapshot.jobs[0];

export const showFlowOverlay = async (
	queue: FlowQueueService,
	ctx: FlowOverlayUiContext,
): Promise<void> => {
	const custom = (ctx.ui as CustomUi).custom;
	if (typeof custom !== "function") {
		const snapshot = await Effect.runPromise(queue.snapshot());
		const lines = snapshot.jobs.map((job) => `${statusIcon(job)} ${job.profile} · ${job.task}`);
		await ctx.ui.notify(lines.length > 0 ? lines.join("\n") : "No flow jobs.");
		return;
	}

	await custom<void>(
		(tui, _theme, _kb, done) => {
			let snapshot = queue.peek();
			let selectedId = snapshot.jobs[0]?.id;
			const container = new Container();
			let selectList = buildSelectList();

			function buildSelectList(): SelectList {
				const currentTheme = () => ctx.ui.theme;
				const list = new SelectList(buildItems(snapshot), Math.min(Math.max(snapshot.jobs.length, 1), 8), {
					selectedPrefix: (text) => currentTheme().fg("accent", text),
					selectedText: (text) => currentTheme().fg("accent", text),
					description: (text) => currentTheme().fg("muted", text),
					scrollInfo: (text) => currentTheme().fg("dim", text),
					noMatch: (text) => currentTheme().fg("warning", text),
				});
				const selectedIndex = snapshot.jobs.findIndex((job) => job.id === selectedId);
				if (selectedIndex >= 0) {
					list.setSelectedIndex(selectedIndex);
				}
				list.onSelectionChange = (item) => {
					selectedId = item.value;
					tui.requestRender();
				};
				list.onSelect = (item) => {
					selectedId = item.value;
					tui.requestRender();
				};
				list.onCancel = () => done(undefined);
				return list;
			}

			const unsubscribe = queue.subscribe((next) => {
				snapshot = next;
				if (selectedId === undefined || !snapshot.jobs.some((job) => job.id === selectedId)) {
					selectedId = snapshot.jobs[0]?.id;
				}
				selectList = buildSelectList();
				tui.requestRender();
			});

			return {
				dispose: unsubscribe,
				invalidate: () => {
					container.invalidate();
				},
				handleInput: (data: string) => {
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
						done(undefined);
						return;
					}
					if ((data === "c" || data === "C") && selectedId !== undefined) {
						void Effect.runPromise(queue.cancel(selectedId).pipe(Effect.result));
						tui.requestRender();
						return;
					}
					selectList.handleInput(data);
					tui.requestRender();
				},
				render: (width: number) => {
					const theme = ctx.ui.theme;
					const selectedJob = findJob(snapshot, selectedId);
					const detailLines = pickDetailText(selectedJob).flatMap((line) =>
						wrapTextWithAnsi(line, Math.max(20, width - 4)).map((wrapped) => `  ${wrapped}`),
					);
					const running = snapshot.jobs.filter((job) => job.status === "running").length;
					const pending = snapshot.jobs.filter((job) => job.status === "pending").length;
					container.invalidate();
					const selectedLabel =
						selectedJob !== undefined
							? theme.fg(statusTone(selectedJob), `${statusIcon(selectedJob)} ${selectedJob.profile}`)
							: theme.fg("muted", "No selection");
					return [
						...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width),
						...new Text(theme.fg("accent", theme.bold("Flow overlay")), 1, 0).render(width),
						...new Text(theme.fg("muted", `${running} running · ${pending} pending · ${snapshot.jobs.length} total`), 1, 0).render(width),
						...selectList.render(width),
						"",
						...new Text(selectedLabel, 1, 0).render(width),
						...detailLines.map((line) => theme.fg("text", line)),
						"",
						...new Text(theme.fg("dim", "↑↓ select • c cancel selected • esc close"), 1, 0).render(width),
						...new DynamicBorder((s: string) => theme.fg("accent", s)).render(width),
					];
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "bottom-center",
				offsetY: -2,
				width: "76%",
				minWidth: 72,
				maxHeight: "84%",
				margin: 1,
			},
		},
	);
};
