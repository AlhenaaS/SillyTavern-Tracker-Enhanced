import { generateRaw, chat, characters, this_chid, getCharacterCardFields, name1 } from "../../../../../script.js";
import { getContext } from '../../../../../../scripts/extensions.js';

import { groups, selected_group } from "../../../../../scripts/group-chats.js";
import { log, warn, debug, error, unescapeJsonString, getLastMessageWithTracker } from "../lib/utils.js";
import { yamlToJSON } from "../lib/ymlParser.js";
import { extensionSettings } from "../index.js";
import { generationModes } from "./settings/settings.js";
import { FIELD_INCLUDE_OPTIONS, getDefaultTracker, getExampleTrackers as getExampleTrackersFromDef, getTracker, getTrackerPrompt, OUTPUT_FORMATS, updateTracker } from "./trackerDataHandler.js";
import { trackerFormat } from "./settings/defaultSettings.js";

// #region Utility Functions

/**
 * Gets the profile ID for a given profile name.
 * @param {string} profileName - The profile name.
 * @returns {string|null} The profile ID or null if not found.
 */
function getProfileIdByName(profileName) {
	const ctx = getContext();
	const connectionManager = ctx.extensionSettings.connectionManager;
	
	if (profileName === "current") {
		return connectionManager.selectedProfile;
	}
	
	const profile = connectionManager.profiles.find(p => p.name === profileName);
	return profile ? profile.id : null;
}

/**
 * Replaces `{{key}}` placeholders in a template string with provided values.
 * @param {string} template - The template string containing placeholders.
 * @param {Object} vars - An object of key-value pairs to replace in the template.
 * @returns {string} The processed template with all placeholders replaced.
 */
function formatTemplate(template, vars) {
	let result = template;
	for (const [key, value] of Object.entries(vars)) {
		const regex = new RegExp(`{{${key}}}`, "g");
		result = result.replace(regex, value != null ? value : "");
	}
	return result;
}

/**
 * Handles conditional sections like `{{#if tracker}}...{{/if}}`.
 * If condition is true, keeps the content inside. Otherwise, removes it.
 * @param {string} template - The template with conditional blocks.
 * @param {string} sectionName - The name used after `#if`.
 * @param {boolean} condition - Whether to keep the content.
 * @param {string} content - The content to insert if condition is true.
 * @returns {string} The processed template.
 */
function conditionalSection(template, sectionName, condition, content) {
	const sectionRegex = new RegExp(`{{#if ${sectionName}}}([\\s\\S]*?){{\\/if}}`, "g");
	if (condition) {
		return template.replace(sectionRegex, content);
	} else {
		return template.replace(sectionRegex, "");
	}
}

// #endregion

/**
 * Sends a generation request using an independent connection profile.
 * @param {string} prompt - The prompt to send.
 * @param {number|null} maxTokens - Maximum tokens to generate.
 * @returns {Promise<string>} The generated response.
 */
