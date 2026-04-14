import type { FormulaEvaluation, StructuredFormula } from "./types.js";

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

export const renderFormulaContext = (
	formula: StructuredFormula,
	evaluation: FormulaEvaluation,
): string => {
	const title = formula.label ?? formula.id;
	const lines = [
		`Formula: ${title}`,
		`Verdict: ${evaluation.verdict}`,
		`Score: ${evaluation.total.toFixed(2)}/${evaluation.max.toFixed(2)} (${formatPercent(evaluation.normalized)})`,
		"Metrics:",
		...evaluation.metrics.map(
			(metric) =>
				`- ${metric.label}: ${metric.weighted.toFixed(2)}/${metric.weight.toFixed(2)} (${formatPercent(metric.value)})`,
		),
	];

	return lines.join("\n");
};

export const renderFormulaHarnessSummary = (evaluation: FormulaEvaluation): Record<string, unknown> => ({
	formulaId: evaluation.formulaId,
	total: evaluation.total,
	max: evaluation.max,
	normalized: evaluation.normalized,
	verdict: evaluation.verdict,
	metrics: evaluation.metrics.map((metric) => ({
		key: metric.key,
		weighted: metric.weighted,
		weight: metric.weight,
		value: metric.value,
	})),
});
