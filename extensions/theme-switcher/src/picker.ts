import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { SelectList, type SelectItem, truncateToWidth } from "@mariozechner/pi-tui";
import { PALETTE_MAP, createEngine } from "../../../shared/theme/index.js";
import { getThemeNames } from "./runtime.js";

type ThemePickerContext = Pick<ExtensionCommandContext, "ui">;

type CustomUi = ThemePickerContext["ui"] & {
	custom?: <T>(
		factory: Parameters<NonNullable<ExtensionCommandContext["ui"]["custom"]>>[0],
		options?: Parameters<NonNullable<ExtensionCommandContext["ui"]["custom"]>>[1],
	) => Promise<T>;
	getAllThemes?: () => Array<{ name: string; path?: string }>;
};

const getAvailableThemeNames = (ctx: ThemePickerContext): string[] => {
	const customUi = ctx.ui as CustomUi;
	if (typeof customUi.getAllThemes === "function") {
		const names = customUi.getAllThemes().map((theme) => theme.name);
		if (names.length > 0) {
			return names;
		}
	}
	return getThemeNames();
};

const buildItems = (activeTheme: string, availableNames: string[]): SelectItem[] =>
	availableNames.map((name) => {
		const palette = PALETTE_MAP.get(name);
		const meta = [palette?.variant, palette?.source ?? "builtin"].filter(Boolean).join(" · ");
		const description = [meta, palette?.description].filter(Boolean).join(" — ");
		return {
			value: name,
			label: name === activeTheme ? `${name} (active)` : name,
			description: description.length > 0 ? description : "Installed pi theme",
		};
	});

export const showThemePicker = async (
	ctx: ThemePickerContext,
	activeTheme: string,
): Promise<string | undefined> => {
	const availableNames = getAvailableThemeNames(ctx);
	const items = buildItems(activeTheme, availableNames);
	const custom = (ctx.ui as CustomUi).custom;
	if (typeof custom !== "function") {
		return ctx.ui.select("Pick a theme", items.map((item) => item.value));
	}

	const originalTheme = activeTheme;
	let previewTheme = activeTheme;

	const applyPreview = (name: string): boolean => {
		const result = ctx.ui.setTheme(name);
		if (!result.success) {
			void ctx.ui.notify(`Failed to load theme: ${result.error ?? name}`, "error");
			return false;
		}
		previewTheme = name;
		return true;
	};

	return custom<string | null>(
		(tui, _theme, _kb, done) => {
			const themeNow = () => ctx.ui.theme;
			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (text) => themeNow().fg("accent", text),
				selectedText: (text) => themeNow().fg("accent", text),
				description: (text) => themeNow().fg("muted", text),
				scrollInfo: (text) => themeNow().fg("dim", text),
				noMatch: (text) => themeNow().fg("warning", text),
			});
			selectList.onSelectionChange = (item) => {
				if (item.value === previewTheme) {
					return;
				}
				if (applyPreview(item.value)) {
					tui.requestRender(true);
				}
			};
			selectList.onSelect = (item) => {
				if (item.value !== previewTheme && !applyPreview(item.value)) {
					return;
				}
				done(item.value);
			};
			selectList.onCancel = () => {
				if (previewTheme !== originalTheme) {
					ctx.ui.setTheme(originalTheme);
					previewTheme = originalTheme;
				}
				done(null);
			};

			return {
				invalidate: () => undefined,
				handleInput: (data: string) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
				render: (width: number) => {
					const theme = themeNow();
					const palette = PALETTE_MAP.get(previewTheme);
					const border = theme.fg("accent", "─".repeat(Math.max(1, width)));
					const header = truncateToWidth(theme.fg("accent", theme.bold("Theme picker")), width);
					const subtitle = truncateToWidth(
						theme.fg("muted", "Preview applies live when the selected theme is installed in pi."),
						width,
					);
					const rows = [border, header, subtitle, "", ...selectList.render(width), ""];

					if (palette !== undefined) {
						const engine = createEngine(palette, "truecolor");
						rows.push(
							truncateToWidth(
								theme.fg("muted", `${palette.name} · ${palette.variant}/${palette.source ?? "builtin"}`),
								width,
							),
							truncateToWidth(
								[
									engine.fg("accent", "●● accent"),
									engine.fg("success", "●● success"),
									engine.fg("warning", "●● warning"),
									engine.fg("error", "●● error"),
								].join(theme.fg("muted", "   ")),
								width,
							),
							truncateToWidth(
								`${engine.fg("accent", "//")} ${engine.fg("value", "theme preview breathes here")}`,
								width,
							),
						);
					} else {
						rows.push(truncateToWidth(theme.fg("muted", `${previewTheme} · installed pi theme`), width));
					}

					rows.push(
						"",
						truncateToWidth(theme.fg("dim", "↑↓ preview • enter keep • esc restore"), width),
						border,
					);
					return rows;
				},
			};
		},
		{
			overlay: true,
			overlayOptions: {
				anchor: "bottom-center",
				offsetY: -2,
				width: "66%",
				minWidth: 60,
				maxHeight: "78%",
				margin: 1,
			},
		},
	).then((result) => result ?? undefined);
};