async function sendIndependentGenerationRequest(prompt, maxTokens = null) {
	try {
		log(`[Tracker Enhanced] 🚀 sendIndependentGenerationRequest called`);
		
		const ctx = getContext();
		const profileId = getProfileIdByName(extensionSettings.selectedProfile);
		
		log(`[Tracker Enhanced] Selected profile: ${extensionSettings.selectedProfile}`);
		log(`[Tracker Enhanced] Profile ID: ${profileId}`);
		
		if (!profileId) {
			error(`[Tracker Enhanced] ❌ Profile not found: ${extensionSettings.selectedProfile}`);
			throw new Error(`Profile not found: ${extensionSettings.selectedProfile}`);
		}
		
		// Always use independent connection - even for "current" profile
		log(`[Tracker Enhanced] 🔒 Using INDEPENDENT connection with profile: ${extensionSettings.selectedProfile} (ID: ${profileId})`);
		log(`[Tracker Enhanced] This request will NOT interfere with SillyTavern's main connection`);
		
		// Check if ConnectionManagerRequestService is available
		if (!ctx.ConnectionManagerRequestService) {
			error(`[Tracker Enhanced] ❌ ConnectionManagerRequestService not available in context`);
			error(`[Tracker Enhanced] Available context methods:`, Object.keys(ctx).filter(k => k.includes('Connection') || k.includes('generate')));
			throw new Error('ConnectionManagerRequestService not available');
		}
		
		log(`[Tracker Enhanced] ✅ ConnectionManagerRequestService is available`);
		log(`[Tracker Enhanced] 📤 About to call ctx.ConnectionManagerRequestService.sendRequest`);
		log(`[Tracker Enhanced] Parameters:`, { 
			profileId, 
			promptLength: prompt?.length || 0, 
			maxTokens,
			selectedCompletionPreset: extensionSettings.selectedCompletionPreset
		});
		
		// Use ConnectionManagerRequestService from context
		const response = await ctx.ConnectionManagerRequestService.sendRequest(
			profileId,
			[{ role: 'user', content: prompt }],
			maxTokens || 1000,
			{
				extractData: true,
				includePreset: extensionSettings.selectedCompletionPreset !== "current",
			}
		);
		
		log(`[Tracker Enhanced] 📥 Raw response from ConnectionManagerRequestService:`, response);
		log(`[Tracker Enhanced] ✅ Independent connection request successful. Response length: ${response?.content?.length || 0} characters`);
		
		if (!response || !response.content) {
			error(`[Tracker Enhanced] ❌ Invalid response from ConnectionManagerRequestService:`, response);
			throw new Error('Invalid response from ConnectionManagerRequestService');
		}
		
		return response.content;
		
	} catch (err) {
		error(`[Tracker Enhanced] ❌ Failed to send independent generation request:`, err);
		error(`[Tracker Enhanced] ❌ Error details:`, err.message);
		error(`[Tracker Enhanced] ❌ Stack trace:`, err.stack);
		
		// Re-throw to be handled by calling function
		throw err;
	}
}

/**
 * Generates a new tracker for a given message number.
 * @param {number} mesNum - The message number.
 * @param {string} includedFields - Which fields to include in the tracker.
 * @returns {object|null} The new tracker object or null if failed.
 */
export async function generateTracker(mesNum, includedFields = FIELD_INCLUDE_OPTIONS.DYNAMIC) {
	if (mesNum == null || mesNum < 0 || chat[mesNum].extra?.isSmallSys) return null;

	log(`[Tracker Enhanced] 🚀 Starting tracker generation for message ${mesNum} using INDEPENDENT connection`);
	debug(`[Tracker Enhanced] Selected profile: ${extensionSettings.selectedProfile}, Selected preset: ${extensionSettings.selectedCompletionPreset}`);

	try {
		let tracker;

		if (extensionSettings.generationMode == generationModes.TWO_STAGE) {
			log(`[Tracker Enhanced] Using TWO-STAGE generation mode with independent connection`);
			tracker = await generateTwoStageTracker(mesNum, includedFields);
		} else {
			log(`[Tracker Enhanced] Using SINGLE-STAGE generation mode with independent connection`);
			tracker = await generateSingleStageTracker(mesNum, includedFields);
		}

		if (!tracker) return null;

		const lastMesWithTrackerIndex = getLastMessageWithTracker(mesNum);
		const lastMesWithTracker = chat[lastMesWithTrackerIndex];
		let lastTracker = lastMesWithTracker ? lastMesWithTracker.tracker : getDefaultTracker(extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, OUTPUT_FORMATS.JSON);
		const result = updateTracker(lastTracker, tracker, extensionSettings.trackerDef, FIELD_INCLUDE_OPTIONS.ALL, OUTPUT_FORMATS.JSON, true);
		
		log(`[Tracker Enhanced] ✅ Tracker generation completed successfully using independent connection`);
		return result;
	} catch (e) {
		error(`[Tracker Enhanced] ❌ Failed to generate tracker using independent connection:`, e);
		toastr.error("Failed to generate tracker. Make sure your selected connection profile and completion preset are valid and working");
		return null;
	}
}

