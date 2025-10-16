import { getContext } from "../../../../../../scripts/extensions.js";
import { extensionFolderPath, extensionSettings } from "../index.js";
import { debug, warn } from "./utils.js";

const DEFAULT_LOCALE = "en";
const STATIC_FALLBACK_LOCALES = [
	{ id: DEFAULT_LOCALE, label: "English" },
	{ id: "zh-cn", label: "中文（简体）" },
];

const TRACKER_FALLBACK_ALIASES = {
	"en": DEFAULT_LOCALE,
	"en-us": DEFAULT_LOCALE,
	"en-gb": DEFAULT_LOCALE,
	"en-au": DEFAULT_LOCALE,
	"en-ca": DEFAULT_LOCALE,
	"zh": "zh-cn",
	"zh-cn": "zh-cn",
	"zh-hans": "zh-cn",
	"zh-sg": "zh-cn",
	"zh-my": "zh-cn",
};

const localeMetadata = new Map();
let supportedLocales = [];
const localeAliasMap = new Map();
let localeDiscoveryPromise = null;
let localeDiscoveryAttempted = false;

let currentLocale = DEFAULT_LOCALE;
let fallbackLocaleData = {};
let localeData = {};
let isInitialized = false;
const missingKeys = new Set();
const localeChangeListeners = new Set();
let loadingPromise = null;
const localeCache = new Map();
const localeFilePathCache = new Map();
const localeAssetAvailability = new Map();

function normalizeLocaleId(locale) {
	if (locale === null || locale === undefined) {
		return null;
	}
	return String(locale).trim().toLowerCase();
}

function registerLocaleAlias(alias, target) {
	const normalizedAlias = normalizeLocaleId(alias);
	const normalizedTarget = normalizeLocaleId(target);
	if (!normalizedAlias || !normalizedTarget) {
		return;
	}
	if (!localeAliasMap.has(normalizedAlias)) {
		localeAliasMap.set(normalizedAlias, normalizedTarget);
	}
}

function mergeAliasSources(...sources) {
	const merged = new Map();
	for (const source of sources) {
		if (!source) {
			continue;
		}
		if (source instanceof Map) {
			for (const [alias, target] of source.entries()) {
				const normalizedAlias = normalizeLocaleId(alias);
				const normalizedTarget = normalizeLocaleId(target);
				if (!normalizedAlias || !normalizedTarget) {
					continue;
				}
				if (!merged.has(normalizedAlias)) {
					merged.set(normalizedAlias, normalizedTarget);
				}
			}
			continue;
		}
		if (Array.isArray(source)) {
			for (const entry of source) {
				if (!entry) {
					continue;
				}
				if (Array.isArray(entry) && entry.length >= 2) {
					const normalizedAlias = normalizeLocaleId(entry[0]);
					const normalizedTarget = normalizeLocaleId(entry[1]);
					if (!normalizedAlias || !normalizedTarget) {
						continue;
					}
					if (!merged.has(normalizedAlias)) {
						merged.set(normalizedAlias, normalizedTarget);
					}
					continue;
				}
				if (typeof entry === "object") {
					const normalizedAlias = normalizeLocaleId(entry.alias ?? entry.id ?? entry.locale ?? entry.lang);
					const normalizedTarget = normalizeLocaleId(entry.target ?? entry.value ?? entry.to ?? entry.locale ?? entry.lang ?? entry.id);
					if (!normalizedAlias || !normalizedTarget) {
						continue;
					}
					if (!merged.has(normalizedAlias)) {
						merged.set(normalizedAlias, normalizedTarget);
					}
				}
			}
			continue;
		}
		if (typeof source === "object") {
			for (const [alias, target] of Object.entries(source)) {
				const normalizedAlias = normalizeLocaleId(alias);
				const normalizedTarget = normalizeLocaleId(target);
				if (!normalizedAlias || !normalizedTarget) {
					continue;
				}
				if (!merged.has(normalizedAlias)) {
					merged.set(normalizedAlias, normalizedTarget);
				}
			}
		}
	}
	return merged;
}

