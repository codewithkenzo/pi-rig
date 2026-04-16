import { stripAnsi } from "../../../shared/ui/hud.js";

const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const CONTROL_RE = /[\x00-\x08\x0b-\x1f]/g;

export const sanitizeFlowText = (text: string): string =>
	stripAnsi(text.replace(OSC_RE, "")).replace(CONTROL_RE, "");
