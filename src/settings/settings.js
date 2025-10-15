import { saveSettingsDebounced } from "../../../../../../script.js";
import { getContext } from '../../../../../../scripts/extensions.js';

import { extensionFolderPath, extensionSettings } from "../../index.js";
import { error, debug, warn, toTitleCase } from "../../lib/utils.js";
import { analyzePresetSnapshot, analyzeTrackerDefinition, buildCanonicalFieldMap, generateLegacyPresetName, setLegacyRegistryLogger } from "../../lib/legacyRegistry.js";
import { getSupportedLocales, setLocale, t, translateHtml, onLocaleChange, getCurrentLocale } from "../../lib/i18n.js";
import { DEFAULT_PRESET_NAME, defaultSettings, automationTargets, participantTargets } from "./defaultSettings.js";
import { generationCaptured } from "../../lib/interconnection.js";
import { TrackerPromptMakerModal } from "../ui/trackerPromptMakerModal.js";
import { TrackerTemplateGenerator } from "../ui/components/trackerTemplateGenerator.js";
import { TrackerJavaScriptGenerator } from "../ui/components/trackerJavaScriptGenerator.js";
import { legacyPresetViewer } from "../ui/components/legacyPresetViewerModal.js";
import { TrackerInterface } from "../ui/trackerInterface.js";
import { DevelopmentTestUI } from "../ui/developmentTestUI.js";

export { automationTargets, participantTargets, trackerFormat } from "./defaultSettings.js";

let settingsRootElement = null;
let localeListenerRegistered = false;
const BUILTIN_PRESET_NAMES = new Set([DEFAULT_PRESET_NAME]);
const BUILTIN_PRESET_TEMPLATES = new Map();
const CANONICAL_FIELD_MAP = buildCanonicalFieldMap(defaultSettings.trackerDef);
let activePresetName = null;
let activePresetBaseline = null;
let presetDirty = false;
let lastAppliedPresetName = null;

setLegacyRegistryLogger(debug);

function registerBuiltInPresetTemplate(name, presetValues) {
	if (!name || typeof name !== "string" || !presetValues) {
		return;
	}
	BUILTIN_PRESET_NAMES.add(name);
	const templateClone = deepClone(presetValues);
	if (templateClone?.trackerDef) {
		const sanitized = sanitizeTrackerDefinition(templateClone.trackerDef);
		templateClone.trackerDef = sanitized.definition;
	}
	BUILTIN_PRESET_TEMPLATES.set(name, templateClone);
}

function isBuiltInPresetName(name) {
	return Boolean(name && BUILTIN_PRESET_NAMES.has(name));
}

function ensureUniquePresetName(baseName, existingPresets) {
	let candidate = baseName;
	let counter = 2;
	while (Object.prototype.hasOwnProperty.call(existingPresets, candidate)) {
		candidate = `${baseName} (${counter++})`;
	}
	return candidate;
}

function refreshPresetOptionLabels() {
	const presetSelect = $("#tracker_enhanced_preset_select");
	if (!presetSelect.length) {
		return;
	}
	presetSelect.find("option").each((_, option) => {
		const baseLabel = option.dataset.baseLabel || option.value;
		if (option.value === activePresetName && presetDirty) {
			option.text = `${baseLabel}*`;
		} else {
			option.text = baseLabel;
		}
	});
}

function normalizePresetForComparison(preset) {
	if (!preset || typeof preset !== "object") {
		return null;
	}
	const normalized = {};
	for (const key of PRESET_VALUE_KEYS) {
		if (Object.prototype.hasOwnProperty.call(preset, key)) {
			const value = preset[key];
			normalized[key] = typeof value === "object" ? deepClone(value) : value;
		}
	}
	return normalized;
}

