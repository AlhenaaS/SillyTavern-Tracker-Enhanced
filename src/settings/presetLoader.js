import { extensionFolderPath } from "../../index.js";
import { buildCanonicalFieldMap } from "../../lib/legacyRegistry.js";
import { warn } from "../../lib/utils.js";

const DEFAULT_PRESET_LOCALE = "en";

const presetDefinitionCache = new Map();
const presetLoadPromises = new Map();
const presetFilePathCache = new Map();

let defaultPresetValues = null;
let canonicalFieldMap = null;

function normalizeLocaleId(locale) {
	if (locale === null || locale === undefined) {
		return null;
	}
	return String(locale).trim().toLowerCase();
}

function deepClone(value) {
	if (value === null || typeof value !== "object") {
		return value;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (_err) {
		return value;
	}
}

function clonePresetDefinition(definition) {
	if (!definition) {
		return null;
	}
	const cloned = { ...definition };
	if (definition.values && typeof definition.values === "object") {
		cloned.values = deepClone(definition.values);
	}
	return cloned;
}

export function getPresetFileCandidates(localeId) {
	const normalized = normalizeLocaleId(localeId) || DEFAULT_PRESET_LOCALE;
	const candidates = [];
	const seen = new Set();

	function addCandidate(candidate) {
		const normalizedCandidate = candidate ? String(candidate).trim() : "";
		if (!normalizedCandidate || seen.has(normalizedCandidate)) {
			return;
		}
		seen.add(normalizedCandidate);
		candidates.push(normalizedCandidate);
	}

	const cached = presetFilePathCache.get(normalized);
	if (cached) {
		addCandidate(cached);
	}

	addCandidate(normalized);

	if (normalized.includes("_")) {
		addCandidate(normalized.replace(/_/g, "-"));
	}

	const segments = normalized.split("-");
	if (segments.length >= 2) {
		const upperVariant = `${segments[0]}-${segments
			.slice(1)
			.map((part) => part.toUpperCase())
			.join("-")}`;
		addCandidate(upperVariant);
	}

	return candidates;
}

async function fetchPresetDefinition(localeId) {
	const normalized = normalizeLocaleId(localeId) || DEFAULT_PRESET_LOCALE;
	const attempts = [];

	for (const candidate of getPresetFileCandidates(normalized)) {
		try {
			const response = await fetch(`${extensionFolderPath}/presets/${candidate}.json`);
			if (!response.ok) {
				attempts.push({ candidate, status: response.status });
				continue;
			}

			const json = await response.json();
			const definition = {
				locale: normalized,
				candidate,
				...json,
			};
			presetFilePathCache.set(normalized, candidate);
			return definition;
		} catch (err) {
			attempts.push({ candidate, error: err?.message || String(err) });
		}
	}

	warn("Locale preset not found", { locale: normalized, attempts });
	return null;
}

export async function loadLocalePresetDefinition(localeId) {
	const normalized = normalizeLocaleId(localeId) || DEFAULT_PRESET_LOCALE;

	if (presetDefinitionCache.has(normalized)) {
		return clonePresetDefinition(presetDefinitionCache.get(normalized));
	}

	if (!presetLoadPromises.has(normalized)) {
		presetLoadPromises.set(normalized, fetchPresetDefinition(normalized));
	}

	try {
		const definition = await presetLoadPromises.get(normalized);
		if (definition) {
			presetDefinitionCache.set(normalized, definition);
			return clonePresetDefinition(definition);
		}
		return null;
	} finally {
		presetLoadPromises.delete(normalized);
	}
}

export async function ensureDefaultPresetSnapshot() {
	if (!defaultPresetValues) {
		const definition = await loadLocalePresetDefinition(DEFAULT_PRESET_LOCALE);
		if (!definition || !definition.values) {
			throw new Error(`Default preset snapshot missing or invalid for locale "${DEFAULT_PRESET_LOCALE}"`);
		}

		defaultPresetValues = deepClone(definition.values);
		canonicalFieldMap = buildCanonicalFieldMap(defaultPresetValues.trackerDef || {});
	}

	return deepClone(defaultPresetValues);
}

export function getDefaultPresetSnapshot() {
	if (!defaultPresetValues) {
		throw new Error("Default preset snapshot has not been loaded yet.");
	}
	return deepClone(defaultPresetValues);
}

export function getCanonicalFieldMap() {
	if (!canonicalFieldMap) {
		throw new Error("Canonical tracker definition map has not been initialised.");
	}
	return canonicalFieldMap;
}
