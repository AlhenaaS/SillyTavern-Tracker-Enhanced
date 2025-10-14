import { debug } from "./utils.js";

/**
 * Field identity helpers centralize how tracker schemas reference fields.
 * Definitions created prior to metadata version 4 only declared `name`, so every
 * accessor still tolerates legacy data while preferring canonical `id` + `label`.
 * When all user data migrates, the legacy fallbacks can be retired in one place.
 */

const legacyIdFallbacksLogged = new Set();

/**
 * Reads the legacy `name` property from a field definition.
 * @param {object} field - Field schema node.
 * @returns {string} Trimmed legacy name or empty string.
 */
export function getLegacyFieldName(field) {
	if (!field || typeof field !== "object") {
		return "";
	}
	const legacyName = typeof field.name === "string" ? field.name.trim() : "";
	return legacyName || "";
}

/**
 * Resolves the canonical field identifier, falling back to the legacy name when required.
 * @param {object} field - Field schema node.
 * @returns {string} Canonical field id or the legacy name.
 */
export function getFieldId(field) {
	if (!field || typeof field !== "object") {
		return "";
	}

	const rawId = typeof field.id === "string" ? field.id.trim() : "";
	if (rawId) {
		return rawId;
	}

	const legacyName = getLegacyFieldName(field);
	if (legacyName && !legacyIdFallbacksLogged.has(legacyName)) {
		legacyIdFallbacksLogged.add(legacyName);
		debug("getFieldId fallback to legacy field name", { legacyName });
	}

	return legacyName;
}

/**
 * Resolves the display label for a field, preferring `label` then `id` and finally the legacy name.
 * @param {object} field - Field schema node.
 * @returns {string} Human-readable label.
 */
export function getFieldLabel(field) {
	if (!field || typeof field !== "object") {
		return "";
	}

	const rawLabel = typeof field.label === "string" ? field.label.trim() : "";
	if (rawLabel) {
		return rawLabel;
	}

	const legacyName = getLegacyFieldName(field);
	if (legacyName) {
		return legacyName;
	}

	const fallbackId = getFieldId(field);
	return fallbackId || "";
}

/**
 * Determines which key inside a tracker node currently holds the field value.
 * @param {object} node - Tracker data object.
 * @param {object} field - Field schema node.
 * @returns {string|null} Matching key or null if none found.
 */
export function getExistingFieldKey(node, field) {
	if (!node || typeof node !== "object") {
		return null;
	}

	const fieldId = getFieldId(field);
	if (fieldId && Object.prototype.hasOwnProperty.call(node, fieldId)) {
		return fieldId;
	}

	const legacyName = getLegacyFieldName(field);
	if (legacyName && legacyName !== fieldId && Object.prototype.hasOwnProperty.call(node, legacyName)) {
		return legacyName;
	}

	return null;
}

/**
 * Reads the tracker value for a field using either the canonical id or any legacy name.
 * @param {object} node - Tracker data object.
 * @param {object} field - Field schema node.
 * @returns {*} Field value or undefined.
 */
export function resolveTrackerValue(node, field) {
	if (!node || typeof node !== "object") {
		return undefined;
	}

	const key = getExistingFieldKey(node, field);
	if (key === null) {
		return undefined;
	}

	return node[key];
}

/**
 * Assigns a tracker value using the canonical id and scrubs any stale legacy name entry.
 * @param {object} node - Tracker data object.
 * @param {object} field - Field schema node.
 * @param {*} value - Value to assign.
 */
export function assignTrackerValue(node, field, value) {
	if (!node || typeof node !== "object") {
		return;
	}

	const fieldId = getFieldId(field);
	const legacyName = getLegacyFieldName(field);
	const targetKey = fieldId || legacyName;

	if (!targetKey) {
		return;
	}

	node[targetKey] = value;

	if (legacyName && legacyName !== targetKey && Object.prototype.hasOwnProperty.call(node, legacyName)) {
		delete node[legacyName];
	}
}

/**
 * Removes a field from the tracker node, clearing both canonical and legacy keys.
 * @param {object} node - Tracker data object.
 * @param {object} field - Field schema node.
 */
export function deleteFieldFromNode(node, field) {
	if (!node || typeof node !== "object") {
		return;
	}

	const fieldId = getFieldId(field);
	if (fieldId && Object.prototype.hasOwnProperty.call(node, fieldId)) {
		delete node[fieldId];
	}

	const legacyName = getLegacyFieldName(field);
	if (legacyName && legacyName !== fieldId && Object.prototype.hasOwnProperty.call(node, legacyName)) {
		delete node[legacyName];
	}
}