/**
 * Handles the single-stage generation mode.
 * @param {number} mesNum
 * @param {string} includedFields
 * @param {string|null} requestPrompt - If provided, use this request prompt directly.
 */
async function generateSingleStageTracker(mesNum, includedFields, firstStageMessage = null) {
	// Build system and request prompts
	const systemPrompt = getGenerateSystemPrompt(mesNum, includedFields, firstStageMessage);
	const requestPrompt = getRequestPrompt(extensionSettings.generateRequestPrompt, mesNum, includedFields, firstStageMessage);

	let responseLength = extensionSettings.responseLength > 0 ? extensionSettings.responseLength : null;

	// Generate tracker using the AI model
	log("Generating tracker with prompts:", { systemPrompt, requestPrompt, responseLength, mesNum });
	log(`[Tracker Enhanced] 🎯 SINGLE-STAGE: About to call sendGenerateTrackerRequest`);
	const tracker = await sendGenerateTrackerRequest(systemPrompt, requestPrompt, responseLength);
	log(`[Tracker Enhanced] 🎯 SINGLE-STAGE: sendGenerateTrackerRequest returned:`, tracker);

	return tracker;
}

/**
 * Handles the two-stage generation mode.
 * First: summarize changes (message summarization).
 * Second: generate tracker using the summary (firstStageMessage).
 * @param {number} mesNum
 * @param {string} includedFields
 */
async function generateTwoStageTracker(mesNum, includedFields) {
	// Build system and request prompts for message summarization
	const systemPrompt = getMessageSummarizationSystemPrompt(mesNum, includedFields);
	const requestPrompt = getRequestPrompt(extensionSettings.messageSummarizationRequestPrompt, mesNum, includedFields);

	let responseLength = extensionSettings.responseLength > 0 ? extensionSettings.responseLength : null;

	// Run the summarization stage to get the firstStageMessage
	log(`[Tracker Enhanced] 📝 Stage 1/2: Message summarization using independent connection`);
	const message = await sendIndependentGenerationRequest(systemPrompt + '\n\n' + requestPrompt, responseLength);
	debug("Message Summarized:", { message });

	// Generate tracker using the AI model in single-stage manner but with the first stage message
	log(`[Tracker Enhanced] 🎯 Stage 2/2: Tracker generation using independent connection`);
	const tracker = await generateSingleStageTracker(mesNum, includedFields, message);

	return tracker;
}

/**
 * Sends the generation request to the AI model and parses the tracker response.
 * @param {string} systemPrompt
 * @param {string} requestPrompt
 * @param {number|null} responseLength
 */
async function sendGenerateTrackerRequest(systemPrompt, requestPrompt, responseLength) {
	log(`[Tracker Enhanced] 📤 Sending tracker generation request via independent connection`);
	log(`[Tracker Enhanced] 🔧 About to call sendIndependentGenerationRequest...`);
	
	try {
		let tracker = await sendIndependentGenerationRequest(systemPrompt + '\n\n' + requestPrompt, responseLength);
		log("Generated tracker:", { tracker });

		let newTracker;
		try {
			if(extensionSettings.trackerFormat == trackerFormat.JSON) tracker = unescapeJsonString(tracker);
			const trackerContent = tracker.match(/<(?:tracker|Tracker)>([\s\S]*?)<\/(?:tracker|Tracker)>/);
			let result = trackerContent ? trackerContent[1].trim() : null;
			if(extensionSettings.trackerFormat == trackerFormat.YAML) result = yamlToJSON(result);
			newTracker = JSON.parse(result);
			log(`[Tracker Enhanced] ✅ Successfully parsed tracker response from independent connection`);
		} catch (e) {
			error(`[Tracker Enhanced] ❌ Failed to parse tracker from independent connection:`, tracker, e);
			toastr.error("Failed to parse the generated tracker. Make sure your token count is not low or set the response length override.");
			return null;
		}

		log("Parsed tracker:", { newTracker });
		return newTracker;
		
	} catch (err) {
		error(`[Tracker Enhanced] ❌ sendIndependentGenerationRequest failed, falling back to old method:`, err);
		
		// Fallback to the old generateRaw method if independent connection fails
		log(`[Tracker Enhanced] 🔄 Using fallback: generateRaw`);
		let tracker = await generateRaw(systemPrompt + '\n\n' + requestPrompt, null, false, false, '', responseLength);
		log("Generated tracker (fallback):", { tracker });

		let newTracker;
		try {
			if(extensionSettings.trackerFormat == trackerFormat.JSON) tracker = unescapeJsonString(tracker);
			const trackerContent = tracker.match(/<(?:tracker|Tracker)>([\s\S]*?)<\/(?:tracker|Tracker)>/);
			let result = trackerContent ? trackerContent[1].trim() : null;
			if(extensionSettings.trackerFormat == trackerFormat.YAML) result = yamlToJSON(result);
			newTracker = JSON.parse(result);
			log(`[Tracker Enhanced] ✅ Successfully parsed tracker response from fallback method`);
		} catch (e) {
			error(`[Tracker Enhanced] ❌ Failed to parse tracker from fallback method:`, tracker, e);
			toastr.error("Failed to parse the generated tracker. Make sure your token count is not low or set the response length override.");
			return null;
		}

		log("Parsed tracker (fallback):", { newTracker });
		return newTracker;
	}
}

