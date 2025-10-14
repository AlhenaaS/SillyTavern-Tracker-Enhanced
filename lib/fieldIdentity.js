import { debug } from "./utils.js";

const legacyIdFallbacksLogged = new Set();

export function getLegacyFieldName(field) {
	if (!field || typeof field !== "object") {
		return "";
	}
	const legacyName = typeof field.name === "string" ? field.name.trim() : "";
	return legacyName || "";
}

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