function arePresetSettingsEqual(a, b) {
	const normalizedA = normalizePresetForComparison(a);
	const normalizedB = normalizePresetForComparison(b);
	if (!normalizedA && !normalizedB) {
		return true;
	}
	if (!normalizedA || !normalizedB) {
		return false;
	}
	return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function refreshPresetBaseline() {
	const presetName = extensionSettings.selectedPreset;
	activePresetName = presetName || null;
	const presetSettings = presetName && extensionSettings.presets ? extensionSettings.presets[presetName] : null;
	activePresetBaseline = presetSettings ? deepClone(presetSettings) : null;
	if (presetName) {
		lastAppliedPresetName = presetName;
	}
	presetDirty = false;
	refreshPresetOptionLabels();
}

function updatePresetDirtyState() {
	if (!activePresetName || !activePresetBaseline) {
		presetDirty = false;
		refreshPresetOptionLabels();
		return;
	}
	const currentSnapshot = getCurrentPresetSettings();
	const isDirty = !arePresetSettingsEqual(currentSnapshot, activePresetBaseline);
	if (isDirty !== presetDirty) {
		presetDirty = isDirty;
		refreshPresetOptionLabels();
	}
}

function ensureEditablePreset() {
	const presetName = extensionSettings.selectedPreset;
	if (!presetName || !isBuiltInPresetName(presetName)) {
		return false;
	}
	if (!presetDirty) {
		return false;
	}

	const currentSnapshot = getCurrentPresetSettings();
	const suffix = t("settings.presets.copySuffix", "copy");
	const duplicateBaseName = `${presetName} (${suffix})`;
	const duplicateName = ensureUniquePresetName(duplicateBaseName, extensionSettings.presets);
	extensionSettings.presets[duplicateName] = deepClone(currentSnapshot);
	extensionSettings.selectedPreset = duplicateName;
	activePresetName = duplicateName;
	lastAppliedPresetName = duplicateName;
	updatePresetDropdown();
	refreshPresetBaseline();
	if (typeof toastr !== "undefined") {
		const messageTemplate = t(
			"settings.presets.toast.duplicated",
			"Built-in preset duplicated to {{name}}. Future edits apply to this copy."
		);
		toastr.info(messageTemplate.replace("{{name}}", duplicateName), "Tracker Enhanced Presets");
	}
	return true;
}

function handleSettingsMutation(options = {}) {
	updatePresetDirtyState();
	if (options.save !== false) {
		saveSettingsDebounced();
	}
}

function sanitizeTrackerDefinition(definition) {
	const analysis = analyzeTrackerDefinition(definition, { canonicalMap: CANONICAL_FIELD_MAP });
	return {
		definition: analysis.normalizedDefinition,
		changed: Boolean(analysis.changed),
		legacyDetected: Boolean(analysis.isLegacy),
		reasons: analysis.reasons,
	};
}

function createBuiltInPresetSnapshot(name, sourcePreset) {
	if (!name || !sourcePreset) {
		return null;
	}
	const cloned = deepClone(sourcePreset);
	if (cloned?.trackerDef) {
		const sanitized = sanitizeTrackerDefinition(cloned.trackerDef);
		cloned.trackerDef = sanitized.definition;
	}
	registerBuiltInPresetTemplate(name, cloned);
	return cloned;
}

const LEGACY_PRESET_SUMMARY_LIMIT = 5;
const LEGACY_EXPORT_SUFFIX = " (legacy)";

function normalizeLegacyPresetStore(existingStore) {
	const normalized = {};
	if (!existingStore || typeof existingStore !== "object" || Array.isArray(existingStore)) {
		return normalized;
	}
	for (const [key, entry] of Object.entries(existingStore)) {
		if (!entry || typeof entry !== "object") {
			normalized[key] = {
				originalName: key,
				quarantinedAt: null,
				reasons: [],
				preset: deepClone(entry),
			};
			continue;
		}
		const originalName = typeof entry.originalName === "string"
			? entry.originalName
			: typeof entry.name === "string"
				? entry.name
				: key;
		const quarantinedAt = typeof entry.quarantinedAt === "string"
			? entry.quarantinedAt
			: typeof entry.timestamp === "string"
				? entry.timestamp
				: null;
		const reasons = Array.isArray(entry.reasons) ? entry.reasons.slice() : [];
		const payload = entry.preset ?? entry.payload ?? entry.snapshot ?? entry;
		normalized[key] = {
			originalName,
			quarantinedAt,
			reasons,
			preset: deepClone(payload),
		};
	}
	return normalized;
}

function quarantineExtensionPresets(options = {}) {
	const timestamp = options.timestamp instanceof Date ? options.timestamp : new Date();
	const isoTimestamp = timestamp.toISOString();
	const legacyStore = normalizeLegacyPresetStore(extensionSettings.legacyPresets);
	const legacyNameSet = new Set([
		...Object.keys(legacyStore),
		...Object.keys(extensionSettings.presets || {}),
	]);
	const newlyQuarantined = [];
	const validPresets = {};
	const presetEntries = Object.entries(extensionSettings.presets || {});
	const canonicalOptions = { canonicalMap: CANONICAL_FIELD_MAP };

	for (const [presetName, presetValue] of presetEntries) {
		if (!presetValue || typeof presetValue !== "object") {
			validPresets[presetName] = presetValue;
			continue;
		}

		const analysis = analyzePresetSnapshot(presetName, presetValue, canonicalOptions);
		if (analysis.isLegacy) {
			const legacyLabel = generateLegacyPresetName(presetName, legacyNameSet, { timestamp });
			legacyNameSet.add(legacyLabel);
			legacyStore[legacyLabel] = {
				originalName: presetName,
				quarantinedAt: isoTimestamp,
				reasons: analysis.reasons,
				preset: deepClone(presetValue),
			};
			newlyQuarantined.push({
				originalName: presetName,
				legacyLabel,
				reasonCodes: analysis.reasons.map((entry) => entry.code),
			});
			continue;
		}

		const normalizedSnapshot = analysis.normalizedSnapshot || deepClone(presetValue);
		validPresets[presetName] = normalizedSnapshot;
		if (isBuiltInPresetName(presetName)) {
			registerBuiltInPresetTemplate(presetName, normalizedSnapshot);
		}
	}

	const replacedBuiltIns = [];
	for (const builtInName of BUILTIN_PRESET_NAMES) {
		if (!Object.prototype.hasOwnProperty.call(validPresets, builtInName)) {
			const template =
				BUILTIN_PRESET_TEMPLATES.get(builtInName) ||
				createBuiltInPresetSnapshot(builtInName, defaultSettings.presets?.[builtInName]);
			if (template) {
				validPresets[builtInName] = deepClone(template);
				registerBuiltInPresetTemplate(builtInName, template);
				replacedBuiltIns.push(builtInName);
			}
		}
	}

	const rootAnalysis = analyzeTrackerDefinition(extensionSettings.trackerDef, { canonicalMap: CANONICAL_FIELD_MAP });
	let trackerDefinition = rootAnalysis.normalizedDefinition;
	let trackerReplacedWithDefault = false;
	if (rootAnalysis.isLegacy) {
		trackerDefinition = deepClone(defaultSettings.trackerDef);
		trackerReplacedWithDefault = true;
	}
	extensionSettings.trackerDef = trackerDefinition;

	extensionSettings.presets = validPresets;
	extensionSettings.legacyPresets = legacyStore;

	const previousSelected = extensionSettings.selectedPreset;
	let selectedPreset = previousSelected && Object.prototype.hasOwnProperty.call(validPresets, previousSelected)
		? previousSelected
		: null;

	if (!selectedPreset) {
		if (lastAppliedPresetName && Object.prototype.hasOwnProperty.call(validPresets, lastAppliedPresetName)) {
			selectedPreset = lastAppliedPresetName;
		} else if (Object.prototype.hasOwnProperty.call(validPresets, DEFAULT_PRESET_NAME)) {
			selectedPreset = DEFAULT_PRESET_NAME;
		} else {
			selectedPreset = Object.keys(validPresets)[0] || null;
		}
	}

	if (selectedPreset) {
		extensionSettings.selectedPreset = selectedPreset;
	} else {
		delete extensionSettings.selectedPreset;
	}

	activePresetName = selectedPreset || null;
	activePresetBaseline = selectedPreset ? deepClone(validPresets[selectedPreset]) : null;
	lastAppliedPresetName = selectedPreset || null;
	presetDirty = false;

	if (selectedPreset && validPresets[selectedPreset]) {
		Object.assign(extensionSettings, deepClone(validPresets[selectedPreset]));
	}

	return {
		newlyQuarantined,
		replacedBuiltIns,
		rootChanged: Boolean(rootAnalysis.changed),
		rootIsLegacy: Boolean(rootAnalysis.isLegacy),
		trackerReplacedWithDefault,
		selectedPresetChanged: previousSelected !== selectedPreset,
		selectedPreset,
		validPresetCount: Object.keys(validPresets).length,
		legacyPresetCount: Object.keys(legacyStore).length,
	};
}

function announcePresetQuarantine(summary = {}, options = {}) {
	const context = options.context || "init";
	const quarantined = summary.newlyQuarantined || [];
	const replacedBuiltIns = summary.replacedBuiltIns || [];
	const notifications = [];
	const hasVisibleChanges = quarantined.length || replacedBuiltIns.length || summary.trackerReplacedWithDefault || summary.selectedPresetChanged;
	const hasAnyChanges = hasVisibleChanges || summary.rootChanged || summary.rootIsLegacy;

	if (!hasAnyChanges) {
		debug("Preset quarantine completed without changes", {
			context,
			rootChanged: summary.rootChanged,
			validPresetCount: summary.validPresetCount,
			legacyPresetCount: summary.legacyPresetCount,
		});
		return;
	}

	debug("Preset quarantine results", {
		context,
		quarantined,
		replacedBuiltIns,
		rootChanged: summary.rootChanged,
		rootIsLegacy: summary.rootIsLegacy,
		trackerReplacedWithDefault: summary.trackerReplacedWithDefault,
		selectedPreset: summary.selectedPreset,
		validPresetCount: summary.validPresetCount,
		legacyPresetCount: summary.legacyPresetCount,
	});

	if (!hasVisibleChanges) {
		return;
	}

	if (quarantined.length) {
		const preview = quarantined
			.slice(0, LEGACY_PRESET_SUMMARY_LIMIT)
			.map((entry) => `${entry.originalName} → ${entry.legacyLabel}`)
			.join("<br>");
		notifications.push(
			[
				`Quarantined ${quarantined.length} preset${quarantined.length === 1 ? "" : "s"}:`,
				preview,
				quarantined.length > LEGACY_PRESET_SUMMARY_LIMIT
					? `…and ${quarantined.length - LEGACY_PRESET_SUMMARY_LIMIT} more.`
					: null,
			]
				.filter(Boolean)
				.join("<br>")
		);
	}

	if (replacedBuiltIns.length) {
		notifications.push(`Reinstalled built-in defaults for: ${replacedBuiltIns.join(", ")}`);
	}

	if (summary.trackerReplacedWithDefault) {
		notifications.push("Active tracker definition reset to the canonical default.");
	}

	if (summary.selectedPresetChanged && summary.selectedPreset) {
		notifications.push(`Active preset switched to ${summary.selectedPreset}.`);
	}

	if (typeof toastr === "undefined" || notifications.length === 0) {
		return;
	}

	const message = notifications.join("<br><br>");
	toastr.info(message, "Tracker Enhanced Presets", {
		closeButton: true,
		timeOut: 0,
		extendedTimeOut: 0,
		escapeHtml: false,
	});
}

function getLegacyPresetSnapshot(name) {
	const legacyStore = extensionSettings.legacyPresets;
	if (!legacyStore || typeof legacyStore !== "object" || Array.isArray(legacyStore)) {
		return null;
	}
	const record = legacyStore[name];
	if (!record || typeof record !== "object") {
		return null;
	}
	const presetPayload = record.preset ?? record.payload ?? record.snapshot ?? record;
	return {
		originalName: typeof record.originalName === "string" ? record.originalName : name,
		reasons: Array.isArray(record.reasons) ? record.reasons : [],
		preset: presetPayload,
	};
}

const targetOptionLabelKeys = {
	[automationTargets.BOTH]: "settings.generation_target.option.both",
	[automationTargets.USER]: "settings.generation_target.option.user",
	[automationTargets.CHARACTER]: "settings.generation_target.option.character",
	[automationTargets.NONE]: "settings.generation_target.option.none",
};

const staticLocalizationBindings = [];
const PRESET_VALUE_KEYS = [
	"generateContextTemplate",
	"generateSystemPrompt",
	"generateRequestPrompt",
	"participantGuidanceTemplate",
	"generateRecentMessagesTemplate",
	"characterDescriptionTemplate",
	"mesTrackerTemplate",
	"mesTrackerJavascript",
	"roleplayPrompt",
	"automationTarget",
	"participantTarget",
	"showPopupFor",
	"trackerFormat",
	"numberOfMessages",
	"generateFromMessage",
	"minimumDepth",
	"responseLength",
	"devToolsEnabled",
	"debugMode",
	"trackerInjectionEnabled",
	"toolbarIndicatorEnabled",
	"trackerDef",
];

/**
 * Checks if the extension is enabled.
 * @returns {Promise<boolean>} True if enabled, false otherwise.
 */
export async function isEnabled() {
	debug("Checking if extension is enabled:", extensionSettings.enabled);
	return extensionSettings.enabled && (await generationCaptured());
}

export async function toggleExtension(enable = true) {
	extensionSettings.enabled = enable;
	$("#tracker_enhanced_enable").prop("checked", enable);
	saveSettingsDebounced();
}

// #region Settings Initialization

/**
 * Initializes the extension settings.
 * If certain settings are missing, uses default settings.
 * Saves the settings and loads the settings UI.
 */
export async function initSettings() {
	const currentSettings = { ...extensionSettings };

	if (!currentSettings.trackerDef) {
		const allowedKeys = ["enabled", "generateContextTemplate", "generateSystemPrompt", "generateRequestPrompt", "roleplayPrompt", "characterDescriptionTemplate", "mesTrackerTemplate", "numberOfMessages", "responseLength", "debugMode", "devToolsEnabled"];

		const newSettings = {
			...defaultSettings,
			...Object.fromEntries(allowedKeys.map((key) => [key, currentSettings[key] || defaultSettings[key]])),
			oldSettings: currentSettings,
		};

		for (const key in extensionSettings) {
			if (!(key in newSettings)) {
				delete extensionSettings[key];
			}
		}

		Object.assign(extensionSettings, newSettings);
	} else {
		migrateIsDynamicToPresence(extensionSettings);

		Object.assign(extensionSettings, defaultSettings, currentSettings);
	}

	delete extensionSettings.localePresetSnapshot;

	if (!extensionSettings.selectedPreset) {
		extensionSettings.selectedPreset = defaultSettings.selectedPreset || DEFAULT_PRESET_NAME;
	}

	await ensureLocalePresetsRegistered();
	registerBuiltInPresetTemplate(DEFAULT_PRESET_NAME, defaultSettings.presets?.[DEFAULT_PRESET_NAME]);
	const quarantineSummary = quarantineExtensionPresets({ timestamp: new Date() });
	announcePresetQuarantine(quarantineSummary, { context: "init" });

	saveSettingsDebounced();

	await loadSettingsUI();
}

/**
 * Migrates the isDynamic field to presence for all objects in the settings.
 * @param {Object} obj The object to migrate.
 * @returns {void}
*/
function migrateIsDynamicToPresence(obj) {
	if (typeof obj !== "object" || obj === null) return;

	for (const key in obj) {
		if (key === "isDynamic") {
			// Replace isDynamic with presence, mapping true → "DYNAMIC" and false → "STATIC"
			obj.presence = obj[key] ? "DYNAMIC" : "STATIC";
			delete obj.isDynamic; // Remove old key
		} else if (typeof obj[key] === "object") {
			// Recursively migrate nested objects
			migrateIsDynamicToPresence(obj[key]);
		}
	}
}

/**
 * Loads the settings UI by fetching the HTML and appending it to the page.
 * Sets initial values and registers event listeners.
 */
async function loadSettingsUI() {
	try {
		debug("Loading settings UI from path:", `${extensionFolderPath}/html/settings.html`);
		const settingsHtml = await $.get(`${extensionFolderPath}/html/settings.html`);
		$("#extensions_settings2").append(settingsHtml);
		debug("Settings UI HTML appended successfully");

		settingsRootElement = document.getElementById("tracker_enhanced_settings");
		const currentLocale = getCurrentLocale();
		applySettingsLocalization(currentLocale);

		if (!localeListenerRegistered) {
			onLocaleChange((locale) => {
				applySettingsLocalization(locale);
			});
			localeListenerRegistered = true;
		}


		await ensureLocalePresetsRegistered();
		DevelopmentTestUI.init();
		setSettingsInitialValues();
		registerSettingsListeners();
		
		debug("Settings UI initialization completed");
	} catch (error) {
		error("Failed to load settings UI:", error);
		console.error("Tracker Enhanced: Failed to load settings UI:", error);
	}
}

function applySettingsLocalization(locale = getCurrentLocale()) {
	if (!settingsRootElement) {
		return;
	}
	translateHtml(settingsRootElement);
	refreshLanguageOverrideDropdown();
	localizeStaticSettingsContent();
	updatePopupDropdown();
}

function localizeStaticSettingsContent() {
	if (!settingsRootElement) {
		return;
	}
	for (const binding of staticLocalizationBindings) {
		const element = typeof binding.element === "function" ? binding.element() : settingsRootElement.querySelector(binding.element);
		if (!element) {
			continue;
		}
		const target = binding.target || "text";
		if (target.startsWith("attr:")) {
			const attrName = target.split(":")[1];
			const fallbackAttr = element.getAttribute(attrName) || "";
			element.setAttribute(attrName, t(binding.key, fallbackAttr));
			continue;
		}
		let fallback = "";
		switch (target) {
			case "html":
				fallback = element.innerHTML || "";
				break;
			case "value":
				fallback = element.value || "";
				break;
			default:
				fallback = element.textContent || "";
				break;
		}
		const localized = t(binding.key, fallback);
		if (target === "html") {
			element.innerHTML = localized;
		} else if (target === "value") {
			element.value = localized;
		} else {
			element.textContent = localized;
		}
	}
}
let localePresetRegistrationPromise = null;
const BUILTIN_PRESET_LOCALES = new Set(["en"]);

async function ensureLocalePresetsRegistered(options = {}) {
	if (options.force) {
		localePresetRegistrationPromise = null;
	}

	if (!localePresetRegistrationPromise) {
		localePresetRegistrationPromise = seedLocalePresetEntries();
	}
	return localePresetRegistrationPromise;
}

async function seedLocalePresetEntries() {
	extensionSettings.presets = extensionSettings.presets || {};
	const legacyStore = normalizeLegacyPresetStore(extensionSettings.legacyPresets);
	extensionSettings.legacyPresets = legacyStore;
	const existingPresetNames = new Set(Object.keys(extensionSettings.presets));
	const legacyNameSet = new Set([
		...existingPresetNames,
		...Object.keys(legacyStore),
	]);
	const localeCatalog = new Map();
	const localeIds = [];
	const timestamp = new Date();
	const isoTimestamp = timestamp.toISOString();
	let changesMade = false;
	const quarantinedLocales = [];

	const builtInPresetDefinition = defaultSettings.presets?.[DEFAULT_PRESET_NAME];
	if (builtInPresetDefinition) {
		if (!existingPresetNames.has(DEFAULT_PRESET_NAME)) {
			const snapshot = createBuiltInPresetSnapshot(DEFAULT_PRESET_NAME, builtInPresetDefinition);
			extensionSettings.presets[DEFAULT_PRESET_NAME] = snapshot;
			changesMade = true;
			existingPresetNames.add(DEFAULT_PRESET_NAME);
			legacyNameSet.add(DEFAULT_PRESET_NAME);
		} else {
			registerBuiltInPresetTemplate(DEFAULT_PRESET_NAME, extensionSettings.presets[DEFAULT_PRESET_NAME]);
		}
	}

	for (const locale of getSupportedLocales()) {
		if (!locale || !locale.id || locale.id === "auto") {
			continue;
		}
		localeIds.push(locale.id);
		if (locale.label) {
			localeCatalog.set(locale.id, locale.label);
		}
	}

	await Promise.all(
		localeIds.map(async (localeId) => {
			if (BUILTIN_PRESET_LOCALES.has(localeId)) {
				return;
			}
			const definition = await loadLocalePresetDefinition(localeId);
			if (!definition || !definition.values) {
				return;
			}
			const presetTitle = (definition.title || "").trim() || getFallbackPresetTitle(localeId, localeCatalog.get(localeId));
			if (!presetTitle) {
				return;
			}
			if (existingPresetNames.has(presetTitle)) {
				registerBuiltInPresetTemplate(presetTitle, extensionSettings.presets[presetTitle]);
				return;
			}
			const localeAnalysis = buildLocalePresetAnalysis(presetTitle, definition.values);
			if (!localeAnalysis || !localeAnalysis.normalizedSnapshot) {
				return;
			}
			if (localeAnalysis.isLegacy) {
				const legacyLabel = generateLegacyPresetName(presetTitle, legacyNameSet, { timestamp });
				legacyNameSet.add(legacyLabel);
				legacyStore[legacyLabel] = {
					originalName: presetTitle,
					quarantinedAt: isoTimestamp,
					reasons: localeAnalysis.reasons,
					preset: deepClone(definition.values),
				};
				quarantinedLocales.push({ originalName: presetTitle, legacyLabel, localeId });
				changesMade = true;
				return;
			}
			const normalizedSnapshot = deepClone(localeAnalysis.normalizedSnapshot);
			extensionSettings.presets[presetTitle] = normalizedSnapshot;
			registerBuiltInPresetTemplate(presetTitle, normalizedSnapshot);
			changesMade = true;
			existingPresetNames.add(presetTitle);
			legacyNameSet.add(presetTitle);
		})
	);

	if (quarantinedLocales.length) {
		debug("Locale presets quarantined", { entries: quarantinedLocales });
	}

	if (changesMade) {
		extensionSettings.legacyPresets = legacyStore;
		saveSettingsDebounced();
	}
}

async function loadLocalePresetDefinition(localeId) {
	try {
		const response = await fetch(`${extensionFolderPath}/presets/${localeId}.json`);
		if (!response.ok) {
			warn("Locale preset not found", { locale: localeId, status: response.status });
			return null;
		}
		return await response.json();
	} catch (err) {
		warn("Failed to load locale preset", { locale: localeId, error: err });
		return null;
	}
}

function getFallbackPresetTitle(localeId, localeLabel) {
	if (localeLabel && typeof localeLabel === "string") {
		return `Locale Default (${localeLabel})`;
	}
	return `Locale Default (${localeId})`;
}

function buildLocalePresetAnalysis(presetName, values = {}) {
	if (!values || typeof values !== "object") {
		return null;
	}
	const sanitized = {};
	for (const key of PRESET_VALUE_KEYS) {
		if (Object.prototype.hasOwnProperty.call(values, key)) {
			sanitized[key] = deepClone(values[key]);
		}
	}
	if (Object.keys(sanitized).length === 0) {
		return null;
	}
	migrateIsDynamicToPresence(sanitized);
	return analyzePresetSnapshot(presetName, sanitized, { canonicalMap: CANONICAL_FIELD_MAP });
}

function deepClone(value) {
	if (value === null || typeof value !== "object") {
		return value;
	}
	try {
		return JSON.parse(JSON.stringify(value));
	} catch (err) {
		debug("Failed to clone preset value", { error: err });
		return value;
	}
}

function refreshLanguageOverrideDropdown() {
	if (!settingsRootElement) {
		return;
	}
	const select = settingsRootElement.querySelector("#tracker_enhanced_language_override");
	if (!select) {
		return;
	}
	const previousValue = extensionSettings.languageOverride || "auto";
	select.innerHTML = "";

	const autoOption = document.createElement("option");
	autoOption.value = "auto";
	autoOption.textContent = t("settings.language.auto", "Auto (SillyTavern default)");
	select.append(autoOption);

	for (const locale of getSupportedLocales()) {
		const option = document.createElement("option");
		option.value = locale.id;
		option.textContent = locale.label;
		select.append(option);
	}

	const hasExisting = Array.from(select.options).some((option) => option.value === previousValue);
	select.value = hasExisting ? previousValue : "auto";

	if (!hasExisting && previousValue !== "auto") {
		extensionSettings.languageOverride = "auto";
		saveSettingsDebounced();
	}
}

/**
 * Sets the initial values for the settings UI elements based on current settings.
 */
function setSettingsInitialValues() {
	refreshLanguageOverrideDropdown();
	// Populate presets dropdown
	updatePresetDropdown();
	initializeOverridesDropdowns();

	$("#tracker_enhanced_enable").prop("checked", extensionSettings.enabled);
	if (typeof extensionSettings.automationTarget === "undefined") {
		extensionSettings.automationTarget = defaultSettings.automationTarget;
	}
	if (typeof extensionSettings.participantTarget === "undefined") {
		extensionSettings.participantTarget = defaultSettings.participantTarget;
	}
	if (typeof extensionSettings.participantGuidanceTemplate !== "string") {
		extensionSettings.participantGuidanceTemplate = defaultSettings.participantGuidanceTemplate;
	}
	const automationTarget = extensionSettings.automationTarget ?? defaultSettings.automationTarget;
	const participantTarget = extensionSettings.participantTarget ?? defaultSettings.participantTarget;
	const participantGuidanceTemplate = extensionSettings.participantGuidanceTemplate ?? defaultSettings.participantGuidanceTemplate ?? "";

	updatePopupDropdown();
	const popupTarget = extensionSettings.showPopupFor ?? defaultSettings.showPopupFor;

	$("#tracker_enhanced_automation_target").val(automationTarget);
	$("#tracker_enhanced_participant_target").val(participantTarget);
	$("#tracker_enhanced_participant_guidance").val(participantGuidanceTemplate);
	$("#tracker_enhanced_show_popup_for").val(popupTarget);
	$("#tracker_enhanced_format").val(extensionSettings.trackerFormat);
	$("#tracker_enhanced_toolbar_indicator").prop("checked", extensionSettings.toolbarIndicatorEnabled !== false);
	$("#tracker_enhanced_dev_tools").prop("checked", Boolean(extensionSettings.devToolsEnabled));
	$("#tracker_enhanced_debug").prop("checked", extensionSettings.debugMode);

	// Set other settings fields
	$("#tracker_enhanced_context_prompt").val(extensionSettings.generateContextTemplate);
	$("#tracker_enhanced_system_prompt").val(extensionSettings.generateSystemPrompt);
	$("#tracker_enhanced_request_prompt").val(extensionSettings.generateRequestPrompt);
	$("#tracker_enhanced_roleplay_prompt").val(extensionSettings.roleplayPrompt);
	$("#tracker_enhanced_recent_messages").val(extensionSettings.generateRecentMessagesTemplate);
	$("#tracker_enhanced_character_description").val(extensionSettings.characterDescriptionTemplate);
	$("#tracker_enhanced_mes_tracker_template").val(extensionSettings.mesTrackerTemplate);
	$("#tracker_enhanced_mes_tracker_javascript").val(extensionSettings.mesTrackerJavascript);
	$("#tracker_enhanced_number_of_messages").val(extensionSettings.numberOfMessages);
	$("#tracker_enhanced_generate_from_message").val(extensionSettings.generateFromMessage);
	$("#tracker_enhanced_minimum_depth").val(extensionSettings.minimumDepth);
	$("#tracker_enhanced_response_length").val(extensionSettings.responseLength);

	// Process the tracker javascript
	processTrackerJavascript();

	DevelopmentTestUI.setEnabled(Boolean(extensionSettings.devToolsEnabled));

	if (typeof TrackerInterface.setIndicatorVisibility === "function") {
		TrackerInterface.setIndicatorVisibility(extensionSettings.toolbarIndicatorEnabled !== false);
	}
	if (typeof TrackerInterface.syncInjectionToggle === "function") {
		TrackerInterface.syncInjectionToggle(extensionSettings.trackerInjectionEnabled !== false);
	} else if (typeof TrackerInterface.updateInjectionIndicator === "function") {
		TrackerInterface.updateInjectionIndicator(extensionSettings.trackerInjectionEnabled !== false);
	}

	refreshPresetBaseline();
	updatePresetDirtyState();
}

// #endregion

// #region Event Listeners

/**
 * Registers event listeners for settings UI elements.
 */
function registerSettingsListeners() {
	// Preset management
	$("#tracker_enhanced_preset_select").on("change", onPresetSelectChange);
	$("#tracker_enhanced_connection_profile").on("change", onConnectionProfileSelectChange);
	$("#tracker_enhanced_completion_preset").on("change", onCompletionPresetSelectChange);
	$("#tracker_enhanced_preset_new").on("click", onPresetNewClick);
	$("#tracker_enhanced_preset_save").on("click", onPresetSaveClick);
	$("#tracker_enhanced_preset_rename").on("click", onPresetRenameClick);
	$("#tracker_enhanced_preset_restore").on("click", onPresetRestoreClick);
	$("#tracker_enhanced_preset_delete").on("click", onPresetDeleteClick);
	$("#tracker_enhanced_preset_export").on("click", onPresetExportClick);
	$("#tracker_enhanced_preset_import_button").on("click", onPresetImportButtonClick);
	$("#tracker_enhanced_preset_import").on("change", onPresetImportChange);

	// Settings fields
	$("#tracker_enhanced_enable").on("input", onSettingCheckboxInput("enabled", { trackPreset: false }));
	$("#tracker_enhanced_automation_target").on("change", onSettingSelectChange("automationTarget"));
	$("#tracker_enhanced_participant_target").on("change", onSettingSelectChange("participantTarget"));
	$("#tracker_enhanced_show_popup_for").on("change", onSettingSelectChange("showPopupFor"));
	$("#tracker_enhanced_format").on("change", onSettingSelectChange("trackerFormat"));
	$("#tracker_enhanced_language_override").on("change", onLanguageOverrideChange);
	$("#tracker_enhanced_toolbar_indicator").on("input", (event) => {
		const enabled = $(event.currentTarget).is(":checked");
		extensionSettings.toolbarIndicatorEnabled = enabled;
		handleSettingsMutation();
		if (typeof TrackerInterface.setIndicatorVisibility === "function") {
			TrackerInterface.setIndicatorVisibility(enabled);
		}
	});

	$("#tracker_enhanced_dev_tools").on("input", (event) => {
		const enabled = $(event.currentTarget).is(":checked");
		extensionSettings.devToolsEnabled = enabled;
		handleSettingsMutation();
		DevelopmentTestUI.setEnabled(enabled);
	});

	$("#tracker_enhanced_debug").on("input", onSettingCheckboxInput("debugMode"));

	$("#tracker_enhanced_context_prompt").on("input", onSettingInputareaInput("generateContextTemplate"));
	$("#tracker_enhanced_system_prompt").on("input", onSettingInputareaInput("generateSystemPrompt"));
	$("#tracker_enhanced_participant_guidance").on("input", onSettingInputareaInput("participantGuidanceTemplate"));
	$("#tracker_enhanced_request_prompt").on("input", onSettingInputareaInput("generateRequestPrompt"));
	$("#tracker_enhanced_roleplay_prompt").on("input", onSettingInputareaInput("roleplayPrompt"));
	$("#tracker_enhanced_recent_messages").on("input", onSettingInputareaInput("generateRecentMessagesTemplate"));
	$("#tracker_enhanced_character_description").on("input", onSettingInputareaInput("characterDescriptionTemplate"));
	$("#tracker_enhanced_mes_tracker_template").on("input", onSettingInputareaInput("mesTrackerTemplate"));
	$("#tracker_enhanced_mes_tracker_javascript").on("input", onSettingInputareaInput("mesTrackerJavascript"));
	$("#tracker_enhanced_number_of_messages").on("input", onSettingNumberInput("numberOfMessages"));
	$("#tracker_enhanced_generate_from_message").on("input", onSettingNumberInput("generateFromMessage"));
	$("#tracker_enhanced_minimum_depth").on("input", onSettingNumberInput("minimumDepth"));
	$("#tracker_enhanced_response_length").on("input", onSettingNumberInput("responseLength"));

	$("#tracker_enhanced_prompt_maker").on("click", onTrackerPromptMakerClick);
	$("#tracker_enhanced_generate_template").on("click", onGenerateTemplateClick);
	$("#tracker_enhanced_generate_javascript").on("click", onGenerateJavaScriptClick);
	$("#tracker_enhanced_reset_presets").on("click", onTrackerPromptResetClick);

	const {
		eventSource,
		event_types,
	} = getContext();

	eventSource.on(event_types.CONNECTION_PROFILE_LOADED, onMainSettingsConnectionProfileChange);
}
async function onLanguageOverrideChange(event) {
	const selectedLocale = String($(event.currentTarget).val() || "auto");
	debug("Language override changed", selectedLocale);
	extensionSettings.languageOverride = selectedLocale;
	saveSettingsDebounced();
	try {
		await setLocale(selectedLocale);
	} catch (err) {
		error("Failed to switch tracker locale", err);
	}
}


// #endregion

// #region Connection Profile Override

function getConnectionProfiles() {
	const ctx = getContext();
	const connectionProfileNames = ctx.extensionSettings.connectionManager.profiles.map(x => x.name);
	return connectionProfileNames;
}

function updateConnectionProfileDropdown() {
	const connectionProfileSelect = $("#tracker_enhanced_connection_profile");
	const connectionProfiles = getConnectionProfiles();
	debug("connections profiles found", connectionProfiles);
	connectionProfileSelect.empty();
	connectionProfileSelect.append($("<option>").val("current").text("Same as current"));
	for (const profileName of connectionProfiles) {
		const option = $("<option>").val(profileName).text(profileName);

		if (profileName === extensionSettings.selectedProfile) {
			option.attr("selected", "selected");
		}

		connectionProfileSelect.append(option);
	}
}

function initializeOverridesDropdowns() {
	try {
		const ctx = getContext();
		const connectionManager = ctx.extensionSettings.connectionManager;
		if(connectionManager.profiles.length === 0 && extensionSettings.enabled) {
			return;
		}
		updateConnectionProfileDropdown();
	
		let actualSelectedProfile;
		if(extensionSettings.selectedProfile === 'current') {
			actualSelectedProfile = connectionManager.profiles.find(x => x.id === connectionManager.selectedProfile);
			extensionSettings.selectedProfileApi = actualSelectedProfile.api;
			extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
	
		} else {
			actualSelectedProfile = connectionManager.profiles.find(x => x.name === extensionSettings.selectedProfile);
			extensionSettings.selectedProfileApi = actualSelectedProfile.api;
			extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
			}
		debug("Selected profile:", { actualSelectedProfile, extensionSettings });
		updateCompletionPresetsDropdown();
	} catch(e) {
		error(e)
		toastr.error('Failed to initialize overrides presets');

	}
	saveSettingsDebounced();
}

function onConnectionProfileSelectChange() {
	const selectedProfile = $(this).val();
	extensionSettings.selectedProfile = selectedProfile;
	const ctx = getContext();
	const connectionManager = ctx.extensionSettings.connectionManager

	let actualSelectedProfile;

	if(selectedProfile === 'current') {
		actualSelectedProfile = connectionManager.profiles.find(x => x.id === connectionManager.selectedProfile);
		extensionSettings.selectedProfileApi = actualSelectedProfile.api;
		extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
	} else {
		actualSelectedProfile = connectionManager.profiles.find(x => x.name === selectedProfile);
		extensionSettings.selectedProfileApi = actualSelectedProfile.api;
		extensionSettings.selectedProfileMode = actualSelectedProfile.mode;
	}

	extensionSettings.selectedCompletionPreset = "current";

	debug("Selected profile:", { selectedProfile, extensionSettings });
	updateCompletionPresetsDropdown();
	saveSettingsDebounced();
}

function onMainSettingsConnectionProfileChange() {
	if(extensionSettings.selectedProfile === "current") {
		debug("Connection profile changed. Updating presets drop down");
		extensionSettings.selectedCompletionPreset = "current";
		updateCompletionPresetsDropdown();
	}
}

// #endregion

// #region Completion Preset Override

function getPresetCompatibilityIndicator(compatibility) {
	switch(compatibility) {
		case 'compatible':
			return '✅';
		case 'questionable':
			return '⚠️';
		case 'incompatible':
			return '❌';
		default:
			return '';
	}
}

function formatPresetName(presetName, compatibility) {
	const indicator = getPresetCompatibilityIndicator(compatibility);
	const warnings = {
		'compatible': '',
		'questionable': ' (May have compatibility issues)',
		'incompatible': ' (Likely incompatible - different API)'
	};
	return `${indicator} ${presetName}${warnings[compatibility] || ''}`.trim();
}

function getCompletionPresets() {
	const ctx = getContext();
	let allPresets = { compatible: [], questionable: [], incompatible: [] };

	try {
		if(extensionSettings.selectedProfileMode === "cc") {
			const presetManager = ctx.getPresetManager('openai');
			const presets = presetManager.getPresetList().presets;
			const presetNames = presetManager.getPresetList().preset_names;

			let presetsDict = {};
			for(const x in presetNames) presetsDict[x] = presets[presetNames[x]];
			debug('available presetNames', presetNames);
			debug('extensionSettings.selectedProfileApi', extensionSettings.selectedProfileApi);
			debug('presetsDict', presetsDict);
			
			for(const x in presetsDict) {
				const preset = presetsDict[x];
				if (!preset) {
					allPresets.questionable.push(x);
					continue;
				}
				
				const presetSource = preset.chat_completion_source;
				const mappedSource = ctx.CONNECT_API_MAP[extensionSettings.selectedProfileApi]?.source;
				
				if(presetSource === extensionSettings.selectedProfileApi) {
					// Direct match - fully compatible
					allPresets.compatible.push(x);
				} else if (presetSource === mappedSource) {
					// Mapped source match - fully compatible
					allPresets.compatible.push(x);
				} else if (presetSource && extensionSettings.selectedProfileApi && presetSource !== extensionSettings.selectedProfileApi) {
					// Different sources - potentially incompatible
					allPresets.incompatible.push(x);
				} else {
					// Unknown compatibility - questionable
					allPresets.questionable.push(x);
				}
			}
			debug('categorized presets', allPresets);
		} else {
			// For non-Chat Completion modes, all presets are compatible
			const presetManager = ctx.getPresetManager('textgenerationwebui');
			const presetNames = presetManager.getPresetList().preset_names;

			let validPresetNames = presetNames;
			if (Array.isArray(presetNames)) validPresetNames = presetNames;
			else validPresetNames = Object.keys(validPresetNames);
			
			allPresets.compatible = validPresetNames;
		}
	} catch (error) {
		console.error('Error categorizing completion presets:', error);
		// Fallback: return all presets as questionable
		try {
			const ctx = getContext();
			const presetManager = extensionSettings.selectedProfileMode === "cc" 
				? ctx.getPresetManager('openai') 
				: ctx.getPresetManager('textgenerationwebui');
			const presetNames = presetManager.getPresetList().preset_names;
			const validPresetNames = Array.isArray(presetNames) ? presetNames : Object.keys(presetNames);
			allPresets.questionable = validPresetNames;
		} catch (fallbackError) {
			console.error('Fallback preset loading also failed:', fallbackError);
		}
	}

	return allPresets;
}

function updateCompletionPresetsDropdown() {
	const completionPresetsSelect = $("#tracker_enhanced_completion_preset");
	const categorizedPresets = getCompletionPresets();
	debug("categorized completion presets", categorizedPresets);
	completionPresetsSelect.empty();
	completionPresetsSelect.append($("<option>").val("current").text("Use connection profile default"));
	
	// Function to add presets with indicators
	const addPresetOptions = (presets, compatibility) => {
		for (const presetName of presets) {
			const formattedName = formatPresetName(presetName, compatibility);
			const option = $("<option>").val(presetName).text(formattedName);
			if (presetName === extensionSettings.selectedCompletionPreset) {
				option.attr("selected", "selected");
			}
			completionPresetsSelect.append(option);
		}
	};
	
	// Add presets in order of compatibility
	addPresetOptions(categorizedPresets.compatible, 'compatible');
	addPresetOptions(categorizedPresets.questionable, 'questionable');
	addPresetOptions(categorizedPresets.incompatible, 'incompatible');
}

function onCompletionPresetSelectChange() {
	const selectedCompletionPreset = $(this).val();
	extensionSettings.selectedCompletionPreset = selectedCompletionPreset;

	debug("Selected completion preset:", { selectedCompletionPreset, extensionSettings });

	setSettingsInitialValues();
	saveSettingsDebounced();
}

// #endregion

// #region Preset Management

/**
 * Updates the presets dropdown with the available presets.
 */
function updatePresetDropdown() {
	const presetSelect = $("#tracker_enhanced_preset_select");
	presetSelect.empty();
	for (const presetName in extensionSettings.presets) {
		const option = $("<option>").val(presetName).text(presetName);
		option.attr("data-base-label", presetName);
		if (presetName === extensionSettings.selectedPreset) {
			option.attr("selected", "selected");
		}
		presetSelect.append(option);
	}
	refreshPresetOptionLabels();
}

/**
 * Event handler for changing the selected preset.
 */
function onPresetSelectChange() {
	const selectedPreset = $(this).val();
	if (!selectedPreset) {
		return;
	}

	const legacySnapshot = getLegacyPresetSnapshot(selectedPreset);
	if (legacySnapshot) {
		const fallbackPreset =
			(lastAppliedPresetName && extensionSettings.presets[lastAppliedPresetName] && lastAppliedPresetName) ||
			(activePresetName && extensionSettings.presets[activePresetName] && activePresetName) ||
			(Object.prototype.hasOwnProperty.call(extensionSettings.presets, DEFAULT_PRESET_NAME) ? DEFAULT_PRESET_NAME : Object.keys(extensionSettings.presets)[0]);
		if (fallbackPreset) {
			$(this).val(fallbackPreset);
		}
		refreshPresetOptionLabels();
		if (typeof toastr !== "undefined") {
			const message = t(
				"settings.presets.toast.legacyReadOnly",
				"This preset uses an older schema. Previewing it in read-only mode instead."
			);
			toastr.info(message, "Legacy Tracker Preset");
		}
		if (legacySnapshot.preset) {
			legacyPresetViewer.show(selectedPreset, legacySnapshot.preset);
		} else {
			warn("Legacy preset missing payload", { preset: selectedPreset });
		}
		return;
	}

	applyPreset(selectedPreset);
}

function applyPreset(presetName) {
	const presetSettings = extensionSettings.presets[presetName];
	if (!presetSettings) {
		warn("Preset selection ignored because preset was not found", { presetName });
		return;
	}
	extensionSettings.selectedPreset = presetName;
	const presetClone = deepClone(presetSettings);
	Object.assign(extensionSettings, presetClone);
	debug("Selected preset:", { presetName, presetClone });
	setSettingsInitialValues();
	saveSettingsDebounced();
}

/**
 * Event handler for creating a new preset.
 */
function onPresetNewClick() {
	const rawName = prompt("Enter a name for the new preset:");
	const presetName = rawName ? rawName.trim() : "";
	if (!presetName) {
		return;
	}
	if (isBuiltInPresetName(presetName)) {
		if (typeof toastr !== "undefined") {
			toastr.error("Built-in preset names are reserved. Choose a unique name for your custom preset.");
		} else {
			alert("Built-in preset names are reserved. Choose a unique name for your custom preset.");
		}
		return;
	}
	if (!extensionSettings.presets[presetName]) {
		const newPreset = deepClone(getCurrentPresetSettings());
		extensionSettings.presets[presetName] = newPreset;
		extensionSettings.selectedPreset = presetName;
		updatePresetDropdown();
		refreshPresetBaseline();
		updatePresetDirtyState();
		saveSettingsDebounced();
		toastr.success(`Tracker Enhanced preset ${presetName} created.`);
	} else if (extensionSettings.presets[presetName]) {
		alert("A preset with that name already exists.");
	}
}

/**
 * Event handler for creating a new preset.
 */
function onPresetSaveClick() {
	const originalPresetName = extensionSettings.selectedPreset;
	const duplicated = ensureEditablePreset();
	const presetName = extensionSettings.selectedPreset;
	const updatedPreset = getCurrentPresetSettings();
	extensionSettings.presets[presetName] = deepClone(updatedPreset);
	refreshPresetBaseline();
	updatePresetDirtyState();
	saveSettingsDebounced();
	if (duplicated && presetName !== originalPresetName) {
		toastr.success(`Tracker Enhanced preset ${presetName} created from ${originalPresetName} and saved.`);
	} else {
		toastr.success(`Tracker Enhanced preset ${presetName} saved.`);
	}
}

/**
 * Event handler for renaming an existing preset.
 */
function onPresetRenameClick() {
	const oldName = $("#tracker_enhanced_preset_select").val();
	if (!oldName) {
		toastr.error("No preset selected for renaming.");
		return;
	}
	if (isBuiltInPresetName(oldName)) {
		toastr.error("Built-in presets cannot be renamed.");
		return;
	}
	
	const newNameInput = prompt("Enter the new name for the preset:", oldName);
	const newName = newNameInput ? newNameInput.trim() : "";
	if (!newName || newName === oldName) {
		return;
	}
	if (isBuiltInPresetName(newName)) {
		toastr.error("Built-in preset names are reserved. Choose a different name.");
		return;
	}
	if (!extensionSettings.presets[newName]) {
		extensionSettings.presets[newName] = extensionSettings.presets[oldName];
		delete extensionSettings.presets[oldName];
		if (extensionSettings.selectedPreset === oldName) {
			extensionSettings.selectedPreset = newName;
		}
		updatePresetDropdown();
		refreshPresetBaseline();
		updatePresetDirtyState();
		saveSettingsDebounced();
		toastr.success(`Tracker Enhanced preset "${oldName}" renamed to "${newName}".`);
	} else if (extensionSettings.presets[newName]) {
		alert("A preset with that name already exists.");
	}
}

/**
 * Event handler for renaming an existing preset.
 */
function onPresetRestoreClick() {
	const presetName = extensionSettings.selectedPreset;
	applyPreset(presetName);
	toastr.success(`Tracker Enhanced preset ${presetName} restored.`);
}

/**
 * Event handler for deleting a preset.
 */
function onPresetDeleteClick() {
	const presetName = $("#tracker_enhanced_preset_select").val();
	if (!presetName) {
		toastr.error("No preset selected for deletion.");
		return;
	}
	if (isBuiltInPresetName(presetName)) {
		toastr.error("Built-in presets cannot be deleted.");
		return;
	}
	
	if (confirm(`Are you sure you want to delete the preset "${presetName}"?`)) {
		delete extensionSettings.presets[presetName];
		
		// Select the first available preset or create a default one
		const remainingPresets = Object.keys(extensionSettings.presets);
		if (remainingPresets.length > 0) {
			extensionSettings.selectedPreset = remainingPresets[0];
		} else {
			// Create a default preset if none exist
			extensionSettings.presets["Default"] = getCurrentPresetSettings();
			extensionSettings.selectedPreset = "Default";
		}
		
		updatePresetDropdown();
		onPresetSelectChange.call($("#tracker_enhanced_preset_select"));
		toastr.success(`Tracker Enhanced preset "${presetName}" deleted.`);
	}
}

/**
 * Event handler for exporting a preset.
 */
function onPresetExportClick() {
	const presetName = $("#tracker_enhanced_preset_select").val();
	if (!presetName) {
		toastr.error("No preset selected for export.");
		return;
	}

	const presetData = extensionSettings.presets[presetName];
	const legacySnapshot = presetData ? null : getLegacyPresetSnapshot(presetName);
	let exportPresetName = presetName;
	let exportPayload = null;
	let exportKind = "valid";

	if (presetData) {
		exportPayload = deepClone(presetData);
		if (isBuiltInPresetName(presetName)) {
			const suffix = t("settings.presets.copySuffix", "copy");
			const baseName = `${presetName} (${suffix})`;
			exportPresetName = ensureUniquePresetName(baseName, extensionSettings.presets);
		}
	} else if (legacySnapshot && legacySnapshot.preset) {
		exportKind = "legacy";
		exportPayload = deepClone(legacySnapshot.preset);
		if (!exportPresetName.endsWith(LEGACY_EXPORT_SUFFIX)) {
			exportPresetName = `${exportPresetName}${LEGACY_EXPORT_SUFFIX}`;
		}
	} else {
		toastr.error(`Preset "${presetName}" not found.`);
		return;
	}

	const dataStr = JSON.stringify({ [exportPresetName]: exportPayload }, null, 2);
	const blob = new Blob([dataStr], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = $("<a>").attr("href", url).attr("download", `${exportPresetName}.json`);
	$("body").append(a);
	a[0].click();
	a.remove();
	URL.revokeObjectURL(url);
	const toastTitle = "Tracker Enhanced Export";
	if (exportKind === "legacy") {
		toastr.info(`Legacy preset "${presetName}" exported as "${exportPresetName}".`, toastTitle);
	} else if (exportPresetName !== presetName) {
		toastr.success(`Preset "${presetName}" exported as "${exportPresetName}".`, toastTitle);
	} else {
		toastr.success(`Preset "${presetName}" exported successfully.`, toastTitle);
	}
	debug("Preset export completed", { presetName, exportPresetName, exportKind });
}

/**
 * Event handler for clicking the import button.
 */
function onPresetImportButtonClick() {
	$("#tracker_enhanced_preset_import").click();
}

/**
 * Event handler for importing presets from a file.
 * @param {Event} event The change event from the file input.
 */
function onPresetImportChange(event) {
	const file = event.target.files[0];
	if (!file) return;

	const inputElement = event.target;
	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const importedPresets = JSON.parse(e.target.result);

			migrateIsDynamicToPresence(importedPresets);
			if (!importedPresets || typeof importedPresets !== "object" || Array.isArray(importedPresets)) {
				throw new Error("Preset file must contain an object map.");
			}
			const timestamp = new Date();
			const canonicalOptions = { canonicalMap: CANONICAL_FIELD_MAP };
			const legacyStore = normalizeLegacyPresetStore(extensionSettings.legacyPresets);
			const legacyNameSet = new Set([
				...Object.keys(extensionSettings.presets || {}),
				...Object.keys(legacyStore),
			]);
			const isoTimestamp = timestamp.toISOString();
			const skippedBuiltIns = [];
			const importedPresetsList = [];
			const quarantinedPresets = [];

			for (const [presetName, presetValue] of Object.entries(importedPresets || {})) {
				if (isBuiltInPresetName(presetName)) {
					skippedBuiltIns.push(presetName);
					continue;
				}

				if (extensionSettings.presets[presetName] && !confirm(`Preset "${presetName}" already exists. Overwrite?`)) {
					continue;
				}

				const analysis = analyzePresetSnapshot(presetName, presetValue, canonicalOptions);
				if (analysis.isLegacy) {
					const legacyLabel = generateLegacyPresetName(presetName, legacyNameSet, { timestamp });
					legacyNameSet.add(legacyLabel);
					legacyStore[legacyLabel] = {
						originalName: presetName,
						quarantinedAt: isoTimestamp,
						reasons: analysis.reasons,
						preset: deepClone(presetValue),
					};
					quarantinedPresets.push({ originalName: presetName, legacyLabel });
					continue;
				}

				const normalizedSnapshot = analysis.normalizedSnapshot || deepClone(presetValue);
				extensionSettings.presets[presetName] = normalizedSnapshot;
				importedPresetsList.push(presetName);
				legacyNameSet.add(presetName);
			}

			extensionSettings.legacyPresets = legacyStore;

			let quarantineSummary = null;
			if (importedPresetsList.length || quarantinedPresets.length) {
				quarantineSummary = quarantineExtensionPresets({ timestamp });
				announcePresetQuarantine(quarantineSummary, { context: "import" });
			}

			updatePresetDropdown();
			saveSettingsDebounced();

			debug("Preset import completed", {
				imported: importedPresetsList,
				quarantined: quarantinedPresets,
				skippedBuiltIns,
			});

			if (typeof toastr !== "undefined") {
				if (skippedBuiltIns.length > 0) {
					toastr.warning(`Skipped built-in preset names: ${skippedBuiltIns.join(", ")}.`, "Tracker Enhanced Import");
				}
				if (importedPresetsList.length || quarantinedPresets.length) {
					const parts = [];
					if (importedPresetsList.length) {
						parts.push(`Imported ${importedPresetsList.length} preset${importedPresetsList.length === 1 ? "" : "s"}.`);
					}
					if (quarantinedPresets.length) {
						parts.push(`Quarantined ${quarantinedPresets.length} legacy preset${quarantinedPresets.length === 1 ? "" : "s"}.`);
					}
					const toastMessage = parts.join(" ");
					const toastTitle = "Tracker Enhanced Import";
					if (importedPresetsList.length) {
						toastr.success(toastMessage, toastTitle);
					} else {
						toastr.info(toastMessage, toastTitle);
					}
				} else if (skippedBuiltIns.length === 0) {
					toastr.info("No presets were imported.", "Tracker Enhanced Import");
				}
			}
		} catch (err) {
			error("Failed to import presets", err);
			alert("Failed to import presets: " + err.message);
		}
	};
	reader.onloadend = function () {
		if (inputElement) {
			inputElement.value = "";
		}
	};
	reader.readAsText(file);
}

