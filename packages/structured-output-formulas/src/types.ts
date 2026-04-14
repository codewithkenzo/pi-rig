import { Type, type Static } from "@sinclair/typebox";

export const NumberMetricSchema = Type.Object({
	key: Type.String({ minLength: 1 }),
	label: Type.Optional(Type.String()),
	kind: Type.Literal("number"),
	weight: Type.Number({ minimum: 0 }),
	min: Type.Number(),
	max: Type.Number(),
	invert: Type.Optional(Type.Boolean()),
});
export type NumberMetric = Static<typeof NumberMetricSchema>;

export const BooleanMetricSchema = Type.Object({
	key: Type.String({ minLength: 1 }),
	label: Type.Optional(Type.String()),
	kind: Type.Literal("boolean"),
	weight: Type.Number({ minimum: 0 }),
	invert: Type.Optional(Type.Boolean()),
});
export type BooleanMetric = Static<typeof BooleanMetricSchema>;

export const FormulaMetricSchema = Type.Union([NumberMetricSchema, BooleanMetricSchema]);
export type FormulaMetric = Static<typeof FormulaMetricSchema>;

export const FormulaThresholdsSchema = Type.Object({
	pass: Type.Number({ minimum: 0, maximum: 1 }),
	warn: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
});
export type FormulaThresholds = Static<typeof FormulaThresholdsSchema>;

export const StructuredFormulaSchema = Type.Object({
	version: Type.Literal(1),
	id: Type.String({ minLength: 1 }),
	label: Type.Optional(Type.String()),
	metrics: Type.Array(FormulaMetricSchema, { minItems: 1 }),
	thresholds: FormulaThresholdsSchema,
});
export type StructuredFormula = Static<typeof StructuredFormulaSchema>;

export const FormulaInputValueSchema = Type.Union([Type.Number(), Type.Boolean()]);
export const FormulaInputSchema = Type.Record(Type.String(), FormulaInputValueSchema);
export type FormulaInput = Static<typeof FormulaInputSchema>;

export type MetricEvaluation = {
	readonly key: string;
	readonly label: string;
	readonly kind: FormulaMetric["kind"];
	readonly weight: number;
	readonly value: number;
	readonly weighted: number;
};

export type FormulaVerdict = "pass" | "warn" | "fail";

export type FormulaEvaluation = {
	readonly formulaId: string;
	readonly total: number;
	readonly max: number;
	readonly normalized: number;
	readonly verdict: FormulaVerdict;
	readonly metrics: readonly MetricEvaluation[];
};
