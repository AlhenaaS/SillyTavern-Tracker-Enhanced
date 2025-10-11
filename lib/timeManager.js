import { debug, warn } from "./utils.js";

function sanitizeAnchor(anchorValue) {
	if (typeof anchorValue !== "string") return null;
	let trimmed = anchorValue.trim();
	if (!trimmed) return null;

	if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		trimmed = trimmed.slice(1, -1).trim();
	}

	return trimmed || null;
}

function parseIso(anchorValue) {
	const sanitized = sanitizeAnchor(anchorValue);
	if (!sanitized) {
		return { sanitized: null, timestampMs: null, iso: null, error: "No TimeAnchor provided." };
	}

	const timestamp = Date.parse(sanitized);
	if (Number.isNaN(timestamp)) {
		return { sanitized, timestampMs: null, iso: null, error: `Invalid ISO-8601 timestamp: ${sanitized}` };
	}

	const iso = new Date(timestamp).toISOString();
	return { sanitized, timestampMs: timestamp, iso, error: null };
}

function parsePrevious(previousAnalysis) {
	if (!previousAnalysis || typeof previousAnalysis !== "object") return { timestampMs: null };
	const { IsoTimestamp } = previousAnalysis;
	if (typeof IsoTimestamp !== "string" || !IsoTimestamp.trim()) return { timestampMs: null };

	const parsed = Date.parse(IsoTimestamp);
	if (Number.isNaN(parsed)) return { timestampMs: null };
	return { timestampMs: parsed };
}

export function buildTimeAnalysis(anchorValue, previousAnalysis = null) {
	const parsed = parseIso(anchorValue);

	if (!parsed.sanitized) {
		if (previousAnalysis && typeof previousAnalysis === "object") {
			debug("🕒 TimeAnchor not provided; reusing previous analysis", { previousAnalysis });
			return previousAnalysis;
		}
		return null;
	}

	if (parsed.error) {
		warn("TimeAnchor parsing issue", { anchor: anchorValue, error: parsed.error });
	}

	const previous = parsePrevious(previousAnalysis);

	let elapsedSeconds = null;
	let elapsedDays = null;
	let note = parsed.error ? parsed.error : "TimeAnchor parsed successfully.";

	if (!parsed.error && parsed.timestampMs !== null && previous.timestampMs !== null) {
		const delta = parsed.timestampMs - previous.timestampMs;
		if (delta < 0) {
			note = "TimeAnchor regressed; elapsed values reset to 0.";
			elapsedSeconds = 0;
			elapsedDays = 0;
		} else {
			elapsedSeconds = Math.round(delta / 1000);
			elapsedDays = delta / 86400000;
		}
	}

	const analysis = {
		AnchorRaw: parsed.sanitized,
		IsoTimestamp: parsed.iso ?? "",
		EpochMillis: parsed.timestampMs !== null ? String(parsed.timestampMs) : "",
		ElapsedSeconds: elapsedSeconds !== null ? String(elapsedSeconds) : "",
		ElapsedDays: elapsedDays !== null ? elapsedDays.toFixed(6) : "",
		TimelineNote: note,
		ParsedAt: new Date().toISOString(),
	};

	debug("🕒 Parsed TimeAnchor", { anchor: analysis.AnchorRaw, analysis });

	return analysis;
}
