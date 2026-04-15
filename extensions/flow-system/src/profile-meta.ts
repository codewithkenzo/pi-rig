import type { FlowProfile } from "./types.js";

export interface ProfileMeta {
	model?: string;
	agent?: string;
}

export interface ProfileMetaHandlers {
	metaPatch: () => ProfileMeta;
	onModelFallback: () => void;
	onAgentPromptUnavailable: () => void;
}

export const createProfileMetaHandlers = (
	profile: Pick<FlowProfile, "model" | "agent">,
	onSync: (meta: ProfileMeta) => void,
): ProfileMetaHandlers => {
	const meta: ProfileMeta = {
		...(profile.model !== undefined && profile.model.trim().length > 0 ? { model: profile.model } : {}),
		...(profile.agent !== undefined && profile.agent.trim().length > 0 ? { agent: profile.agent } : {}),
	};

	const metaPatch = (): ProfileMeta => ({
		...(meta.model !== undefined ? { model: meta.model } : {}),
		...(meta.agent !== undefined ? { agent: meta.agent } : {}),
	});

	const onModelFallback = (): void => {
		delete meta.model;
		onSync(metaPatch());
	};

	const onAgentPromptUnavailable = (): void => {
		delete meta.agent;
		onSync(metaPatch());
	};

	return { metaPatch, onModelFallback, onAgentPromptUnavailable };
};
