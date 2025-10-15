export const LEGACY_PRESET_PREFIX = "❌ Legacy";

export const LEGACY_REASON_CODES = Object.freeze({
	INVALID_TRACKER_ROOT: "invalid_tracker_root",
	MISSING_CANONICAL_FIELD: "missing_canonical_field",
	INVALID_FIELD_SHAPE: "invalid_field_shape",
	MISSING_FIELD_ID: "missing_field_id",
	MISMATCHED_FIELD_ID: "mismatched_field_id",
	MISSING_FIELD_LABEL: "missing_field_label",
	LEGACY_NAME_PROPERTY: "legacy_name_property",
	MISSING_PRESENCE: "missing_presence",
	INVALID_PRESENCE: "invalid_presence",
	METADATA_MISMATCH: "metadata_mismatch",
	METADATA_NORMALIZED: "metadata_normalized",
	MISSING_NESTED_FIELDS: "missing_nested_fields",
});

const REASON_SEVERITY = Object.freeze({
	LEGACY: "legacy",
	CHANGED: "changed",
});

/**
 * Builds a canonical map of tracker fields for identity and metadata alignment.
 * @param {object} definition - Tracker definition to index.
 * @returns {Map<string, { metadata: object, nested: Map }>} Canonical field map.
 */
export function buildCanonicalFieldMap(definition) {
	const map = new Map();
	if (!isPlainObject(definition)) {
		return map;
	}
	for (const [fieldId, field] of Object.entries(definition)) {
		if (!isPlainObject(field)) {
			continue;
		}
		map.set(fieldId, {
			id: typeof field.id === "string" ? field.id.trim() : null,
			label: typeof field.label === "string" ? field.label.trim() : null,
			metadata: normalizeMetadata(field.metadata || {}),
			nested: buildCanonicalFieldMap(field.nestedFields || {}),
		});
	}
	return map;
}

/**
 * Analyzes a tracker definition against the canonical schema.
 * @param {object} definition - Tracker definition to inspect.
 * @param {{ canonicalDefinition?: object, canonicalMap?: Map<string, any>, rootPath?: string }} [options] - Analysis options.
 * @returns {{ isLegacy: boolean, changed: boolean, reasons: Array, normalizedDefinition: object }}
 */
export function analyzeTrackerDefinition(definition, options = {}) {
	const { canonicalDefinition = null, canonicalMap = null, rootPath = "trackerDef" } = options;
	const canonical = canonicalMap || buildCanonicalFieldMap(canonicalDefinition);
	const clone = deepClone(definition);
	const context = createAnalysisContext(rootPath);

	if (!isPlainObject(clone)) {
		pushReason(context, LEGACY_REASON_CODES.INVALID_TRACKER_ROOT, [], REASON_SEVERITY.LEGACY, { receivedType: typeof clone });
		return finalizeTrackerAnalysis(context, {}, canonical);
	}

	alignTrackerFields(clone, canonical, context, []);

	return finalizeTrackerAnalysis(context, clone, canonical);
}

/**
 * Analyzes a preset payload for legacy tracker data without mutating inputs.
 * @param {string} presetName - Name of the preset being inspected.
 * @param {object} presetPayload - Preset values to analyze.
 * @param {{ canonicalDefinition?: object, canonicalMap?: Map<string, any> }} [options] - Analysis options.
 * @returns {{
 *   presetName: string,
 *   isLegacy: boolean,
 *   changed: boolean,
 *   reasons: Array,
 *   normalizedSnapshot: object,
 *   trackerAnalysis: object
 * }}
 */
