import { saveChatConditional, chat, chat_metadata, setExtensionPrompt, extension_prompt_roles, deactivateSendButtons, activateSendButtons, getBiasStrings, system_message_types, sendSystemMessage, sendMessageAsUser, removeMacros, stopGeneration, extractMessageBias, messageFormatting } from "../../../../../script.js";

import { hasPendingFileAttachment } from "../../../../../scripts/chats.js";
import { getMessageTimeStamp } from "../../../../../scripts/RossAscends-mods.js";
import { log, debug, getLastMessageWithTracker, getLastNonSystemMessageIndex, getNextNonSystemMessageIndex, getPreviousNonSystemMessageIndex, isSystemMessage, shouldGenerateTracker, shouldShowPopup, warn } from "../lib/utils.js";
import { extensionSettings } from "../index.js";
import { generateTracker, getRequestPrompt } from "./generation.js";
import { generationTargets } from "./settings/settings.js";
import { FIELD_INCLUDE_OPTIONS, getDefaultTracker, OUTPUT_FORMATS, getTracker as getCleanTracker, trackerExists, cleanTracker, stripInternalOnlyFields } from "./trackerDataHandler.js";
import { TrackerEditorModal } from "./ui/trackerEditorModal.js";
import { TrackerPreviewManager } from "./ui/trackerPreviewManager.js";
import { jsonToYAML } from "../lib/ymlParser.js";

// Constants
const ACTION_TYPES = {
	CONTINUE: "continue",
	SWIPE: "swipe",
	REGENERATE: "regenerate",
	QUIET: "quiet",
	IMPERSONATE: "impersonate",
	ASK_COMMAND: "ask_command",
	NONE: "none",
};

const EXTENSION_PROMPT_ROLES = {
	SYSTEM: extension_prompt_roles.SYSTEM,
	USER: extension_prompt_roles.USER,
	ASSISTANT: extension_prompt_roles.ASSISTANT,
};

const SYSTEM_MESSAGE_TYPES = {
	HELP: system_message_types.HELP,
	WELCOME: system_message_types.WELCOME,
	GROUP_GENERATING: system_message_types.GROUP_GENERATING,
	EMPTY: system_message_types.EMPTY,
	GENERIC: system_message_types.GENERIC,
	NARRATOR: system_message_types.NARRATOR,
	COMMENT: system_message_types.COMMENT,
	SLASH_COMMANDS: system_message_types.SLASH_COMMANDS,
	FORMATTING: system_message_types.FORMATTING,
	HOTKEYS: system_message_types.HOTKEYS,
	MACROS: system_message_types.MACROS,
	WELCOME_PROMPT: system_message_types.WELCOME_PROMPT,
	ASSISTANT_NOTE: system_message_types.ASSISTANT_NOTE,
};

//#region Tracker Functions

/**
 * Retrieves the tracker object for a given message number.
 * @param {number} mesNum - The message number.
 * @returns {object} The tracker object.
 */
export function getTracker(mesNum) {
	let tracker = chat[mesNum]?.tracker;

	if (!tracker) {
		tracker = getDefaultTracker(extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, OUTPUT_FORMATS.JSON);
	}

	return tracker;
}


/**
 * Injects the tracker into the extension prompt system.
 * @param {object} tracker - The tracker object.
 * @param {number} position - The position to inject the tracker.
 */
export async function injectTracker(tracker = "", position = 0) {
	let trackerYAML = "";
	let trackerIncluded = false;
	if(trackerExists(tracker, extensionSettings.trackerDef) && tracker != "") {
		const cleanedTracker = cleanTracker(tracker, extensionSettings.trackerDef, OUTPUT_FORMATS.JSON, false);
		const sanitizedTracker = stripInternalOnlyFields(cleanedTracker, extensionSettings.trackerDef);
		const hasSanitizedContent = sanitizedTracker && typeof sanitizedTracker === "object" && Object.keys(sanitizedTracker).length > 0;
		trackerYAML = hasSanitizedContent ? jsonToYAML(sanitizedTracker).trim() : "";
		if(trackerYAML !== "") {
			debug("Injecting tracker:", { tracker: trackerYAML, position });
			const roleplayPrompt = (extensionSettings.roleplayPrompt ?? "").trim();
			const trackerBlock = `<tracker>\n${trackerYAML}\n</tracker>`;
			trackerYAML = roleplayPrompt ? `${roleplayPrompt}\n${trackerBlock}` : trackerBlock;
			trackerIncluded = true;
		}
	}
	position = Math.max(extensionSettings.minimumDepth, position);
	await setExtensionPrompt("trackerEnhanced", trackerYAML, 1, position, true, EXTENSION_PROMPT_ROLES.SYSTEM);
	if (trackerIncluded) {
		log(`[Tracker Enhanced] 💉 Injected tracker prompt at depth ${position} (length ${trackerYAML.length})`);
	} else if (trackerYAML === "") {
		log(`[Tracker Enhanced] 🧹 Cleared tracker prompt (depth ${position})`);
	}
}

