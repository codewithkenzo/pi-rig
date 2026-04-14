import { describe, expect, it } from "bun:test";
import { evaluateFormula } from "../src/evaluate.js";
import { renderFormulaContext, renderFormulaHarnessSummary } from "../src/render.js";
import type { StructuredFormula } from "../src/types.js";

const formula: StructuredFormula = {
	version: 1,
	id: "code-mode-file-op",
	label: "Code Mode file operation score",
	metrics: [
		{
			key: "pathSafety",
			label: "Path safety",
			kind: "boolean",
			weight: 4,
		},
		{
			key: "diffQuality",
			label: "Diff quality",
			kind: "number",
			weight: 3,
			min: 0,
			max: 10,
		},
		{
			key: "latencyMs",
			label: "Latency",
			kind: "number",
			weight: 2,
			min: 0,
			max: 1000,
			invert: true,
		},
	],
	thresholds: {
		pass: 0.75,
		warn: 0.5,
	},
};

describe("evaluateFormula", () => {
	it("scores boolean and numeric metrics into a weighted normalized verdict", () => {
		const evaluation = evaluateFormula(formula, {
			pathSafety: true,
			diffQuality: 8,
			latencyMs: 250,
		});

		expect(evaluation.total).toBeCloseTo(7.9, 5);
		expect(evaluation.max).toBe(9);
		expect(evaluation.normalized).toBeCloseTo(7.9 / 9, 5);
		expect(evaluation.verdict).toBe("pass");
	});

	it("uses warn and fail thresholds deterministically", () => {
		const warnEvaluation = evaluateFormula(formula, {
			pathSafety: true,
			diffQuality: 3,
			latencyMs: 800,
		});
		expect(warnEvaluation.verdict).toBe("warn");

		const failEvaluation = evaluateFormula(formula, {
			pathSafety: false,
			diffQuality: 1,
			latencyMs: 1000,
		});
		expect(failEvaluation.verdict).toBe("fail");
	});
});

describe("formula renderers", () => {
	it("renders a context summary with verdict and metric lines", () => {
		const evaluation = evaluateFormula(formula, {
			pathSafety: true,
			diffQuality: 8,
			latencyMs: 250,
		});

		const rendered = renderFormulaContext(formula, evaluation);
		expect(rendered).toContain("Formula: Code Mode file operation score");
		expect(rendered).toContain("Verdict: pass");
		expect(rendered).toContain("Metrics:");
		expect(rendered).toContain("- Path safety:");
	});

	it("renders a harness-safe plain object summary", () => {
		const evaluation = evaluateFormula(formula, {
			pathSafety: true,
			diffQuality: 8,
			latencyMs: 250,
		});

		const rendered = renderFormulaHarnessSummary(evaluation);
		expect(rendered).toMatchObject({
			formulaId: "code-mode-file-op",
			verdict: "pass",
		});
	});
});