function resolveLocaleLabel(entry, fallbackId) {
	const rawLabel = entry?.label ?? entry?.display ?? entry?.name ?? entry?.title;
	if (typeof rawLabel === "string" && rawLabel.trim().length > 0) {
		return rawLabel.trim();
	}
	if (fallbackId) {
		return fallbackId;
	}
	return DEFAULT_LOCALE;
}

function applyLocaleCatalog(entries = [], aliasEntries = null) {
	const seen = new Set();
	const normalizedLocales = [];

	function addLocale(id, label) {
		const normalizedId = normalizeLocaleId(id);
		if (!normalizedId || seen.has(normalizedId)) {
			return;
		}
		normalizedLocales.push({ id: normalizedId, label: label || normalizedId });
		seen.add(normalizedId);
	}

	for (const entry of entries) {
		const canonicalId = normalizeLocaleId(entry?.id ?? entry?.lang ?? entry?.locale ?? entry);
		if (!canonicalId) {
			continue;
		}
		const label = resolveLocaleLabel(entry, canonicalId);
		addLocale(canonicalId, label);
	}

	for (const fallbackLocale of STATIC_FALLBACK_LOCALES) {
		addLocale(fallbackLocale.id, fallbackLocale.label);
	}

	normalizedLocales.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
	const defaultIndex = normalizedLocales.findIndex((entry) => entry.id === DEFAULT_LOCALE);
	if (defaultIndex > 0) {
		const [defaultEntry] = normalizedLocales.splice(defaultIndex, 1);
		normalizedLocales.unshift(defaultEntry);
	}

	supportedLocales = normalizedLocales.map((entry) => ({ ...entry }));
	localeMetadata.clear();
	localeAliasMap.clear();

	for (const locale of supportedLocales) {
		localeMetadata.set(locale.id, { ...locale });
		registerLocaleAlias(locale.id, locale.id);
	}

	for (const entry of entries) {
		const canonicalId = normalizeLocaleId(entry?.id ?? entry?.lang ?? entry?.locale ?? entry);
		if (!canonicalId) {
			continue;
		}
		const aliases = entry?.aliases;
		if (Array.isArray(aliases)) {
			for (const alias of aliases) {
				registerLocaleAlias(alias, canonicalId);
			}
		} else if (aliases && typeof aliases === "object") {
			for (const [aliasKey, aliasValue] of Object.entries(aliases)) {
				if (aliasValue) {
					registerLocaleAlias(aliasKey, aliasValue);
					continue;
				}
				registerLocaleAlias(aliasKey, canonicalId);
			}
		}
	}

	const mergedAliases = mergeAliasSources(aliasEntries, TRACKER_FALLBACK_ALIASES);
	for (const [alias, target] of mergedAliases.entries()) {
		registerLocaleAlias(alias, target);
	}
}

function getLocaleFileCandidates(locale) {
	const normalized = normalizeLocaleId(locale) || DEFAULT_LOCALE;
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

	const cached = localeFilePathCache.get(normalized);
	if (cached) {
		addCandidate(cached);
	}

	addCandidate(normalized);

	if (normalized.includes("_")) {
		addCandidate(normalized.replace(/_/g, "-"));
	}

	const hyphenParts = normalized.split("-");
	if (hyphenParts.length >= 2) {
		const upperVariant = `${hyphenParts[0]}-${hyphenParts.slice(1).map((part) => part.toUpperCase()).join("-")}`;
		addCandidate(upperVariant);
	}

	return candidates;
}

