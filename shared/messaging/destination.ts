import { Type, type Static } from "@sinclair/typebox";

export const DestinationPlatformSchema = Type.Union([
	Type.Literal("telegram"),
	Type.Literal("discord"),
]);

export const DestinationKindSchema = Type.Union([
	Type.Literal("dm"),
	Type.Literal("topic"),
	Type.Literal("channel"),
	Type.Literal("thread"),
]);

export const DestinationSchema = Type.Object({
	platform: DestinationPlatformSchema,
	kind: DestinationKindSchema,
	id: Type.String({ minLength: 1 }),
	threadId: Type.Optional(Type.String({ minLength: 1 })),
});

export type Destination = Static<typeof DestinationSchema>;

/**
 * Accepts compact targets:
 * - telegram:<chat_id>
 * - telegram:<chat_id>:<thread_id>
 * - discord:<channel_or_thread_id>
 */
export const parseDestinationTarget = (target: string): Destination | null => {
	const trimmed = target.trim();
	if (trimmed.length === 0) return null;
	const parts = trimmed.split(":");
	if (parts.length < 2) return null;
	const platform = parts[0];
	if (platform === "telegram") {
		const id = parts[1]?.trim();
		const threadId = parts[2]?.trim();
		if (!id) return null;
		return threadId
			? { platform: "telegram", kind: "topic", id, threadId }
			: { platform: "telegram", kind: "dm", id };
	}
	if (platform === "discord") {
		const id = parts[1]?.trim();
		if (!id) return null;
		return { platform: "discord", kind: "channel", id };
	}
	return null;
};

export const formatDestinationTarget = (destination: Destination): string => {
	if (destination.platform === "telegram") {
		return destination.threadId
			? `telegram:${destination.id}:${destination.threadId}`
			: `telegram:${destination.id}`;
	}
	return `discord:${destination.id}`;
};