/**
 * Clears all injected prompts.
 */
export async function clearInjects() {
	debug("Clearing injects");
	await setExtensionPrompt("inlineTrackerEnhancedPrompt", "", 1, 0, true, EXTENSION_PROMPT_ROLES.SYSTEM);
	await injectTracker("", 0);
}





//#endregion

//#region Message Generation Functions

/**
 * Prepares the message generation process based on the generation mode.
 * @param {string} type - The type of message generation (e.g., 'continue', 'swipe', 'regenerate').
 * @param {object} options - Additional options for message generation.
 * @param {boolean} dryRun - If true, the function will simulate the operation without side effects.
 */
export async function prepareMessageGeneration(type, options, dryRun) {
	if (!chat_metadata.tracker) chat_metadata.tracker = {};

	await handleStagedGeneration(type, options, dryRun);
}


/**
 * Handles staged message generation.
 * @param {string} type - The type of message generation.
 * @param {object} options - Additional options for message generation.
 * @param {boolean} dryRun - If true, the function will simulate the operation without side effects.
 */
async function handleStagedGeneration(type, options, dryRun) {
	const manageStopButton = $("#mes_stop").css("display") === "none";
	if (manageStopButton) deactivateSendButtons();

	await sendUserMessage(type, options, dryRun);

	chat_metadata.tracker.tempTrackerId = null;
	chat_metadata.tracker.tempTracker = null;
	chat_metadata.tracker.tempTrackerInternal = null;

	const mesId = getLastNonSystemMessageIndex();
	if (mesId === -1) {
		if (manageStopButton) activateSendButtons();
		return;
	}

	if (shouldShowPopup(mesId, type)) {
		const manualTracker = await showManualTrackerPopup(mesId);
		if (manualTracker) {
			chat[mesId].tracker = manualTracker;
			delete chat[mesId].trackerInternal;
			await saveChatConditional();
			TrackerPreviewManager.updatePreview(mesId);
		}
	}

	const lastMes = chat[mesId];

	let tracker;
	let position;

	if ([ACTION_TYPES.CONTINUE, ACTION_TYPES.SWIPE, ACTION_TYPES.REGENERATE].includes(type)) {
		const hasTracker = trackerExists(lastMes.tracker, extensionSettings.trackerDef);
		if (!hasTracker && shouldGenerateTracker(mesId, type)) {
			const previousMesId = getPreviousNonSystemMessageIndex(mesId);
			const generationResult = await generateTracker(previousMesId);
			if (generationResult) {
				lastMes.tracker = generationResult.tracker;
				if (generationResult.trackerInternal && Object.keys(generationResult.trackerInternal).length > 0) {
					lastMes.trackerInternal = generationResult.trackerInternal;
				} else {
					delete lastMes.trackerInternal;
				}
				if (type !== ACTION_TYPES.REGENERATE) {
					await saveChatConditional();
					TrackerPreviewManager.updatePreview(mesId);
				}
			}
		}

		if (type === ACTION_TYPES.REGENERATE && hasTracker) {
			chat_metadata.tracker.tempTrackerId = mesId;
			chat_metadata.tracker.tempTracker = lastMes.tracker;
			chat_metadata.tracker.tempTrackerInternal = lastMes.trackerInternal ?? null;
			await saveChatConditional();
			TrackerPreviewManager.updatePreview(mesId);
		}

		position = 0;
		tracker = lastMes.tracker;
	} else {
		if(chat_metadata.tracker.cmdTrackerOverride) {
			tracker = { ...chat_metadata.tracker.cmdTrackerOverride };
			chat_metadata.tracker.cmdTrackerOverride = null;
		} else if (shouldGenerateTracker(mesId + 1, type)) {
			debug("Generating new tracker for message:", mesId);
			const generationResult = await generateTracker(mesId);
			if (generationResult) {
				tracker = generationResult.tracker;
				if (!chat_metadata.tracker) chat_metadata.tracker = {};
				chat_metadata.tracker.tempTrackerInternal = generationResult.trackerInternal ?? null;
			}
		} else if (shouldShowPopup(mesId + 1, type)) {
			const manualTracker = await showManualTrackerPopup(mesId + 1);
			if (manualTracker) {
				tracker = manualTracker;
				if (!chat_metadata.tracker) chat_metadata.tracker = {};
				chat_metadata.tracker.tempTrackerInternal = null;
			}
		}

		if (tracker) {
			chat_metadata.tracker.tempTrackerId = mesId + 1;
			chat_metadata.tracker.tempTracker = tracker;
			await saveChatConditional();

			position = 0;
		}
	}

	if (!tracker) {
		const lastMesWithTrackerIndex = getLastMessageWithTracker(chat, mesId);

		if (lastMesWithTrackerIndex !== null) {
			const lastMesWithTracker = chat[lastMesWithTrackerIndex];

			tracker = getCleanTracker(lastMesWithTracker.tracker, extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, true, OUTPUT_FORMATS.JSON);
			position = lastMesReverseIndex;
		} else {
			tracker = "";
			position = 0;
		}
	}

	if (extensionSettings.trackerInjectionEnabled === false) {
		await injectTracker("", 0);
	} else {
		await injectTracker(tracker, position);
	}

	if (manageStopButton) activateSendButtons();
}

