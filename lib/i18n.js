import { getContext } from "../../../../../../scripts/extensions.js";
import { extensionFolderPath, extensionSettings } from "../index.js";
import { debug, warn } from "./utils.js";

const SUPPORTED_LOCALES = [
	{ id: "en", label: "English" },
	{ id: "zh-CN", label: "中文（简体）" },
];

const LOCALE_ALIASES = {
	"en": "en",
	"en-us": "en",
	"en-gb": "en",
	"en-au": "en",
	"en-ca": "en",
	"zh": "zh-CN",
	"zh-cn": "zh-CN",
	"zh-hans": "zh-CN",
	"zh-sg": "zh-CN",
	"zh-my": "zh-CN",
};

const DEFAULT_LOCALE = "en";
let currentLocale = DEFAULT_LOCALE;
let fallbackLocaleData = {};
let localeData = {};
let isInitialized = false;
const missingKeys = new Set();
const localeChangeListeners = new Set();
let loadingPromise = null;
const localeCache = new Map();

function getLocaleFileUrl(locale) {
	return `/${extensionFolderPath}/locales/${locale}.json`;
}

async function loadLocaleFile(locale) {
	if (localeCache.has(locale)) {
		return localeCache.get(locale);
	}

	try {
		const response = await fetch(getLocaleFileUrl(locale));
		if (!response.ok) {
			warn("Failed to load locale file", { locale, status: response.status });
			localeCache.set(locale, {});
			return {};
		}
		const data = await response.json();
		localeCache.set(locale, data);
		return data;
	} catch (err) {
		warn("Error loading locale file", locale, err);
		localeCache.set(locale, {});
		return {};
	}
}

function mapLocale(locale) {
	if (!locale) return null;
	const normalized = String(locale).trim().toLowerCase();
	return LOCALE_ALIASES[normalized] || null;
}

function resolveRequestedLocale(requestedLocale) {
	const mapped = mapLocale(requestedLocale);
	if (mapped) return mapped;
	return SUPPORTED_LOCALES.find((locale) => locale.id.toLowerCase() === String(requestedLocale).toLowerCase())?.id || null;
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

async function applyLocale(locale) {
	const fallback = await loadLocaleFile(DEFAULT_LOCALE);
	fallbackLocaleData = fallback || {};
	let combined = { ...fallbackLocaleData };

	if (locale !== DEFAULT_LOCALE) {
		const localized = await loadLocaleFile(locale);
		combined = { ...combined, ...localized };
	}

	localeData = combined;
	currentLocale = locale;
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

	const preferredLocale = resolveLocalePreference(forceLocale || extensionSettings.languageOverride);
	loadingPromise = applyLocale(preferredLocale).finally(() => {
		loadingPromise = null;
	});

	return loadingPromise;
}

export async function setLocale(locale) {
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
	return SUPPORTED_LOCALES.map((locale) => ({ ...locale }));
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
		const key = element.getAttribute("data-i18n-key");
		if (!key) continue;
		const target = element.getAttribute("data-i18n-target") || "text";
		const fallbackValue = target.startsWith("attr:")
			? element.getAttribute(target.split(":")[1]) || ""
			: (target === "html" ? element.innerHTML : element.textContent?.trim() || "");
		const localized = t(key, fallbackValue);
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

export function getLocaleDisplayName(localeId) {
	const matched = SUPPORTED_LOCALES.find((locale) => locale.id === localeId);
	return matched?.label || localeId;
}
