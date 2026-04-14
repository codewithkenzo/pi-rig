import type { ToolStreamEvent } from "./types.js";

interface ToolSummary {
  calls: number;
  ok: number;
  fail: number;
}

const makeSummaryLine = (name: string, summary: ToolSummary): string => {
  const parts = [`${name}:${summary.calls}c`];
  if (summary.ok > 0) parts.push(`✓${summary.ok}`);
  if (summary.fail > 0) parts.push(`✗${summary.fail}`);
  return parts.join(" ");
};

const truncateLine = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;

export function formatToolStreamRollup(events: readonly ToolStreamEvent[]): string {
  if (events.length === 0) {
    return "(no stream events)";
  }

  const summary = new Map<string, ToolSummary>();
  const errors: string[] = [];
  const textChunks: string[] = [];

  for (const event of events) {
    if (event.type === "tool_call") {
      const bucket = summary.get(event.name);
      if (bucket === undefined) {
        summary.set(event.name, { calls: 1, ok: 0, fail: 0 });
      } else {
        bucket.calls += 1;
      }
      continue;
    }

    if (event.type === "tool_result") {
      const bucket = summary.get(event.name);
      if (bucket === undefined) {
        summary.set(event.name, { calls: 0, ok: 0, fail: 0 });
      }
      const target = summary.get(event.name);
      if (target === undefined) {
        continue;
      }
      if (event.ok) {
        target.ok += 1;
      } else {
        target.fail += 1;
      }
      continue;
    }

    if (event.type === "text") {
      textChunks.push(truncateLine(event.text, 120));
      continue;
    }

    errors.push(truncateLine(event.message, 80));
  }

  const lines: string[] = [];

  if (summary.size > 0) {
    const toolLines = Array.from(summary.entries(), ([name, s]) => makeSummaryLine(name, s));
    lines.push(`tools: ${toolLines.join(" · ")}`);
  }

  if (textChunks.length > 0) {
    lines.push(`text: ${truncateLine(textChunks.join(" | "), 240)}`);
  }

  if (errors.length > 0) {
    lines.push(`errors: ${errors.length}`);
    if (errors[0] !== undefined) {
      lines.push(`last-error: ${errors.at(-1)}`);
    }
  }

  return lines.join("\n");
}