/**
 * Retrieves the current settings to save as a preset.
 * @returns {Object} The current preset settings.
 */
function getCurrentPresetSettings() {
	return {
		generateContextTemplate: extensionSettings.generateContextTemplate,
		generateSystemPrompt: extensionSettings.generateSystemPrompt,
		generateRequestPrompt: extensionSettings.generateRequestPrompt,
		participantGuidanceTemplate: extensionSettings.participantGuidanceTemplate,
		generateRecentMessagesTemplate: extensionSettings.generateRecentMessagesTemplate,
		roleplayPrompt: extensionSettings.roleplayPrompt,
		characterDescriptionTemplate: extensionSettings.characterDescriptionTemplate,
		mesTrackerTemplate: extensionSettings.mesTrackerTemplate,
		mesTrackerJavascript: extensionSettings.mesTrackerJavascript,
		automationTarget: extensionSettings.automationTarget,
		participantTarget: extensionSettings.participantTarget,
		showPopupFor: extensionSettings.showPopupFor,
		trackerFormat: extensionSettings.trackerFormat,
		numberOfMessages: extensionSettings.numberOfMessages,
		generateFromMessage: extensionSettings.generateFromMessage,
		minimumDepth: extensionSettings.minimumDepth,
		responseLength: extensionSettings.responseLength,
		devToolsEnabled: extensionSettings.devToolsEnabled,
		debugMode: extensionSettings.debugMode,
		trackerInjectionEnabled: extensionSettings.trackerInjectionEnabled,
		toolbarIndicatorEnabled: extensionSettings.toolbarIndicatorEnabled,
		trackerDef: extensionSettings.trackerDef,
	};
}