export function analyzePresetSnapshot(presetName, presetPayload, options = {}) {
	const clone = deepClone(presetPayload);
	const trackerAnalysis = analyzeTrackerDefinition(clone?.trackerDef, {
		...options,
		rootPath: `${presetName || "preset"}.trackerDef`,
	});
	if (clone && Object.prototype.hasOwnProperty.call(clone || {}, "trackerDef")) {
		clone.trackerDef = trackerAnalysis.normalizedDefinition;
	}

	const reasons = Array.isArray(trackerAnalysis.reasons) ? trackerAnalysis.reasons.slice() : [];
	const isLegacy = Boolean(trackerAnalysis.isLegacy);
	const changed = Boolean(trackerAnalysis.changed);

	if (isLegacy) {
		logDebug("Legacy registry flagged preset tracker definition", {
			presetName,
			reasonCount: reasons.length,
			reasonCodes: reasons.map((entry) => entry.code),
		});
	}

	return {
		presetName,
		isLegacy,
		changed,
		reasons,
		normalizedSnapshot: clone,
		trackerAnalysis,
	};
}

/**
 * Generates a unique quarantine label for legacy presets without mutating input maps.
 * @param {string} originalName - Source preset name.
 * @param {Iterable<string>|Record<string, any>} existingNames - Existing preset identifiers.
 * @param {{ prefix?: string, timestamp?: Date }} [options] - Generation options.
 * @returns {string} Unique legacy preset label.
 */
export function generateLegacyPresetName(originalName, existingNames = [], options = {}) {
	const prefix = typeof options.prefix === "string" && options.prefix.trim()
		? options.prefix.trim()
		: LEGACY_PRESET_PREFIX;
	const name = typeof originalName === "string" && originalName.trim()
		? originalName.trim()
		: "Preset";
	const timestamp = formatTimestamp(options.timestamp instanceof Date ? options.timestamp : new Date());
	const base = `${prefix} ${timestamp} ${name}`.trim();

	const taken = normalizeExistingNames(existingNames);
	let candidate = base;
	let counter = 2;
	while (taken.has(candidate)) {
		candidate = `${base} (${counter++})`;
	}
	return candidate;
}

function finalizeTrackerAnalysis(context, normalizedDefinition, canonicalMap) {
	const changed = Boolean(context.changed);
	const isLegacy = Boolean(context.legacyDetected) || hasCanonicalGaps(normalizedDefinition, canonicalMap);
	if (isLegacy && context.rootPath === "trackerDef") {
		logDebug("Legacy registry flagged tracker definition", {
			rootPath: context.rootPath,
			reasonCodes: context.reasons.map((entry) => entry.code),
		});
	}
	return {
		isLegacy,
		changed,
		reasons: context.reasons,
		normalizedDefinition,
	};
}

function createAnalysisContext(rootPath = "trackerDef") {
	return {
		rootPath,
		changed: false,
		legacyDetected: false,
		reasons: [],
	};
}

function alignTrackerFields(fields, canonicalMap, context, path) {
	if (!isPlainObject(fields)) {
		if (canonicalMap && canonicalMap.size > 0) {
			pushReason(context, LEGACY_REASON_CODES.INVALID_TRACKER_ROOT, path, REASON_SEVERITY.LEGACY, {
				receivedType: typeof fields,
			});
		}
		return;
	}

	for (const [canonicalId, canonicalField] of canonicalMap.entries()) {
		if (!requiresCanonicalField(canonicalField)) {
			continue;
		}
		if (!isPlainObject(fields[canonicalId])) {
			pushReason(context, LEGACY_REASON_CODES.MISSING_CANONICAL_FIELD, [...path, canonicalId], REASON_SEVERITY.LEGACY);
		}
	}

	for (const [fieldId, field] of Object.entries(fields)) {
		const fieldPath = [...path, fieldId];
		if (!isPlainObject(field)) {
			pushReason(context, LEGACY_REASON_CODES.INVALID_FIELD_SHAPE, fieldPath, REASON_SEVERITY.LEGACY, {
				receivedType: typeof field,
			});
			continue;
		}

		const canonicalField = canonicalMap.get(fieldId) || null;
		sanitizeField(field, canonicalField, context, fieldPath);

		if (isPlainObject(field.nestedFields)) {
			const nestedCanonical = canonicalField?.nested || new Map();
			alignTrackerFields(field.nestedFields, nestedCanonical, context, [...fieldPath, "nestedFields"]);
		} else if (canonicalField?.nested?.size && requiresCanonicalField(canonicalField)) {
			pushReason(context, LEGACY_REASON_CODES.MISSING_NESTED_FIELDS, [...fieldPath, "nestedFields"], REASON_SEVERITY.LEGACY);
		}
	}
}