async function ensureLocaleBundle(locale) {
	const normalized = normalizeLocaleId(locale) || DEFAULT_LOCALE;

	if (localeAssetAvailability.has(normalized)) {
		return localeAssetAvailability.get(normalized);
	}

	if (normalized === DEFAULT_LOCALE) {
		localeAssetAvailability.set(normalized, true);
		return true;
	}

	if (localeCache.has(normalized)) {
		localeAssetAvailability.set(normalized, true);
		return true;
	}

	const candidates = getLocaleFileCandidates(normalized);

	for (const candidate of candidates) {
		try {
			const response = await fetch(getLocaleFileUrl(candidate));
			if (!response?.ok) {
				continue;
			}
			let data = {};
			try {
				data = await response.clone().json();
			} catch (err) {
				debug("Locale bundle JSON parse failed; using empty object", { locale: normalized, error: err?.message });
			}
			localeFilePathCache.set(normalized, candidate);
			if (data && typeof data === "object" && Object.keys(data).length > 0) {
				localeCache.set(normalized, data);
			} else {
				localeCache.set(normalized, {});
			}
			localeAssetAvailability.set(normalized, true);
			return true;
		} catch (err) {
			debug("Locale bundle fetch failed", { locale: normalized, candidate, error: err?.message });
		}
	}

	localeAssetAvailability.set(normalized, false);
	return false;
}

async function filterLocalesByAssets(entries = []) {
	const filtered = [];
	for (const entry of entries) {
		const canonicalId = normalizeLocaleId(entry?.id ?? entry?.lang ?? entry?.locale ?? entry);
		if (!canonicalId) {
			continue;
		}
		if (canonicalId === DEFAULT_LOCALE || (await ensureLocaleBundle(canonicalId))) {
			filtered.push(entry);
		}
	}
	return filtered;
}

function shouldRefreshLocaleCatalog() {
	return !localeDiscoveryAttempted || !supportedLocales.length;
}

async function refreshLocaleCatalog() {
	if (localeDiscoveryPromise) {
		return localeDiscoveryPromise;
	}

	localeDiscoveryPromise = (async () => {
		const ctx = getContext?.();
		const translationManager = ctx?.translationManager;
		const discoveredLocales = [];
		let aliasEntries = null;

		if (translationManager) {
			try {
				let available = translationManager.getAvailableLocales?.();
				if (available && typeof available.then === "function") {
					available = await available;
				}
				if (available) {
					if (Array.isArray(available)) {
						discoveredLocales.push(...available);
					} else if (available instanceof Map) {
						for (const value of available.values()) {
							discoveredLocales.push(value);
						}
					} else if (available[Symbol.iterator]) {
						for (const value of available) {
							discoveredLocales.push(value);
						}
					} else if (typeof available === "object") {
						discoveredLocales.push(...Object.values(available));
					}
				}
			} catch (err) {
				warn("Failed to read SillyTavern available locales", err);
			}

			try {
				let aliases = translationManager.getLocaleAliases?.();
				if (aliases && typeof aliases.then === "function") {
					aliases = await aliases;
				}
				if (aliases) {
					if (aliases instanceof Map) {
						aliasEntries = aliases;
					} else if (typeof aliases === "object" || Array.isArray(aliases)) {
						aliasEntries = aliases;
					}
				}
			} catch (err) {
				debug("Locale alias discovery failed", err);
			}
		} else {
			debug("SillyTavern translation manager unavailable; using fallback discovery");
		}

		if (!discoveredLocales.length) {
			try {
				const response = await fetch("/locales/lang.json");
				if (response?.ok) {
					const langCatalog = await response.json();
					if (Array.isArray(langCatalog)) {
						for (const entry of langCatalog) {
							if (!entry) continue;
							discoveredLocales.push({
								id: entry.lang ?? entry.id,
								label: entry.display ?? entry.label ?? entry.name,
							});
						}
					} else {
						warn("Unexpected SillyTavern locale catalog format", { type: typeof langCatalog });
					}
				} else if (response) {
					warn("Failed to fetch SillyTavern locale catalog", { status: response.status });
				}
			} catch (err) {
				warn("Error fetching SillyTavern locale catalog", err);
			}
		}

		let availableLocales = discoveredLocales;
		if (availableLocales.length) {
			availableLocales = await filterLocalesByAssets(availableLocales);
		}

		if (availableLocales.length) {
			applyLocaleCatalog(availableLocales, aliasEntries);
		} else if (shouldRefreshLocaleCatalog()) {
			applyLocaleCatalog(STATIC_FALLBACK_LOCALES);
		}
	})().finally(() => {
		localeDiscoveryAttempted = true;
		localeDiscoveryPromise = null;
	});

	return localeDiscoveryPromise;
}