// #endregion

// #region Setting Change Handlers

/**
 * Returns a function to handle checkbox input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingCheckboxInput(settingName, options = {}) {
	const trackPreset = options.trackPreset !== false;
	return function () {
		const value = Boolean($(this).prop("checked"));
		extensionSettings[settingName] = value;
		if (trackPreset) {
			handleSettingsMutation();
		} else {
			saveSettingsDebounced();
		}
	};
}

/**
 * Returns a function to handle select input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingSelectChange(settingName) {
	return function () {
		const value = $(this).val();
		extensionSettings[settingName] = value;
		if (settingName === "automationTarget") {
			updatePopupDropdown();
		}
		handleSettingsMutation();
	};
}

/**

 * Returns a function to handle textarea input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingInputareaInput(settingName) {
	return function () {
		const value = $(this).val();
		extensionSettings[settingName] = value;
		if (settingName === "mesTrackerJavascript") {
			processTrackerJavascript();
		}
		handleSettingsMutation();
	};
}

/**
 * Processes and validates the user-provided JavaScript for mesTrackerJavascript,
 * ensuring optional init and cleanup functions are handled correctly.
 */
function processTrackerJavascript() {
    try {
        const scriptContent = extensionSettings.mesTrackerJavascript;

        // Parse user input as a function and execute it
        const parsedFunction = new Function(`return (${scriptContent})`)();

        let parsedObject;
        if (typeof parsedFunction === "function") {
            parsedObject = parsedFunction(); // Call the function to get the object
        } else if (typeof parsedFunction === "object" && parsedFunction !== null) {
            parsedObject = parsedFunction;
        }

        // Ensure the final result is an object
        if (typeof parsedObject === "object" && parsedObject !== null) {
            // Call cleanup function of the existing tracker before replacing it
            if (SillyTavern.trackerEnhanced && typeof SillyTavern.trackerEnhanced.cleanup === "function") {
                try {
                    SillyTavern.trackerEnhanced.cleanup();
                    debug("Previous tracker enhanced cleaned up successfully.");
                } catch (cleanupError) {
                    error("Error during tracker enhanced cleanup:", cleanupError);
                }
            }

            // Assign the new tracker object
            SillyTavern.trackerEnhanced = parsedObject;

            // Call init function only if both init and cleanup exist
            if (
                typeof SillyTavern.trackerEnhanced.init === "function" &&
                typeof SillyTavern.trackerEnhanced.cleanup === "function"
            ) {
                try {
                    SillyTavern.trackerEnhanced.init();
                    debug("Tracker enhanced initialized successfully.");
                } catch (initError) {
                    error("Error initializing tracker enhanced:", initError);
                }
            }

            debug("Custom tracker enhanced functions updated:", SillyTavern.trackerEnhanced);
        }
    } catch (err) {
		debug("Error processing tracker JavaScript:", err);
        SillyTavern.trackerEnhanced = {};
    }
}