function sanitizeField(field, canonicalField, context, path) {
	const fieldId = path[path.length - 1];
	const normalizedId = typeof field.id === "string" ? field.id.trim() : "";
	const canonicalFieldId = typeof canonicalField?.id === "string" ? canonicalField.id : null;
	if (normalizedId) {
		if (field.id !== normalizedId) {
			field.id = normalizedId;
			context.changed = true;
		}
		if (canonicalFieldId && normalizedId !== canonicalFieldId) {
			pushReason(context, LEGACY_REASON_CODES.MISMATCHED_FIELD_ID, path, REASON_SEVERITY.LEGACY, {
				expected: canonicalFieldId,
				received: normalizedId,
			});
			field.id = canonicalFieldId;
			context.changed = true;
		} else if (!canonicalFieldId && normalizedId !== fieldId) {
			pushReason(context, LEGACY_REASON_CODES.MISMATCHED_FIELD_ID, path, REASON_SEVERITY.CHANGED, {
				expected: fieldId,
				received: normalizedId,
			});
		}
	} else {
		if (canonicalFieldId) {
			pushReason(context, LEGACY_REASON_CODES.MISSING_FIELD_ID, path, REASON_SEVERITY.LEGACY, {
				expected: canonicalFieldId,
			});
			field.id = canonicalFieldId;
			context.changed = true;
		} else {
			pushReason(context, LEGACY_REASON_CODES.MISSING_FIELD_ID, path, REASON_SEVERITY.LEGACY);
		}
	}

	const normalizedLabel = typeof field.label === "string" ? field.label.trim() : "";
	if (normalizedLabel) {
		if (field.label !== normalizedLabel) {
			field.label = normalizedLabel;
			context.changed = true;
		}
	} else {
		pushReason(context, LEGACY_REASON_CODES.MISSING_FIELD_LABEL, path, REASON_SEVERITY.LEGACY);
	}

	if (typeof field.name === "string" && field.name.trim()) {
		pushReason(context, LEGACY_REASON_CODES.LEGACY_NAME_PROPERTY, path, REASON_SEVERITY.LEGACY, {
			legacyName: field.name.trim(),
		});
	}

	normalizeFieldPresence(field, context, path);
	normalizeFieldMetadata(field, canonicalField, context, path);
}

function normalizeFieldPresence(field, context, path) {
	const rawPresence = typeof field.presence === "string" ? field.presence.trim().toUpperCase() : null;
	const normalizedPresence = rawPresence === "STATIC" ? "STATIC" : "DYNAMIC";

	if (field.presence !== normalizedPresence) {
		const severity = rawPresence ? REASON_SEVERITY.LEGACY : REASON_SEVERITY.CHANGED;
		const code = rawPresence ? LEGACY_REASON_CODES.INVALID_PRESENCE : LEGACY_REASON_CODES.MISSING_PRESENCE;
		pushReason(context, code, path, severity, { received: field.presence });
		field.presence = normalizedPresence;
		context.changed = true;
	}
}

function normalizeFieldMetadata(field, canonicalField, context, path) {
	const canonicalMetadata = canonicalField?.metadata || null;
	const normalized = normalizeMetadata(field.metadata || {});
	const currentMetadata = isPlainObject(field.metadata) ? field.metadata : {};

	if (canonicalMetadata) {
		if (!metadataEquals(normalized, canonicalMetadata)) {
			pushReason(context, LEGACY_REASON_CODES.METADATA_MISMATCH, path, REASON_SEVERITY.LEGACY, {
				expected: canonicalMetadata,
			});
			field.metadata = { ...canonicalMetadata };
			context.changed = true;
		} else if (!metadataEquals(currentMetadata, canonicalMetadata)) {
			pushReason(context, LEGACY_REASON_CODES.METADATA_NORMALIZED, path, REASON_SEVERITY.CHANGED);
			field.metadata = { ...canonicalMetadata };
			context.changed = true;
		}
	} else if (!metadataEquals(currentMetadata, normalized)) {
		pushReason(context, LEGACY_REASON_CODES.METADATA_NORMALIZED, path, REASON_SEVERITY.CHANGED);
		field.metadata = normalized;
		context.changed = true;
	}
}

