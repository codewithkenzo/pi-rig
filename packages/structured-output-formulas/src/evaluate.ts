import type { FormulaEvaluation, FormulaInput, FormulaMetric, FormulaVerdict, MetricEvaluation, StructuredFormula } from "./types.js";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const evaluateMetric = (
	metric: FormulaMetric,
	input: FormulaInput,
): MetricEvaluation => {
	const label = metric.label ?? metric.key;
	const raw = input[metric.key];

	if (metric.kind === "boolean") {
		const boolValue = raw === true ? 1 : 0;
		const value = metric.invert === true ? 1 - boolValue : boolValue;
		return {
			key: metric.key,
			label,
			kind: metric.kind,
			weight: metric.weight,
			value,
			weighted: value * metric.weight,
		};
	}

	const numericRaw = typeof raw === "number" ? raw : metric.min;
	const span = metric.max - metric.min;
	const baseValue =
		span <= 0
			? 0
			: clamp01((numericRaw - metric.min) / span);
	const value = metric.invert === true ? 1 - baseValue : baseValue;

	return {
		key: metric.key,
		label,
		kind: metric.kind,
		weight: metric.weight,
		value,
		weighted: value * metric.weight,
	};
};

const resolveVerdict = (
	normalized: number,
	passThreshold: number,
	warnThreshold: number | undefined,
): FormulaVerdict => {
	if (normalized >= passThreshold) return "pass";
	if (warnThreshold !== undefined && normalized >= warnThreshold) return "warn";
	return "fail";
};

export const evaluateFormula = (
	formula: StructuredFormula,
	input: FormulaInput,
): FormulaEvaluation => {
	const metrics = formula.metrics.map((metric) => evaluateMetric(metric, input));
	const total = metrics.reduce((sum, metric) => sum + metric.weighted, 0);
	const max = metrics.reduce((sum, metric) => sum + metric.weight, 0);
	const normalized = max === 0 ? 0 : total / max;

	return {
		formulaId: formula.id,
		total,
		max,
		normalized,
		verdict: resolveVerdict(normalized, formula.thresholds.pass, formula.thresholds.warn),
		metrics,
	};
};