/**
 * Returns a function to handle number input changes for a given setting.
 * @param {string} settingName The name of the setting.
 * @returns {Function} The event handler function.
 */
function onSettingNumberInput(settingName) {
	return function () {
		let value = parseFloat($(this).val());
		if (isNaN(value)) {
			value = 0;
		}

		if(settingName == "numberOfMessages" && value < 1) {
			value = 1; 
			$(this).val(1);
		}
		extensionSettings[settingName] = value;
		handleSettingsMutation();
	};
}

/**
 * Event handler for clicking the Tracker Prompt Maker button.
 */
function onTrackerPromptMakerClick() {
	const modal = new TrackerPromptMakerModal();
	modal.show(extensionSettings.trackerDef, (updatedTracker) => {
		extensionSettings.trackerDef = updatedTracker;
		handleSettingsMutation();
	});
}

/**
 * Event handler for clicking the Generate Template button.
 */
function onGenerateTemplateClick() {
	try {
		if (typeof debug === 'function') {
			debug('Generate Template clicked. Current trackerDef:', extensionSettings.trackerDef);
		}
		
		// Check if trackerDef exists and has fields
		if (!extensionSettings.trackerDef || Object.keys(extensionSettings.trackerDef).length === 0) {
			toastr.warning('No tracker fields defined. Please use the Prompt Maker to define fields first.', 'Template Generation');
			return;
		}

		// Generate the template
		const templateGenerator = new TrackerTemplateGenerator();
		const generatedTemplate = templateGenerator.generateTableTemplate(extensionSettings.trackerDef);
		
		if (typeof debug === 'function') {
			debug('Generated template result:', generatedTemplate);
		}
		
		// Update the textarea and extension settings
		$("#tracker_enhanced_mes_tracker_template").val(generatedTemplate);
		extensionSettings.mesTrackerTemplate = generatedTemplate;
		
		// Save settings
		handleSettingsMutation();
		
		// Show success message
		toastr.success('Template generated successfully from your Prompt Maker fields!', 'Template Generation');
		
		if (typeof debug === 'function') {
			debug('Template generation completed successfully');
		}
		
	} catch (error) {
		console.error('Failed to generate template:', error);
		toastr.error('Failed to generate template. Check console for details.', 'Template Generation');
	}
}

