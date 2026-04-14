import { Type, type Static } from "@sinclair/typebox";
import { Data } from "effect";

export const ThemeSetParamsSchema = Type.Object({
	theme: Type.String({ minLength: 1 }),
});
export type ThemeSetParams = Static<typeof ThemeSetParamsSchema>;

export const ThemePreviewParamsSchema = Type.Object({
	theme: Type.String({ minLength: 1 }),
});
export type ThemePreviewParams = Static<typeof ThemePreviewParamsSchema>;

export const ThemeListParamsSchema = Type.Object({});
export type ThemeListParams = Static<typeof ThemeListParamsSchema>;

export const THEME_ENTRY_TYPE = "theme_switcher_state" as const;

export type ThemeStateEntry = {
	readonly active: string;
};

export class ThemeNotFoundError extends Data.TaggedError("ThemeNotFoundError")<{
	readonly name: string;
}> {}

export class ThemeLoadError extends Data.TaggedError("ThemeLoadError")<{
	readonly reason: string;
}> {}
