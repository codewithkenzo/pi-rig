export interface TelegramPatchRequest {
  readonly turnId: string;
  readonly botToken: string;
  readonly chatId: number;
  readonly threadId?: number;
  readonly text: string;
  readonly messageId?: number;
}

export interface TelegramPatchResult {
  readonly messageId: number;
  readonly strategy: "send" | "edit" | "replace";
}

export interface TelegramApiErrorShape {
  readonly ok?: boolean;
  readonly error_code?: number;
  readonly description?: string;
  readonly result?: unknown;
}

const shouldReplaceOnEditError = (status: number, body: TelegramApiErrorShape | undefined): boolean => {
  if (status === 400 || status === 404) return true;
  if (body?.error_code === 400 || body?.error_code === 404) return true;
  const description = body?.description?.toLowerCase() ?? "";
  return (
    description.includes("can't be edited") ||
    description.includes("message to edit not found") ||
    description.includes("message can't be edited")
  );
};

const parseJsonBody = async (response: Response): Promise<TelegramApiErrorShape | undefined> => {
  try {
    return (await response.json()) as TelegramApiErrorShape;
  } catch {
    return undefined;
  }
};

export interface TelegramAdapter {
  applyPatch(request: TelegramPatchRequest): Promise<TelegramPatchResult>;
}

type FetchLike = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>;

export const makeTelegramAdapter = (
  fetchFn: FetchLike = fetch,
): TelegramAdapter => {
  const call = async (
    botToken: string,
    method: "sendMessage" | "editMessageText",
    body: Record<string, unknown>,
  ): Promise<Response> =>
    fetchFn(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const sendMessage = async (request: TelegramPatchRequest): Promise<TelegramPatchResult> => {
    const response = await call(request.botToken, "sendMessage", {
      chat_id: request.chatId,
      text: request.text,
      ...(request.threadId === undefined ? {} : { message_thread_id: request.threadId }),
    });
    const body = await parseJsonBody(response);
    if (!response.ok || body?.ok === false) {
      throw new Error(`telegram send failed: ${response.status} ${body?.description ?? "unknown"}`);
    }
    const messageId = (body?.result as { message_id?: number } | undefined)?.message_id;
    if (typeof messageId !== "number") {
      throw new Error("telegram send failed: missing message_id");
    }
    return { messageId, strategy: "send" };
  };

  const editMessage = async (request: TelegramPatchRequest): Promise<TelegramPatchResult | null> => {
    if (request.messageId === undefined) return null;
    const response = await call(request.botToken, "editMessageText", {
      chat_id: request.chatId,
      message_id: request.messageId,
      text: request.text,
    });
    const body = await parseJsonBody(response);
    if (response.ok && body?.ok !== false) {
      return { messageId: request.messageId, strategy: "edit" };
    }
    if (shouldReplaceOnEditError(response.status, body)) {
      return null;
    }
    throw new Error(`telegram edit failed: ${response.status} ${body?.description ?? "unknown"}`);
  };

  return {
    applyPatch: async (request: TelegramPatchRequest): Promise<TelegramPatchResult> => {
      const edited = await editMessage(request);
      if (edited !== null) return edited;
      const sent = await sendMessage(request);
      return request.messageId === undefined ? sent : { ...sent, strategy: "replace" };
    },
  };
};