/**
 * Event handler for clicking the Generate JavaScript button.
 */
function onGenerateJavaScriptClick() {
	try {
		if (typeof debug === 'function') {
			debug('Generate JavaScript clicked. Current trackerDef:', extensionSettings.trackerDef);
		}
		
		// Check if trackerDef exists and has fields
		if (!extensionSettings.trackerDef || Object.keys(extensionSettings.trackerDef).length === 0) {
			toastr.warning('No tracker fields defined. Please use the Prompt Maker to define fields first.', 'JavaScript Generation');
			return;
		}

		// Generate the JavaScript
		const jsGenerator = new TrackerJavaScriptGenerator();
		const generatedJS = jsGenerator.generateJavaScript(extensionSettings.trackerDef);
		
		if (typeof debug === 'function') {
			debug('Generated JavaScript result:', generatedJS);
		}
		
		// Update the textarea and extension settings
		$("#tracker_enhanced_mes_tracker_javascript").val(generatedJS);
		extensionSettings.mesTrackerJavascript = generatedJS;
		
		// Save settings
		handleSettingsMutation();
		
		// Show success message
		toastr.success('JavaScript generated successfully with gender-specific field hiding!', 'JavaScript Generation');
		
		if (typeof debug === 'function') {
			debug('JavaScript generation completed successfully');
		}
		
	} catch (error) {
		console.error('Failed to generate JavaScript:', error);
		toastr.error('Failed to generate JavaScript. Check console for details.', 'JavaScript Generation');
	}
}

