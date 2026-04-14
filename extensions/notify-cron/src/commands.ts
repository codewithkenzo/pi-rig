import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { NotifyCronScheduler } from "./scheduler.js";

export const registerNotifyCronCommands = (pi: ExtensionAPI, scheduler: NotifyCronScheduler): void => {
	pi.registerCommand("notify-cron", {
		description: "notify-cron diagnostics. Subcommands: status, tick",
		getArgumentCompletions: (partial: string) => {
			const options = ["status", "tick"];
			return options
				.filter((opt) => opt.startsWith(partial))
				.map((value) => ({ label: value, value }));
		},
		handler: async (args: string, ctx) => {
			const sub = args.trim().split(/\s+/).filter(Boolean)[0] ?? "status";
			if (sub === "status") {
				const jobs = scheduler.list();
				if (jobs.length === 0) {
					await ctx.ui.notify("notify-cron: no jobs configured.");
					return;
				}
				const lines = jobs.map(
					(entry) =>
						`${entry.job.id} every=${entry.job.everyMinutes}m enabled=${entry.job.enabled} lastSuccess=${entry.lastSuccessAt ?? "-"}`,
				);
				await ctx.ui.notify(`notify-cron jobs=${jobs.length}\n${lines.join("\n")}`);
				return;
			}

			if (sub === "tick") {
				const out = scheduler.tick("notify-cron-command", Date.now());
				await ctx.ui.notify(
					out.blockedByLease
						? `notify-cron tick blocked by lease owner ${out.lease?.owner ?? "unknown"}`
						: `notify-cron tick due=${out.runs.length}`,
				);
				return;
			}

			await ctx.ui.notify("Usage: /notify-cron status | tick");
		},
	});
};