// #region Tracker Prompt Functions

/**
 * Constructs the generate tracker system prompt for the AI model based on the current mode. {{trackerSystemPrompt}}, {{characterDescriptions}}, {{trackerExamples}}, {{recentMessages}}, {{currentTracker}}, {{trackerFormat}}, {{trackerFieldPrompt}}, {{firstStageMessage}}
 * Uses `extensionSettings.generateContextTemplate` and `extensionSettings.generateSystemPrompt`.
 * @param {number} mesNum
 * @param {string} includedFields
 * @returns {string} The system prompt.
 */
function getGenerateSystemPrompt(mesNum, includedFields = FIELD_INCLUDE_OPTIONS.DYNAMIC, firstStageMessage = null) {
	const trackerSystemPrompt = getSystemPrompt(extensionSettings.generateSystemPrompt, includedFields);
	const characterDescriptions = getCharacterDescriptions();
	const trackerExamples = getExampleTrackers(includedFields);
	const recentMessages = getRecentMessages(extensionSettings.generateRecentMessagesTemplate, mesNum, includedFields);
	const currentTracker = getCurrentTracker(mesNum, includedFields);
	const trackerFormat = extensionSettings.trackerFormat;
	const trackerFieldPrompt = getTrackerPrompt(extensionSettings.trackerDef, includedFields);

	const vars = {
		trackerSystemPrompt,
		characterDescriptions,
		trackerExamples,
		recentMessages,
		currentTracker,
		trackerFormat,
		trackerFieldPrompt,
		firstStageMessage: firstStageMessage || "", // Only in two-stage mode
	};

	debug("Generated Tacker Generation System Prompt:", vars);
	return formatTemplate(extensionSettings.generateContextTemplate, vars);
}

/**
 * Constructs the message summarization system prompt for the AI model in two-stage mode. {{trackerSystemPrompt}}, {{characterDescriptions}}, {{trackerExamples}}, {{recentMessages}}, {{currentTracker}}, {{trackerFormat}}, {{trackerFieldPrompt}}, {{messageSummarizationSystemPrompt}}
 * Uses `extensionSettings.messageSummarizationContextTemplate` and `extensionSettings.messageSummarizationSystemPrompt`.
 * @param {number} mesNum
 * @param {string} includedFields
 * @returns {string} The system prompt.
 */
