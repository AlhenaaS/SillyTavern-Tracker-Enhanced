import { saveSettingsDebounced } from "../../../../../../script.js";
import { getContext } from '../../../../../../scripts/extensions.js';

import { extensionFolderPath, extensionSettings } from "../../index.js";
import { error, debug, warn, toTitleCase } from "../../lib/utils.js";
import { getSupportedLocales, setLocale, t, translateHtml, onLocaleChange, getCurrentLocale } from "../../lib/i18n.js";
import { DEFAULT_PRESET_NAME, TRACKER_METADATA_VERSION, defaultSettings, automationTargets, participantTargets } from "./defaultSettings.js";
import { generationCaptured } from "../../lib/interconnection.js";
import { TrackerPromptMakerModal } from "../ui/trackerPromptMakerModal.js";
import { TrackerTemplateGenerator } from "../ui/components/trackerTemplateGenerator.js";
import { TrackerJavaScriptGenerator } from "../ui/components/trackerJavaScriptGenerator.js";
import { TrackerInterface } from "../ui/trackerInterface.js";
import { DevelopmentTestUI } from "../ui/developmentTestUI.js";

export { automationTargets, participantTargets, trackerFormat } from "./defaultSettings.js";

let settingsRootElement = null;
let localeListenerRegistered = false;
const LEGACY_DEFAULT_PRESET_NAME = "Default-BuildIn";
const BUILTIN_PRESET_NAMES = new Set([DEFAULT_PRESET_NAME]);
const BUILTIN_PRESET_TEMPLATES = new Map();
const BACKUP_PRESET_PREFIX = "❌ Backup";
const legacyPresetNames = new Set();
const CANONICAL_FIELD_MAP = buildCanonicalFieldMap(defaultSettings.trackerDef);

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

function buildCanonicalFieldMap(definition) {
	const map = new Map();
	if (!definition || typeof definition !== "object") {
		return map;
	}
	for (const [fieldId, field] of Object.entries(definition)) {
		if (!field || typeof field !== "object") {
			continue;
		}
		map.set(fieldId, {
			metadata: normalizeMetadata(field.metadata || {}),
			nested: buildCanonicalFieldMap(field.nestedFields || {}),
		});
	}
	return map;
}

function normalizeFieldPresence(field, context) {
	if (!field || typeof field !== "object") {
		return;
	}

	const rawPresence = typeof field.presence === "string" ? field.presence.toUpperCase() : null;
	const normalizedPresence = rawPresence === "STATIC" ? "STATIC" : "DYNAMIC";
	if (field.presence !== normalizedPresence) {
		field.presence = normalizedPresence;
		if (context) {
			context.changed = true;
		}
	}
}

function alignTrackerFields(fields, canonicalMap, context) {
	if (!fields || typeof fields !== "object") {
		if (canonicalMap && canonicalMap.size > 0) {
			context.legacyDetected = true;
		}
		return;
	}

	for (const [fieldId, canonicalField] of canonicalMap.entries()) {
		const field = fields[fieldId];
		if (!field || typeof field !== "object") {
			context.legacyDetected = true;
			continue;
		}

		normalizeFieldPresence(field, context);
		const canonicalMetadata = canonicalField.metadata;
		const normalized = normalizeMetadata(field.metadata || {});
		if (!metadataEquals(normalized, canonicalMetadata)) {
			field.metadata = { ...canonicalMetadata };
			context.changed = true;
		} else if (!metadataEquals(field.metadata || {}, normalized)) {
			field.metadata = normalized;
			context.changed = true;
		}

		if (canonicalField.nested.size > 0) {
			if (!field.nestedFields || typeof field.nestedFields !== "object") {
				context.legacyDetected = true;
			} else {
				alignTrackerFields(field.nestedFields, canonicalField.nested, context);
			}
		}
	}

	for (const [fieldId, field] of Object.entries(fields)) {
		if (!field || typeof field !== "object") {
			continue;
		}
		const canonicalField = canonicalMap.get(fieldId);
		normalizeFieldPresence(field, context);
		if (!canonicalField) {
			const normalized = normalizeMetadata(field.metadata || {});
			if (!metadataEquals(field.metadata || {}, normalized)) {
				field.metadata = normalized;
				context.changed = true;
			}
			if (field.nestedFields && typeof field.nestedFields === "object") {
				alignTrackerFields(field.nestedFields, new Map(), context);
			}
		}
	}
}

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