export async function ensureLocalesLoaded(options = {}) {
	const force = Boolean(options?.force);
	if (force) {
		localeDiscoveryAttempted = false;
	}
	if (force || shouldRefreshLocaleCatalog()) {
		try {
			await refreshLocaleCatalog();
		} catch (err) {
			warn("Locale discovery failed", err);
		}
	}
}

applyLocaleCatalog(STATIC_FALLBACK_LOCALES);

function getLocaleFileUrl(locale) {
	return `/${extensionFolderPath}/locales/${locale}.json`;
}

async function loadLocaleFile(locale) {
	const normalized = normalizeLocaleId(locale) || DEFAULT_LOCALE;
	if (localeCache.has(normalized)) {
		const cachedValue = localeCache.get(normalized);
		if (!localeAssetAvailability.has(normalized)) {
			const isNonEmptyObject = cachedValue && typeof cachedValue === "object" && Object.keys(cachedValue).length > 0;
			localeAssetAvailability.set(normalized, isNonEmptyObject || normalized === DEFAULT_LOCALE);
		}
		return cachedValue;
	}

	const attempts = [];
	const candidates = getLocaleFileCandidates(normalized);

	for (const candidate of candidates) {
		try {
			const response = await fetch(getLocaleFileUrl(candidate));
			if (!response.ok) {
				attempts.push({ candidate, status: response.status });
				continue;
			}
			let data = {};
			try {
				data = await response.json();
			} catch (err) {
				debug("Locale bundle JSON parse failed", { locale: normalized, candidate, error: err?.message });
			}
			localeCache.set(normalized, data);
			localeFilePathCache.set(normalized, candidate);
			localeAssetAvailability.set(normalized, true);
			return data;
		} catch (err) {
			attempts.push({ candidate, error: err?.message || String(err) });
		}
	}

	warn("Locale file not found; using fallback data", { locale: normalized, attempts });
	localeCache.set(normalized, {});
	localeAssetAvailability.set(normalized, normalized === DEFAULT_LOCALE);
	return {};
}

function mapLocale(locale) {
	const normalized = normalizeLocaleId(locale);
	if (!normalized) {
		return null;
	}
	if (localeAliasMap.has(normalized)) {
		return localeAliasMap.get(normalized);
	}
	if (localeMetadata.has(normalized)) {
		return normalized;
	}
	return null;
}

function resolveRequestedLocale(requestedLocale) {
	const mapped = mapLocale(requestedLocale);
	if (mapped) {
		return mapped;
	}
	return null;
}

function getAutoLocale() {
	try {
		const ctx = getContext?.();
		const current = ctx?.getCurrentLocale?.();
		return resolveRequestedLocale(current) || DEFAULT_LOCALE;
	} catch (err) {
		warn("Failed to resolve SillyTavern locale", err);
		return DEFAULT_LOCALE;
	}
}

export function getSillyTavernLocale() {
	return getAutoLocale();
}

