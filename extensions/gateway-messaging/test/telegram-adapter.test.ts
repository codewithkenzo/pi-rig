import { describe, expect, it } from "bun:test";
import { makeTelegramAdapter } from "../src/telegram-adapter.js";

const okResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const errorResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("telegram adapter", () => {
  it("sends a new message when no primary message exists", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const adapter = makeTelegramAdapter(async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return okResponse({ ok: true, result: { message_id: 101 } });
    });

    const result = await adapter.applyPatch({
      turnId: "t1",
      botToken: "bot-token",
      chatId: -1001,
      text: "hello",
    });

    expect(result).toEqual({ messageId: 101, strategy: "send" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/sendMessage");
  });

  it("edits existing primary message when editable", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const adapter = makeTelegramAdapter(async (url, init) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return okResponse({ ok: true, result: true });
    });

    const result = await adapter.applyPatch({
      turnId: "t1",
      botToken: "bot-token",
      chatId: -1001,
      messageId: 77,
      text: "updated",
    });

    expect(result).toEqual({ messageId: 77, strategy: "edit" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/editMessageText");
  });

  it("replaces message when edit fails with non-editable error", async () => {
    let callCount = 0;
    const adapter = makeTelegramAdapter(async (url) => {
      callCount += 1;
      if (String(url).includes("/editMessageText")) {
        return errorResponse(400, { ok: false, description: "message can't be edited" });
      }
      return okResponse({ ok: true, result: { message_id: 999 } });
    });

    const result = await adapter.applyPatch({
      turnId: "t1",
      botToken: "bot-token",
      chatId: -1001,
      messageId: 77,
      text: "replacement",
    });

    expect(result).toEqual({ messageId: 999, strategy: "replace" });
    expect(callCount).toBe(2);
  });
});