/**
 * Event handler for resetting the tracker prompts to default.
 */
function onTrackerPromptResetClick() {
    let resetButton = $("#tracker_enhanced_reset_presets");
    let resetLabel = resetButton.parent().find("label");

    if (!resetLabel.length) {
        // If no label found, create one temporarily
        resetLabel = $("<label>").insertBefore(resetButton);
    }

    resetLabel.text("Click again to confirm");

    // Remove the current click event to avoid duplicate bindings
    resetButton.off("click");

    // Set a timeout to restore the original behavior after 60 seconds
    let timeoutId = setTimeout(() => {
        resetLabel.text("");
        resetButton.off("click").on("click", onTrackerPromptResetClick);
    }, 60000);

    // Bind the second-click event to reset presets
	resetButton.one("click", async () => {
        clearTimeout(timeoutId); // Clear the timeout to prevent reverting behavior

		debug("Resetting Tracker Enhanced extension defaults while preserving connection and UI settings.");

		try {
			const defaultsClone = deepClone(defaultSettings);
			const preservedSettings = {
				enabled: extensionSettings.enabled,
				selectedProfile: extensionSettings.selectedProfile,
				selectedCompletionPreset: extensionSettings.selectedCompletionPreset,
				languageOverride: extensionSettings.languageOverride,
			};

			const existingPresets = extensionSettings.presets || {};
			const customPresets = {};
			for (const [name, preset] of Object.entries(existingPresets)) {
				if (!isBuiltInPresetName(name)) {
					customPresets[name] = deepClone(preset);
				}
			}
			const preservedLegacyPresets = extensionSettings.legacyPresets ? deepClone(extensionSettings.legacyPresets) : {};

			Object.assign(extensionSettings, defaultsClone);
			await ensureLocalePresetsRegistered({ force: true });
			Object.assign(extensionSettings, preservedSettings);
			extensionSettings.legacyPresets = preservedLegacyPresets;
			extensionSettings.presets = {
				...extensionSettings.presets,
				...customPresets,
			};
			extensionSettings.selectedPreset = DEFAULT_PRESET_NAME;
			const quarantineSummary = quarantineExtensionPresets({ timestamp: new Date() });
			announcePresetQuarantine(quarantineSummary, { context: "reset" });
			setSettingsInitialValues();
			processTrackerJavascript();
			
			// Save the reset settings
			saveSettingsDebounced();
			
			toastr.success("Defaults restored. Custom presets and backups were preserved.");
			
		} catch (error) {
			console.error("Failed to reset settings:", error);
			toastr.error("Failed to reset settings. Check console for details.");
		}

        // Restore the original behavior
		resetLabel.text("");
		resetButton.off("click").on("click", onTrackerPromptResetClick);
    });
}