async function showManualTrackerPopup(mesId = null) {
	const lastMesWithTrackerIndex = getLastMessageWithTracker(mesId);
	const lastMesWithTracker = chat[lastMesWithTrackerIndex];

	let manualTracker;
	if (lastMesWithTracker) {
		manualTracker = getCleanTracker(lastMesWithTracker.tracker, extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, true, OUTPUT_FORMATS.JSON);
	} else {
		manualTracker = getDefaultTracker(extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, OUTPUT_FORMATS.JSON);
	}

	const trackerEditor = new TrackerEditorModal(mesId);
	const tracker = await trackerEditor.show(manualTracker);

	return tracker;
}

/**
 * Sends a user message based on the type and options provided.
 * @param {string} type - The type of message.
 * @param {object} options - Additional options.
 * @param {boolean} dryRun - If true, simulates the operation without side effects.
 */
async function sendUserMessage(type, options, dryRun) {
	if (![ACTION_TYPES.REGENERATE, ACTION_TYPES.SWIPE, ACTION_TYPES.QUIET, ACTION_TYPES.IMPERSONATE].includes(type) && !dryRun) {
		const textareaText = String($("#send_textarea").val());
		$("#send_textarea").val("").trigger("input");

		const { messageBias } = getBiasStrings(textareaText, type);

		const noAttachTypes = [ACTION_TYPES.REGENERATE, ACTION_TYPES.SWIPE, ACTION_TYPES.IMPERSONATE, ACTION_TYPES.QUIET, ACTION_TYPES.CONTINUE, ACTION_TYPES.ASK_COMMAND];

		if ((textareaText !== "" || (hasPendingFileAttachment() && !noAttachTypes.includes(type))) && !options.automatic_trigger) {
			if (messageBias && !removeMacros(textareaText)) {
				sendSystemMessage(SYSTEM_MESSAGE_TYPES.GENERIC, " ", {
					bias: messageBias,
				});
			} else {
				await sendMessageAsUser(textareaText, messageBias);
			}
		}
	}
}

/**
 * Adds a tracker to a message.
 * @param {number} mesId - The message ID.
 */
export async function addTrackerToMessage(mesId) {
	const manageStopButton = $("#mes_stop").css("display") === "none";
	if (manageStopButton) deactivateSendButtons();
	try {
		/**
		 * Saves the tracker to the message and updates the chat metadata.
		 * @param {number} mesId - The message ID.
		 * @param {object} tracker - The tracker object.
		 */
		const saveTrackerToMessage = async (mesId, tracker, trackerInternal = null) => {
			debug("Adding tracker to message:", { mesId, mes: chat[mesId], tracker, trackerInternal });
			chat[mesId].tracker = tracker;
			if (trackerInternal && Object.keys(trackerInternal).length > 0) {
				chat[mesId].trackerInternal = trackerInternal;
			} else {
				delete chat[mesId].trackerInternal;
			}
			if (typeof chat_metadata.tracker !== "undefined") {
				chat_metadata.tracker.tempTrackerId = null;
				chat_metadata.tracker.tempTracker = null;
				chat_metadata.tracker.cmdTrackerOverride = null;
				chat_metadata.tracker.tempTrackerInternal = null;
			}
			await saveChatConditional();
			TrackerPreviewManager.updatePreview(mesId);

			if (manageStopButton) activateSendButtons();
		};

		if (isSystemMessage(mesId)) {
			if (manageStopButton) activateSendButtons();
			return;
		}

		const tempId = chat_metadata?.tracker?.tempTrackerId ?? null;
		if (chat_metadata?.tracker?.cmdTrackerOverride) {
			await saveTrackerToMessage(mesId, chat_metadata.tracker.cmdTrackerOverride, null);
		} else if (tempId != null) {
			debug("Checking for temp tracker match", { mesId, tempId });
			const trackerMesId = isSystemMessage(tempId) ? getNextNonSystemMessageIndex(tempId) : tempId;
			const tracker = chat_metadata.tracker.tempTracker;
			const trackerInternal = chat_metadata.tracker.tempTrackerInternal ?? null;
			if (trackerMesId === mesId) {
				await saveTrackerToMessage(mesId, tracker, trackerInternal);
			}
		} else {
			const previousMesId = getPreviousNonSystemMessageIndex(mesId);
			if (previousMesId !== -1 && shouldGenerateTracker(mesId, undefined)) {
				debug("Generating for message with missing tracker:", mesId);
				const generationResult = await generateTracker(previousMesId);
				if (generationResult) {
					await saveTrackerToMessage(mesId, generationResult.tracker, generationResult.trackerInternal ?? null);
				}
			}
		}
	} catch (e) {
		if (manageStopButton) activateSendButtons();
	}
	if (manageStopButton) activateSendButtons();
}

//#endregion
