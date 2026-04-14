import { describe, expect, it } from "bun:test";
import { makeTurnStateQueue } from "../src/turn-state.js";

describe("Gateway turn patch queue", () => {
  it("keeps last write and drops superseded patches within throttle window", () => {
    const queue = makeTurnStateQueue(250);

    queue.enqueuePatch("t1", 42, "first", 0, "edit_primary");
    queue.enqueuePatch("t1", 42, "second", 120, "edit_primary");
    queue.enqueuePatch("t1", 42, "third", 200, "edit_primary");

    const turn = queue.getTurn("t1");
    expect(turn?.pendingPatch).toBe("third");
    expect(turn?.droppedPatches).toBe(2);
    expect(turn?.pendingSince).toBe(200);
    expect(turn?.throttleMs).toBe(250);
    expect(turn?.phase).toBe("queued");
  });

  it("flushes only when due and flushes the latest patch", () => {
    const queue = makeTurnStateQueue(250);

    queue.enqueuePatch("t1", 42, "first", 0, "edit_primary");
    queue.enqueuePatch("t1", 42, "second", 120, "edit_primary");

    const due = queue.drainDue(400);

    expect(due).toHaveLength(1);
    expect(due[0]?.turnId).toBe("t1");
    expect(due[0]?.patch).toBe("second");
    expect(due[0]?.mode).toBe("edit_primary");

    const snap = queue.getTurn("t1");
    expect(snap?.pendingPatch).toBeUndefined();
    expect(snap?.lastDispatchedPatch).toBe("second");
  });

  it("supports separate turns independently", () => {
    const queue = makeTurnStateQueue(100);

    queue.enqueuePatch("t1", 1, "a", 0, "edit_primary");
    queue.enqueuePatch("t2", 2, "b", 0, "edit_primary");

    const due = queue.drainDue(150);
    expect(due.map((entry) => entry.turnId).sort()).toEqual(["t1", "t2"]);
    expect(due.map((entry) => entry.patch)).toEqual(["a", "b"]);
  });

  it("applies normalized events with phase transitions", () => {
    const queue = makeTurnStateQueue(250);

    const phase = queue.applyEvent({
      turnId: "t3",
      chatId: 7,
      now: 100,
      event: { type: "phase", phase: "thinking", summary: "warming up" },
      canEditPrimary: true,
    });

    expect(phase.phase).toBe("thinking");
    expect(phase.mode).toBe("edit_primary");
    expect(phase.enqueueStatus).toBe("queued");
    expect(phase.patch).toContain("Thinking");

    const stream = queue.applyEvent({
      turnId: "t3",
      chatId: 7,
      now: 450,
      event: {
        type: "tool_stream",
        events: [{ type: "tool_call", name: "search" }],
      },
      canEditPrimary: false,
    });

    expect(stream.phase).toBe("tool_stream");
    expect(stream.mode).toBe("fallback_auxiliary");
    expect(stream.patch).toContain("Tool activity");

    const finalState = queue.getTurn("t3");
    expect(finalState?.phase).toBe("tool_stream");
  });

  it("skips no-op patches when content is unchanged", () => {
    const queue = makeTurnStateQueue(250);

    const first = queue.applyEvent({
      turnId: "t4",
      chatId: 9,
      now: 100,
      event: { type: "phase", phase: "acknowledged", summary: "working" },
      canEditPrimary: true,
    });

    const second = queue.applyEvent({
      turnId: "t4",
      chatId: 9,
      now: 120,
      event: { type: "phase", phase: "acknowledged", summary: "working" },
      canEditPrimary: true,
    });

    expect(first.enqueueStatus).toBe("queued");
    expect(second.enqueueStatus).toBe("noop");
  });
});