function isBackupPresetName(name) {
	return Boolean(name && name.startsWith(`${BACKUP_PRESET_PREFIX} `));
}

function ensureUniquePresetName(baseName, existingPresets) {
	let candidate = baseName;
	let counter = 2;
	while (Object.prototype.hasOwnProperty.call(existingPresets, candidate)) {
		candidate = `${baseName} (${counter++})`;
	}
	return candidate;
}

function formatBackupTimestamp() {
	const now = new Date();
	const iso = now.toISOString();
	const date = iso.slice(0, 10);
	const time = iso.slice(11, 16);
	return `${date} ${time}`;
}

function buildBackupPresetName(originalName, existingPresets = {}) {
	const timestamp = formatBackupTimestamp();
	const base = `${BACKUP_PRESET_PREFIX} ${timestamp} ${originalName}`;
	return ensureUniquePresetName(base, existingPresets);
}

function sanitizeTrackerDefinition(definition) {
	const clone = deepClone(definition);
	const context = { changed: false, legacyDetected: false };
	alignTrackerFields(clone, CANONICAL_FIELD_MAP, context);
	return {
		definition: clone,
		changed: Boolean(context.changed),
		legacyDetected: Boolean(context.legacyDetected),
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

function handleLegacyTrackerPresets() {
	legacyPresetNames.clear();
	const report = {
		replacedBuiltIns: [],
		backedUpPresets: [],
		rootChanged: false,
	};

	if (extensionSettings.trackerDef) {
		const rootAnalysis = sanitizeTrackerDefinition(extensionSettings.trackerDef);
		if (rootAnalysis.changed || rootAnalysis.legacyDetected) {
			report.rootChanged = true;
		}
		extensionSettings.trackerDef = rootAnalysis.definition;
	}

	const presets = extensionSettings.presets || {};
	const updatedPresets = {};
	const originalSelectedPreset = extensionSettings.selectedPreset;
	let selectedPreset = originalSelectedPreset;

	for (const [presetName, presetValue] of Object.entries(presets)) {
		if (!presetValue || typeof presetValue !== "object") {
			updatedPresets[presetName] = presetValue;
			continue;
		}

		const presetClone = deepClone(presetValue);
		if (!presetClone.trackerDef) {
			updatedPresets[presetName] = presetClone;
			continue;
		}

		const analysis = sanitizeTrackerDefinition(presetClone.trackerDef);
		const requiresBackup = analysis.changed || analysis.legacyDetected;

		if (requiresBackup && isBuiltInPresetName(presetName)) {
			const template = BUILTIN_PRESET_TEMPLATES.get(presetName) || createBuiltInPresetSnapshot(presetName, presetClone);
			updatedPresets[presetName] = deepClone(template || presetClone);
			registerBuiltInPresetTemplate(presetName, updatedPresets[presetName]);
			report.replacedBuiltIns.push(presetName);
			continue;
		}

		if (requiresBackup && isBackupPresetName(presetName)) {
			presetClone.trackerDef = analysis.definition;
			updatedPresets[presetName] = presetClone;
			legacyPresetNames.add(presetName);
			continue;
		}

		if (requiresBackup) {
			const uniquenessContext = { ...presets, ...updatedPresets };
			const backupName = buildBackupPresetName(presetName, uniquenessContext);
			const backupPreset = deepClone(presetClone);
			backupPreset.trackerDef = analysis.definition;
			updatedPresets[backupName] = backupPreset;
			legacyPresetNames.add(backupName);
			report.backedUpPresets.push({ originalName: presetName, backupName });
			if (selectedPreset === presetName) {
				selectedPreset = backupName;
			}
			continue;
		}

		presetClone.trackerDef = analysis.definition;
		updatedPresets[presetName] = presetClone;
		if (isBuiltInPresetName(presetName)) {
			registerBuiltInPresetTemplate(presetName, presetClone);
		}
		if (isBackupPresetName(presetName)) {
			legacyPresetNames.add(presetName);
		}
	}

	extensionSettings.presets = updatedPresets;
	extensionSettings.selectedPreset = selectedPreset in updatedPresets ? selectedPreset : DEFAULT_PRESET_NAME;
	const finalSelectedPreset = extensionSettings.selectedPreset;
	if (finalSelectedPreset && updatedPresets[finalSelectedPreset]) {
		Object.assign(extensionSettings, deepClone(updatedPresets[finalSelectedPreset]));
	}

	return report;
}

function notifyPresetMaintenance(report = {}) {
	const replaced = report.replacedBuiltIns || [];
	const backups = report.backedUpPresets || [];
	if (backups.length === 0) {
		if (replaced.length > 0) {
			debug("Legacy tracker presets refreshed without needing backups", { replaced });
		}
		return;
	}

	const replacedSummary = replaced.length > 0 ? `Replaced with fresh defaults: ${replaced.join(", ")}` : "";
	const backupSummary = backups.length > 0
		? `Backed up outdated presets:<br>${backups.map(({ originalName, backupName }) => `- ${originalName} -> ${backupName}`).join("<br>")}`
		: "";

	debug("Legacy tracker presets processed", { replaced, backups });

	if (typeof toastr === "undefined") {
		return;
	}

	const message = [replacedSummary, backupSummary, "Select a ❌ Backup entry to review old settings. Rebuild presets from the refreshed defaults for long-term use."].filter(Boolean).join("<br><br>");

	toastr.info(message, "Tracker Enhanced Presets Updated", {
		closeButton: true,
		timeOut: 0,
		extendedTimeOut: 0,
		escapeHtml: false,
	});
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
	migrateDefaultPresetName(extensionSettings);

	const currentSettings = { ...extensionSettings };
	const hadExistingSettings = Object.keys(currentSettings).length > 0;
	const hadMetadataSchemaVersion = Object.prototype.hasOwnProperty.call(currentSettings, "metadataSchemaVersion");

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

	if (hadExistingSettings && !hadMetadataSchemaVersion) {
		extensionSettings.metadataSchemaVersion = 0;
	}

	delete extensionSettings.localePresetSnapshot;

	if (!extensionSettings.selectedPreset) {
		extensionSettings.selectedPreset = defaultSettings.selectedPreset || DEFAULT_PRESET_NAME;
	}

	await ensureLocalePresetsRegistered();
	registerBuiltInPresetTemplate(DEFAULT_PRESET_NAME, defaultSettings.presets?.[DEFAULT_PRESET_NAME]);
	const legacyReport = handleLegacyTrackerPresets();
	extensionSettings.metadataSchemaVersion = TRACKER_METADATA_VERSION;
	notifyPresetMaintenance(legacyReport);

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

function migrateDefaultPresetName(settings) {
	if (!settings || typeof settings !== "object") return;

	const presets = settings.presets;
	if (presets && Object.prototype.hasOwnProperty.call(presets, LEGACY_DEFAULT_PRESET_NAME)) {
		if (!presets[DEFAULT_PRESET_NAME]) {
			presets[DEFAULT_PRESET_NAME] = presets[LEGACY_DEFAULT_PRESET_NAME];
		}
		delete presets[LEGACY_DEFAULT_PRESET_NAME];
	}

	if (settings.selectedPreset === LEGACY_DEFAULT_PRESET_NAME) {
		settings.selectedPreset = DEFAULT_PRESET_NAME;
	}

	const legacyOldSettings = settings.oldSettings;
	if (legacyOldSettings && typeof legacyOldSettings === "object") {
		if (legacyOldSettings.presets && Object.prototype.hasOwnProperty.call(legacyOldSettings.presets, LEGACY_DEFAULT_PRESET_NAME)) {
			if (!legacyOldSettings.presets[DEFAULT_PRESET_NAME]) {
				legacyOldSettings.presets[DEFAULT_PRESET_NAME] = legacyOldSettings.presets[LEGACY_DEFAULT_PRESET_NAME];
			}
			delete legacyOldSettings.presets[LEGACY_DEFAULT_PRESET_NAME];
		}

		if (legacyOldSettings.selectedPreset === LEGACY_DEFAULT_PRESET_NAME) {
			legacyOldSettings.selectedPreset = DEFAULT_PRESET_NAME;
		}
	}
}

function ensurePresetsMetadata(presets) {
	const result = { changed: false, legacyDetected: false };
	if (!presets || typeof presets !== "object") return result;

	for (const [presetName, preset] of Object.entries(presets)) {
		if (preset && typeof preset === "object" && preset.trackerDef) {
			const sanitized = sanitizeTrackerDefinition(preset.trackerDef);
			result.changed = result.changed || sanitized.changed || sanitized.legacyDetected;
			preset.trackerDef = sanitized.definition;
			if (isBackupPresetName(presetName)) {
				legacyPresetNames.add(presetName);
			}
		}
	}

	return result;
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
	const existingPresetNames = new Set(Object.keys(extensionSettings.presets));
	const localeCatalog = new Map();
	const localeIds = [];
	let presetAdded = false;

	const builtInPresetDefinition = defaultSettings.presets?.[DEFAULT_PRESET_NAME];
	if (builtInPresetDefinition) {
		if (!existingPresetNames.has(DEFAULT_PRESET_NAME)) {
			const snapshot = createBuiltInPresetSnapshot(DEFAULT_PRESET_NAME, builtInPresetDefinition);
			extensionSettings.presets[DEFAULT_PRESET_NAME] = snapshot;
			presetAdded = true;
			existingPresetNames.add(DEFAULT_PRESET_NAME);
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
			const sanitizedValues = sanitizePresetValues(definition.values);
			if (Object.keys(sanitizedValues).length === 0) {
				return;
			}
			extensionSettings.presets[presetTitle] = sanitizedValues;
			registerBuiltInPresetTemplate(presetTitle, sanitizedValues);
			presetAdded = true;
			existingPresetNames.add(presetTitle);
		})
	);

	if (presetAdded) {
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

function sanitizePresetValues(values = {}) {
	const sanitized = {};
	for (const key of PRESET_VALUE_KEYS) {
		if (Object.prototype.hasOwnProperty.call(values, key)) {
			sanitized[key] = deepClone(values[key]);
		}
	}
	if (sanitized.trackerDef) {
		const analysis = sanitizeTrackerDefinition(sanitized.trackerDef);
		sanitized.trackerDef = analysis.definition;
	}
	return sanitized;
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
	$("#tracker_enhanced_enable").on("input", onSettingCheckboxInput("enabled"));
	$("#tracker_enhanced_automation_target").on("change", onSettingSelectChange("automationTarget"));
	$("#tracker_enhanced_participant_target").on("change", onSettingSelectChange("participantTarget"));
	$("#tracker_enhanced_show_popup_for").on("change", onSettingSelectChange("showPopupFor"));
	$("#tracker_enhanced_format").on("change", onSettingSelectChange("trackerFormat"));
	$("#tracker_enhanced_language_override").on("change", onLanguageOverrideChange);
	$("#tracker_enhanced_toolbar_indicator").on("input", (event) => {
		const enabled = $(event.currentTarget).is(":checked");
		extensionSettings.toolbarIndicatorEnabled = enabled;
		saveSettingsDebounced();
		if (typeof TrackerInterface.setIndicatorVisibility === "function") {
			TrackerInterface.setIndicatorVisibility(enabled);
		}
	});

	$("#tracker_enhanced_dev_tools").on("input", (event) => {
		const enabled = $(event.currentTarget).is(":checked");
		extensionSettings.devToolsEnabled = enabled;
		saveSettingsDebounced();
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
		if (presetName === extensionSettings.selectedPreset) {
			option.attr("selected", "selected");
		}
		presetSelect.append(option);
	}
}

/**
 * Event handler for changing the selected preset.
 */
function onPresetSelectChange() {
	const selectedPreset = $(this).val();
	extensionSettings.selectedPreset = selectedPreset;
	const presetSettings = extensionSettings.presets[selectedPreset];

	if (isBackupPresetName(selectedPreset) && typeof toastr !== "undefined") {
		toastr.warning("You selected a legacy backup preset. Review its contents and rebuild from the refreshed defaults when possible.", "Legacy Tracker Preset");
	}

	// Update settings with preset settings
	Object.assign(extensionSettings, presetSettings);
	debug("Selected preset:", { selectedPreset, presetSettings, extensionSettings });

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
		const newPreset = getCurrentPresetSettings();
		extensionSettings.presets[presetName] = newPreset;
		extensionSettings.selectedPreset = presetName;
		updatePresetDropdown();
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
	const presetName = extensionSettings.selectedPreset;
	if (isBuiltInPresetName(presetName)) {
		if (typeof toastr !== "undefined") {
			toastr.error("Built-in presets cannot be overwritten. Create a new preset or rename this preset first.");
		} else {
			alert("Built-in presets cannot be overwritten. Create a new preset or rename this preset first.");
		}
		return;
	}

	const updatedPreset = getCurrentPresetSettings();
	extensionSettings.presets[presetName] = updatedPreset;
	saveSettingsDebounced();
	toastr.success(`Tracker Enhanced preset ${presetName} saved.`);
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
	const presetSettings = extensionSettings.presets[extensionSettings.selectedPreset];

	// Restore settings with preset settings
	Object.assign(extensionSettings, presetSettings);

	setSettingsInitialValues();
	saveSettingsDebounced();
	toastr.success(`Tracker Enhanced preset ${extensionSettings.selectedPreset} restored.`);
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
		saveSettingsDebounced();
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
	if (!presetData) {
		toastr.error(`Preset "${presetName}" not found.`);
		return;
	}
	
	const dataStr = JSON.stringify({ [presetName]: presetData }, null, 2);
	const blob = new Blob([dataStr], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = $("<a>").attr("href", url).attr("download", `${presetName}.json`);
	$("body").append(a);
	a[0].click();
	a.remove();
	URL.revokeObjectURL(url);
	toastr.success(`Preset "${presetName}" exported successfully.`);
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

	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			const importedPresets = JSON.parse(e.target.result);

			migrateIsDynamicToPresence(importedPresets);
			
			const skippedBuiltIns = [];
			for (const presetName in importedPresets) {
				if (isBuiltInPresetName(presetName)) {
					skippedBuiltIns.push(presetName);
					continue;
				}
				if (!extensionSettings.presets[presetName] || confirm(`Preset "${presetName}" already exists. Overwrite?`)) {
					extensionSettings.presets[presetName] = importedPresets[presetName];
				}
			}
			ensurePresetsMetadata(extensionSettings.presets);
			updatePresetDropdown();
			saveSettingsDebounced();
			if (skippedBuiltIns.length > 0 && typeof toastr !== "undefined") {
				toastr.warning(`Skipped built-in preset names: ${skippedBuiltIns.join(", ")}.`, "Tracker Enhanced Import");
			}
			toastr.success("Presets imported successfully.");
		} catch (err) {
			alert("Failed to import presets: " + err.message);
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
function onSettingCheckboxInput(settingName) {
	return function () {
		const value = Boolean($(this).prop("checked"));
		extensionSettings[settingName] = value;
		saveSettingsDebounced();
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
		saveSettingsDebounced();
		if (settingName === "automationTarget") {
			updatePopupDropdown();
		}
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
		saveSettingsDebounced();
		if (settingName === "mesTrackerJavascript") {
			processTrackerJavascript();
		}
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
		saveSettingsDebounced();
	};
}

/**
 * Event handler for clicking the Tracker Prompt Maker button.
 */
function onTrackerPromptMakerClick() {
	const modal = new TrackerPromptMakerModal();
	modal.show(extensionSettings.trackerDef, (updatedTracker) => {
		extensionSettings.trackerDef = updatedTracker;
		saveSettingsDebounced();
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
		saveSettingsDebounced();
		
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
		saveSettingsDebounced();
		
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

			Object.assign(extensionSettings, defaultsClone);
			await ensureLocalePresetsRegistered({ force: true });
			Object.assign(extensionSettings, preservedSettings);
			extensionSettings.presets = {
				...extensionSettings.presets,
				...customPresets,
			};
			ensurePresetsMetadata(extensionSettings.presets);
			const legacyReport = handleLegacyTrackerPresets();
			notifyPresetMaintenance(legacyReport);
			extensionSettings.metadataSchemaVersion = TRACKER_METADATA_VERSION;
			extensionSettings.selectedPreset = DEFAULT_PRESET_NAME;
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