function pushReason(context, code, path, severity = REASON_SEVERITY.LEGACY, details = null) {
	const routeParts = [];
	if (context.rootPath) {
		routeParts.push(context.rootPath);
	}
	if (Array.isArray(path)) {
		routeParts.push(...path.filter((segment) => segment !== undefined && segment !== null));
	} else if (typeof path === "string" && path) {
		routeParts.push(path);
	}
	const route = routeParts.join(".");
	context.reasons.push({
		code,
		path: route,
		severity,
		details: details || undefined,
	});
	if (severity === REASON_SEVERITY.LEGACY) {
		context.legacyDetected = true;
	}
}

function hasCanonicalGaps(definition, canonicalMap) {
	if (!canonicalMap || canonicalMap.size === 0) {
		return false;
	}
	if (!isPlainObject(definition)) {
		return true;
	}
	for (const [canonicalId, canonicalField] of canonicalMap.entries()) {
		if (!requiresCanonicalField(canonicalField)) {
			continue;
		}
		const field = definition[canonicalId];
		if (!isPlainObject(field)) {
			return true;
		}
		if (canonicalField?.nested?.size) {
			if (hasCanonicalGaps(field.nestedFields, canonicalField.nested)) {
				return true;
			}
		}
	}
	return false;
}

function requiresCanonicalField(canonicalField) {
	if (!canonicalField || typeof canonicalField !== "object") {
		return false;
	}
	return canonicalField.metadata?.internal === true;
}

function normalizeMetadata(metadata = {}) {
	const normalized = {
		internal: metadata.internal === true,
		external: metadata.external !== false,
		internalKeyId: typeof metadata.internalKeyId === "string" ? metadata.internalKeyId : null,
	};
	if (Object.prototype.hasOwnProperty.call(metadata, "internalOnly")) {
		normalized.internalOnly = Boolean(metadata.internalOnly);
	} else {
		normalized.internalOnly = normalized.internal && !normalized.external;
	}
	return normalized;
}

function metadataEquals(a = {}, b = {}) {
	return (
		a.internal === b.internal &&
		a.external === b.external &&
		(a.internalKeyId || null) === (b.internalKeyId || null) &&
		a.internalOnly === b.internalOnly
	);
}

function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
	if (!isPlainObject(value) && !Array.isArray(value)) {
		return value;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (err) {
		if (Array.isArray(value)) {
			return value.map((entry) => deepClone(entry));
		}
		const result = {};
		for (const [key, val] of Object.entries(value || {})) {
			result[key] = deepClone(val);
		}
		return result;
	}
}

function formatTimestamp(date) {
	const iso = date.toISOString();
	const day = iso.slice(0, 10);
	const time = iso.slice(11, 16);
	return `${day} ${time}`;
}

function normalizeExistingNames(existing) {
	if (existing instanceof Set) {
		return new Set(existing);
	}
	if (Array.isArray(existing)) {
		return new Set(existing);
	}
	const normalized = new Set();
	if (existing && typeof existing === "object") {
		for (const key of Object.keys(existing)) {
			normalized.add(key);
		}
	}
	return normalized;
}

let debugLogger = null;

export function setLegacyRegistryLogger(logger) {
	debugLogger = typeof logger === "function" ? logger : null;
}

function logDebug(message, payload) {
	if (debugLogger) {
		debugLogger(message, payload);
	} else if (typeof console !== "undefined" && typeof console.debug === "function") {
		console.debug("[tracker-enhanced]", message, payload);
	}
}
