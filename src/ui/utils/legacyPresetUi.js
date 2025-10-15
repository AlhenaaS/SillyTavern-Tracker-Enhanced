import { LEGACY_REASON_CODES } from "../../../lib/legacyRegistry.js";
import { t } from "../../../lib/i18n.js";

const REASON_LABEL_KEYS = {
	[LEGACY_REASON_CODES.INVALID_TRACKER_ROOT]: "settings.presets.legacy.reason.invalid_tracker_root",
	[LEGACY_REASON_CODES.MISSING_CANONICAL_FIELD]: "settings.presets.legacy.reason.missing_canonical_field",
	[LEGACY_REASON_CODES.INVALID_FIELD_SHAPE]: "settings.presets.legacy.reason.invalid_field_shape",
	[LEGACY_REASON_CODES.MISSING_FIELD_ID]: "settings.presets.legacy.reason.missing_field_id",
	[LEGACY_REASON_CODES.MISMATCHED_FIELD_ID]: "settings.presets.legacy.reason.mismatched_field_id",
	[LEGACY_REASON_CODES.MISSING_FIELD_LABEL]: "settings.presets.legacy.reason.missing_field_label",
	[LEGACY_REASON_CODES.LEGACY_NAME_PROPERTY]: "settings.presets.legacy.reason.legacy_name_property",
	[LEGACY_REASON_CODES.MISSING_PRESENCE]: "settings.presets.legacy.reason.missing_presence",
	[LEGACY_REASON_CODES.INVALID_PRESENCE]: "settings.presets.legacy.reason.invalid_presence",
	[LEGACY_REASON_CODES.METADATA_MISMATCH]: "settings.presets.legacy.reason.metadata_mismatch",
	[LEGACY_REASON_CODES.METADATA_NORMALIZED]: "settings.presets.legacy.reason.metadata_normalized",
	[LEGACY_REASON_CODES.MISSING_NESTED_FIELDS]: "settings.presets.legacy.reason.missing_nested_fields",
};

const REASON_FALLBACKS = {
	[LEGACY_REASON_CODES.INVALID_TRACKER_ROOT]: "Tracker definition is incompatible with the latest schema.",
	[LEGACY_REASON_CODES.MISSING_CANONICAL_FIELD]: "Missing a required tracker field.",
	[LEGACY_REASON_CODES.INVALID_FIELD_SHAPE]: "A tracker field has an invalid structure.",
	[LEGACY_REASON_CODES.MISSING_FIELD_ID]: "A field is missing its canonical identifier.",
	[LEGACY_REASON_CODES.MISMATCHED_FIELD_ID]: "A field identifier does not match the canonical schema.",
	[LEGACY_REASON_CODES.MISSING_FIELD_LABEL]: "A field is missing its display label.",
	[LEGACY_REASON_CODES.LEGACY_NAME_PROPERTY]: "Legacy field name property detected.",
	[LEGACY_REASON_CODES.MISSING_PRESENCE]: "Field presence value is missing.",
	[LEGACY_REASON_CODES.INVALID_PRESENCE]: "Field presence value is invalid.",
	[LEGACY_REASON_CODES.METADATA_MISMATCH]: "Field metadata conflicts with the canonical schema.",
	[LEGACY_REASON_CODES.METADATA_NORMALIZED]: "Field metadata was normalized automatically.",
	[LEGACY_REASON_CODES.MISSING_NESTED_FIELDS]: "Nested tracker fields are missing.",
};

const SEVERITY_LABEL_KEYS = {
	legacy: "settings.presets.legacy.severity.legacy",
	changed: "settings.presets.legacy.severity.changed",
};

const SEVERITY_FALLBACKS = {
	legacy: "Legacy issue",
	changed: "Normalized automatically",
};

export function resolveLegacyReasonLabel(code) {
	if (!code) {
		return t("settings.presets.legacy.reason.unknown", "Compatibility issue detected.");
	}
	const key = REASON_LABEL_KEYS[code] || "settings.presets.legacy.reason.unknown";
	const fallback = REASON_FALLBACKS[code] || "Compatibility issue detected.";
	return t(key, fallback);
}

export function resolveLegacySeverityLabel(severity) {
	const normalized = typeof severity === "string" ? severity.toLowerCase() : "";
	const key = SEVERITY_LABEL_KEYS[normalized] || "settings.presets.legacy.severity.unknown";
	const fallback = SEVERITY_FALLBACKS[normalized] || "Notice";
	return t(key, fallback);
}

export function mapLegacyReasons(reasons = []) {
	if (!Array.isArray(reasons) || reasons.length === 0) {
		return [];
	}
	return reasons.map((reason) => ({
		code: reason?.code || null,
		label: resolveLegacyReasonLabel(reason?.code),
		path: reason?.path || "",
		severity: reason?.severity || "legacy",
		severityLabel: resolveLegacySeverityLabel(reason?.severity || "legacy"),
	}));
}

export function formatLegacyTimestamp(timestamp) {
	if (!timestamp || typeof timestamp !== "string") {
		return t("settings.presets.legacy.quarantined.unknown", "Unknown time");
	}
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return timestamp;
	}
	try {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date);
	} catch {
		return date.toLocaleString();
	}
}

