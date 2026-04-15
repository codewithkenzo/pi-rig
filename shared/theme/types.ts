import { Type, type Static } from "@sinclair/typebox";

export const SemanticTokenSchema = Type.Union([
  Type.Literal("accent"),
  Type.Literal("success"),
  Type.Literal("error"),
  Type.Literal("warning"),
  Type.Literal("muted"),
  Type.Literal("dim"),
  Type.Literal("text"),
  Type.Literal("border"),
  Type.Literal("highlight"),
  Type.Literal("info"),
  Type.Literal("active"),
  Type.Literal("inactive"),
  Type.Literal("header"),
  Type.Literal("label"),
  Type.Literal("value"),
  Type.Literal("separator"),
]);
export type SemanticToken = Static<typeof SemanticTokenSchema>;

export const ColorModeSchema = Type.Union([
  Type.Literal("truecolor"),
  Type.Literal("256"),
  Type.Literal("16"),
  Type.Literal("none"),
]);
export type ColorMode = Static<typeof ColorModeSchema>;

export const PaletteSchema = Type.Object({
  name: Type.String(),
  variant: Type.Union([Type.Literal("dark"), Type.Literal("light")]),
  description: Type.Optional(Type.String()),
  source: Type.Optional(
    Type.Union([Type.Literal("builtin"), Type.Literal("hermes"), Type.Literal("custom"), Type.Literal("pi-theme-switcher")])
  ),
  semantic: Type.Record(SemanticTokenSchema, Type.String()),  // token → hex
  raw: Type.Record(Type.String(), Type.String()),             // named colors
  /** Animation frames imported from hermes skin (optional) */
  animations: Type.Optional(Type.Object({
    runningFrames:    Type.Array(Type.String()),
    toolFrames:       Type.Array(Type.String()),
    streamingFrames:  Type.Array(Type.String()),
    doneSymbol:       Type.String(),
    failedSymbol:     Type.String(),
    cancelledSymbol:  Type.String(),
    pendingSymbol:    Type.String(),
    spinnerInterval:  Type.Number(),
  })),
});
export type Palette = Static<typeof PaletteSchema>;

export const ThemeConfigSchema = Type.Object({
  schemaVersion: Type.Number(),
  active: Type.String({ default: "catppuccin-mocha" }),
  colorMode: ColorModeSchema,
  nerdFonts: Type.Boolean({ default: true }),
  custom: Type.Optional(Type.Record(Type.String(), Type.String())),
  animation: Type.Object({
    enabled:       Type.Boolean({ default: true }),
    fps:           Type.Number({ default: 8 }),
    reducedMotion: Type.Boolean({ default: false }),
  }),
});
export type ThemeConfig = Static<typeof ThemeConfigSchema>;

export const defaultThemeConfig: ThemeConfig = {
  schemaVersion: 1,
  active: "catppuccin-mocha",
  colorMode: "truecolor",
  nerdFonts: true,
  animation: { enabled: true, fps: 8, reducedMotion: false },
};
