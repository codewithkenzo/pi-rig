type SessionEntryLike = {
	type: string;
	customType?: string;
	data?: unknown;
};

type CustomEntryLike<T> = {
	type: "custom";
	customType: string;
	data: T;
};

export const findLatestCustomEntry = <T>(
	entries: readonly SessionEntryLike[],
	customType: string,
	isData: (value: unknown) => value is T,
): T | undefined =>
	entries
		.filter(
			(entry): entry is CustomEntryLike<T> =>
				entry.type === "custom" && entry.customType === customType && isData(entry.data),
		)
		.at(-1)?.data;