// #endregion

// #region Field Visibility Management

/**
 * Updates the visibility of fields based on the selected generation mode.
 * @param {string} mode The current generation mode.
 */
// #endregion

// #region Popup Options Management

/**
 * Updates the popup for dropdown with the available values.
 */
function updatePopupDropdown() {
	const showPopupForSelect = $("#tracker_enhanced_show_popup_for");
	const availablePopupOptions = [];
	const automationTarget = extensionSettings.automationTarget ?? defaultSettings.automationTarget;
	switch (automationTarget) {
		case automationTargets.CHARACTER:
			availablePopupOptions.push(automationTargets.USER);
			availablePopupOptions.push(automationTargets.NONE);
			break;
		case automationTargets.USER:
			availablePopupOptions.push(automationTargets.CHARACTER);
			availablePopupOptions.push(automationTargets.NONE);
			break;
		case automationTargets.BOTH:
			availablePopupOptions.push(automationTargets.NONE);
			break;
		case automationTargets.NONE:
			availablePopupOptions.push(automationTargets.BOTH);
			availablePopupOptions.push(automationTargets.USER);
			availablePopupOptions.push(automationTargets.CHARACTER);
			availablePopupOptions.push(automationTargets.NONE);
			break;
	}

	if(!availablePopupOptions.includes(extensionSettings.showPopupFor)) {
		extensionSettings.showPopupFor = automationTargets.NONE;
		saveSettingsDebounced();
	}

	showPopupForSelect.empty();
	for (const popupOption of availablePopupOptions) {
		const text = t(targetOptionLabelKeys[popupOption] || popupOption, toTitleCase(popupOption));
		const option = $("<option>").val(popupOption).text(text);
		if (popupOption === extensionSettings.showPopupFor) {
			option.attr("selected", "selected");
		}
		showPopupForSelect.append(option);
	}
}

// #endregion
