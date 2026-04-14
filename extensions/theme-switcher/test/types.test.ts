import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
	THEME_ENTRY_TYPE,
	ThemeLoadError,
	ThemeNotFoundError,
	ThemePreviewParamsSchema,
	ThemeSetParamsSchema,
} from "../src/types.js";

describe("Theme params schemas", () => {
	it("accepts a valid set payload", () => {
		expect(Value.Check(ThemeSetParamsSchema, { theme: "dracula" })).toBe(true);
	});

	it("rejects a set payload with a missing theme", () => {
		expect(Value.Check(ThemeSetParamsSchema, {})).toBe(false);
	});

	it("rejects a set payload with a non-string theme", () => {
		expect(Value.Check(ThemeSetParamsSchema, { theme: 123 })).toBe(false);
	});

	it("rejects a set payload with an empty theme", () => {
		expect(Value.Check(ThemeSetParamsSchema, { theme: "" })).toBe(false);
	});

	it("accepts a valid preview payload", () => {
		expect(Value.Check(ThemePreviewParamsSchema, { theme: "nord" })).toBe(true);
	});

	it("rejects a preview payload with a missing theme", () => {
		expect(Value.Check(ThemePreviewParamsSchema, {})).toBe(false);
	});
});

describe("Theme constants and tagged errors", () => {
	it("exports the theme entry type", () => {
		expect(THEME_ENTRY_TYPE).toBe("theme_switcher_state");
	});

	it("ThemeNotFoundError carries the theme name", () => {
		const error = new ThemeNotFoundError({ name: "unknown" });
		expect(error).toBeInstanceOf(ThemeNotFoundError);
		expect(error._tag).toBe("ThemeNotFoundError");
		expect(error.name).toBe("unknown");
	});

	it("ThemeLoadError carries the reason", () => {
		const error = new ThemeLoadError({ reason: "bad config" });
		expect(error).toBeInstanceOf(ThemeLoadError);
		expect(error._tag).toBe("ThemeLoadError");
		expect(error.reason).toBe("bad config");
	});
});
