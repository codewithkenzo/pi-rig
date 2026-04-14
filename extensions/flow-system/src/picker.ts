import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { FlowProfile } from "./types.js";

type FlowPickerContext = Pick<ExtensionCommandContext, "ui">;

type CustomUi = FlowPickerContext["ui"] & {
	custom?: <T>(
		factory: Parameters<NonNullable<ExtensionCommandContext["ui"]["custom"]>>[0],
		options?: Parameters<NonNullable<ExtensionCommandContext["ui"]["custom"]>>[1],
	) => Promise<T>;
};

const buildItems = (profiles: FlowProfile[]): SelectItem[] =>
	profiles.map((profile) => ({
		value: profile.name,
		label: profile.name,
		description: [
			`${profile.reasoning_level} · ${profile.max_iterations} iter`,
			profile.toolsets.length > 0 ? profile.toolsets.join(", ") : "inherits tools",
			profile.description,
		]
			.filter(Boolean)
			.join(" — "),
	}));

export const showFlowProfilePicker = async (
	ctx: FlowPickerContext,
	profiles: FlowProfile[],
): Promise<string | undefined> => {
	const items = buildItems(profiles);
	const custom = (ctx.ui as CustomUi).custom;
	if (typeof custom !== "function") {
		return ctx.ui.select("Flow profile", items.map((item) => item.value));
	}

	return custom<string | null>(
		(tui, theme, _kb, done) => {
			const container = new Container();
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
			container.addChild(new Text(theme.fg("accent", theme.bold("Launch flow")), 1, 0));
			container.addChild(new Text(theme.fg("muted", "Pick a profile for the next sub-agent run."), 1, 0));

			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			});
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);
			container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (width: number) => container.render(width),
				invalidate: () => container.invalidate(),
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "bottom-center",
				offsetY: -2,
				width: "68%",
				minWidth: 64,
				maxHeight: "72%",
				margin: 1,
			},
		},
	).then((result) => result ?? undefined);
};