function getMessageSummarizationSystemPrompt(mesNum, includedFields) {
	const trackerSystemPrompt = getSystemPrompt(extensionSettings.messageSummarizationSystemPrompt, includedFields);
	const messageSummarizationSystemPrompt = getSystemPrompt(extensionSettings.messageSummarizationSystemPrompt, includedFields);
	const characterDescriptions = getCharacterDescriptions();
	const trackerExamples = getExampleTrackers(includedFields);
	const recentMessages = extensionSettings.messageSummarizationRecentMessagesTemplate ? getRecentMessages(extensionSettings.messageSummarizationRecentMessagesTemplate, mesNum, includedFields) || "" : "";
	const currentTracker = getCurrentTracker(mesNum, includedFields);
	const trackerFormat = extensionSettings.trackerFormat;
	const trackerFieldPrompt = getTrackerPrompt(extensionSettings.trackerDef, includedFields);

	const vars = {
		trackerSystemPrompt,
		messageSummarizationSystemPrompt,
		characterDescriptions,
		trackerExamples,
		recentMessages,
		currentTracker,
		trackerFormat,
		trackerFieldPrompt,
	};

	debug("Generated Message Summarization System Prompt (Summarization):", vars);
	return formatTemplate(extensionSettings.messageSummarizationContextTemplate, vars);
}

/**
 * Retrieves the system prompt. {{charNames}}, {{defaultTracker}}, {{trackerFormat}}
 * @param {string} template
 * @param {string} includedFields
 * @returns {string} The system prompt.
 */
function getSystemPrompt(template, includedFields) {
	let charNames = [name1];

	// Add group members if in a group
	if (selected_group) {
		const group = groups.find((g) => g.id == selected_group);
		const active = group.members.filter((m) => !group.disabled_members.includes(m));
		active.forEach((m) => {
			const char = characters.find((c) => c.avatar == m);
			charNames.push(char.name);
		});
	} else if (this_chid) {
		const char = characters[this_chid];
		charNames.push(char.name);
	}

	// Join character names
	let namesJoined;
	if (charNames.length === 1) namesJoined = charNames[0];
	else if (charNames.length === 2) namesJoined = charNames.join(" and ");
	else namesJoined = charNames.slice(0, -1).join(", ") + ", and " + charNames.slice(-1);

	let defaultTrackerVal = getDefaultTracker(extensionSettings.trackerDef, includedFields, OUTPUT_FORMATS[extensionSettings.trackerFormat]);
	if (extensionSettings.trackerFormat == trackerFormat.JSON) {
		defaultTrackerVal = JSON.stringify(defaultTrackerVal, null, 2);
	}

	const vars = {
		charNames: namesJoined,
		defaultTracker: defaultTrackerVal,
		trackerFormat: extensionSettings.trackerFormat,
	};

	return formatTemplate(template, vars);
}

/**
 * Retrieves character descriptions. {{char}}, {{charDescription}}
 */
function getCharacterDescriptions() {
	const characterDescriptions = [];

	// Get main character's persona
	let { persona } = getCharacterCardFields();
	if (persona) {
		characterDescriptions.push({ name: name1, description: persona });
	}

	// Get group members' descriptions if in a group
	if (selected_group) {
		const group = groups.find((g) => g.id == selected_group);
		const active = group.members.filter((m) => !group.disabled_members.includes(m));
		active.forEach((m) => {
			const char = characters.find((c) => c.avatar == m);
			characterDescriptions.push({ name: char.name, description: char.description });
		});
	} else if (this_chid) {
		const char = characters[this_chid];
		characterDescriptions.push({ name: char.name, description: char.description });
	}

	let charDescriptionString = "";
	const template = extensionSettings.characterDescriptionTemplate;
	characterDescriptions.forEach((char) => {
		charDescriptionString +=
			formatTemplate(template, {
				char: char.name,
				charDescription: char.description,
			}) + "\n\n";
	});

	return charDescriptionString.trim();
}

/**
 * Retrieves recent messages up to a certain number and formats them. {{char}}, {{message}}, {{tracker}}, {{#if tracker}}...{{/if}}
 */