async function applyLocale(locale) {
	const normalized = normalizeLocaleId(locale) || DEFAULT_LOCALE;
	const fallback = await loadLocaleFile(DEFAULT_LOCALE);
	fallbackLocaleData = fallback || {};
	let combined = { ...fallbackLocaleData };

	if (normalized !== DEFAULT_LOCALE) {
		const localized = await loadLocaleFile(normalized);
		combined = { ...combined, ...localized };
	}

	localeData = combined;
	currentLocale = normalized;
	isInitialized = true;
	missingKeys.clear();

	for (const listener of localeChangeListeners) {
		try {
			listener(currentLocale);
		} catch (err) {
			console.error("[tracker-enhanced] Locale change listener failed", err);
		}
	}
}

function shouldUseAutoLocale(localeOverride) {
	return !localeOverride || localeOverride === "auto";
}

function resolveLocalePreference(overrideLocale) {
	if (shouldUseAutoLocale(overrideLocale)) {
		return getAutoLocale();
	}

	const requested = resolveRequestedLocale(overrideLocale);
	return requested || DEFAULT_LOCALE;
}

export async function initLocalization(forceLocale = null) {
	if (loadingPromise) {
		return loadingPromise;
	}

	loadingPromise = (async () => {
		await ensureLocalesLoaded();
		const preferredLocale = resolveLocalePreference(forceLocale || extensionSettings.languageOverride);
		await applyLocale(preferredLocale);
	})();

	return loadingPromise.finally(() => {
		loadingPromise = null;
	});
}

export async function setLocale(locale) {
	await ensureLocalesLoaded();
	const resolved = resolveLocalePreference(locale);
	if (resolved === currentLocale && isInitialized) {
		return;
	}
	await applyLocale(resolved);
}

export function onLocaleChange(listener) {
	if (typeof listener === "function") {
		localeChangeListeners.add(listener);
	}
}

export function getSupportedLocales() {
	return supportedLocales.map((locale) => ({ ...locale }));
}

export function getCurrentLocale() {
	return currentLocale;
}

export function t(key, fallback = "") {
	if (!isInitialized) {
		debug("Localization not initialized yet. Returning fallback for", key);
		return fallback || key;
	}

	if (localeData && Object.hasOwn(localeData, key)) {
		return localeData[key];
	}

	if (fallbackLocaleData && Object.hasOwn(fallbackLocaleData, key)) {
		return fallbackLocaleData[key];
	}

	if (!missingKeys.has(key)) {
		missingKeys.add(key);
		warn("Missing localization key", { key, locale: currentLocale });
	}

	return fallback || key;
}

export function translateHtml(rootElement) {
	if (!rootElement) return;
	const elements = rootElement.querySelectorAll?.("[data-i18n-key]") || [];
	for (const element of elements) {
		const dataset = element.dataset || {};
		const keyEntries = Object.keys(dataset).filter((entry) => entry.startsWith("i18nKey"));
		if (keyEntries.length === 0) {
			continue;
		}

		for (const entry of keyEntries) {
			const localizationKey = dataset[entry];
			if (!localizationKey) {
				continue;
			}

			const suffix = entry.slice("i18nKey".length);
			const targetDatasetKey = suffix ? `i18nTarget${suffix}` : "i18nTarget";
			const target = dataset[targetDatasetKey] || "text";

			let fallbackValue = "";
			if (target === "html") {
				fallbackValue = element.innerHTML || "";
			} else if (target.startsWith("attr:")) {
				const attrName = target.split(":")[1];
				fallbackValue = attrName ? element.getAttribute(attrName) || "" : "";
			} else {
				fallbackValue = element.textContent?.trim() || "";
			}

			const localized = t(localizationKey, fallbackValue);

			if (target === "html") {
				element.innerHTML = localized;
			} else if (target.startsWith("attr:")) {
				const attrName = target.split(":")[1];
				if (attrName) {
					element.setAttribute(attrName, localized);
				}
			} else {
				element.textContent = localized;
			}
		}
	}
}

export function getLocaleDisplayName(localeId) {
	const normalized = normalizeLocaleId(localeId);
	if (normalized && localeMetadata.has(normalized)) {
		return localeMetadata.get(normalized)?.label || localeId;
	}
	return localeId;
}