function getRecentMessages(template, mesNum, includedFields) {
	const messages = chat.filter((c, index) => !c.is_system && index <= mesNum).slice(-extensionSettings.numberOfMessages);
	if (messages.length === 0) return null;

	return messages
		.map((c) => {
			const name = c.name;
			const message = c.mes.replace(/<tracker>[\s\S]*?<\/tracker>/g, "").trim();

			let hasTracker = c.tracker && Object.keys(c.tracker).length !== 0;
			let trackerContent = "";
			if (hasTracker) {
				try {
					trackerContent = getTracker(c.tracker, extensionSettings.trackerDef, includedFields, false, OUTPUT_FORMATS[extensionSettings.trackerFormat]);
					if (extensionSettings.trackerFormat == trackerFormat.JSON) {
						trackerContent = JSON.stringify(trackerContent, null, 2);
					}
				} catch (e) {
					warn(e);
				}
			}

			let replaced = formatTemplate(template, { char: name, message });
			replaced = conditionalSection(replaced, "tracker", hasTracker && !!trackerContent, trackerContent);
			return replaced;
		})
		.join("\n");
}

/**
 * Retrieves the current tracker.
 */
function getCurrentTracker(mesNum, includedFields) {
	debug("Getting current tracker for message:", { mesNum });
	const message = chat[mesNum];
	const tracker = message.tracker;
	let returnTracker;
	if (tracker && Object.keys(tracker).length !== 0) {
		returnTracker = getTracker(tracker, extensionSettings.trackerDef, includedFields, false, OUTPUT_FORMATS[extensionSettings.trackerFormat]);
	} else {
		const lastMesWithTrackerIndex = getLastMessageWithTracker(mesNum);
		const lastMesWithTracker = chat[lastMesWithTrackerIndex];
		if (lastMesWithTracker) returnTracker = getTracker(lastMesWithTracker.tracker, extensionSettings.trackerDef, includedFields, false, OUTPUT_FORMATS[extensionSettings.trackerFormat]);
		else returnTracker = getDefaultTracker(extensionSettings.trackerDef, includedFields, OUTPUT_FORMATS[extensionSettings.trackerFormat]);
	}

	if (extensionSettings.trackerFormat == trackerFormat.JSON) {
		returnTracker = JSON.stringify(returnTracker, null, 2);
	}

	return returnTracker;
}

/**
 * Retrieves the example trackers.
 */
function getExampleTrackers(includedFields) {
	debug("Getting example trackers");
	let trackerExamples = getExampleTrackersFromDef(extensionSettings.trackerDef, includedFields, OUTPUT_FORMATS[extensionSettings.trackerFormat]);
	if (extensionSettings.trackerFormat == trackerFormat.JSON) {
		trackerExamples = trackerExamples.map((ex) => JSON.stringify(ex, null, 2));
	}
	trackerExamples = "<START>\n<tracker>\n" + trackerExamples.join("\n</tracker>\n<END>\n<START>\n<tracker>\n") + "\n</tracker>\n<END>";

	return trackerExamples;
}

/**
 * Retrieves the request prompt. {{trackerFieldPrompt}}, {{trackerFormat}}, {{message}}, {{firstStageMessage}}
 * @param {string} template - The request prompt template from extensionSettings.
 * @param {number|null} mesNum - The message number.
 * @param {string} includedFields
 * @param {string|null} firstStage - The first stage message (changes list) if in two-stage mode.
 */
export function getRequestPrompt(template, mesNum = null, includedFields, firstStage = null) {
	let messageText = "";
	if (mesNum != null) {
		const message = chat[mesNum];
		messageText = message.mes;
	}

	const trackerFieldPromptVal = getTrackerPrompt(extensionSettings.trackerDef, includedFields);
	const vars = {
		message: messageText,
		trackerFieldPrompt: trackerFieldPromptVal,
		trackerFormat: extensionSettings.trackerFormat,
	};

	// If two-stage mode and firstStage is provided and the template includes {{firstStageMessage}}, add it
	if (extensionSettings.generationMode === generationModes.TWO_STAGE && firstStage && template.includes("{{firstStageMessage}}")) {
		vars.firstStageMessage = firstStage;
	}

	return formatTemplate(template, vars);
}

// #endregion
