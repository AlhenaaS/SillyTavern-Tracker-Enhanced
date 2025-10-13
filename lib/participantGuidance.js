import { name1, characters, this_chid } from "../../../../../script.js";
import { groups, selected_group } from "../../../../../scripts/group-chats.js";
import { t } from "./i18n.js";
import { participantTargets } from "../src/settings/settings.js";

/**
 * Collects the active participant names based on the current SillyTavern state.
 * @returns {{ user: string|null, characters: string[] }} Structured participant names.
 */
export function collectParticipantNames() {
	const userName = typeof name1 === "string" ? name1.trim() : "";
	const characterNames = new Set();

	if (selected_group) {
		const group = groups.find((g) => g.id == selected_group);
		if (group && Array.isArray(group.members)) {
			const activeMembers = group.members.filter((memberId) => !group.disabled_members?.includes(memberId));
			for (const memberId of activeMembers) {
				const character = characters.find((c) => c.avatar == memberId);
				if (character?.name) {
					characterNames.add(character.name.trim());
				}
			}
		}
	} else if (this_chid !== undefined && this_chid !== null) {
		const character = characters[this_chid];
		if (character?.name) {
			characterNames.add(character.name.trim());
		}
	}

	return {
		user: userName || null,
		characters: Array.from(characterNames).filter(Boolean),
	};
}

/**
 * Builds localized participant guidance and a seed list based on the participant focus.
 * @param {string} target - Participant focus from settings.
 * @param {{ user?: string|null, characters?: string[] }} [names] - Participant names context.
 * @param {string} [locale="en"] - Current locale identifier.
 * @param {string|null} [templateOverride=null] - Custom guidance template provided by the user.
 * @returns {{ guidance: string, participants: string[] }} Guidance text and participant seed list.
 */
export function buildParticipantGuidance(target, names = collectParticipantNames(), locale = "en", templateOverride = null) {
	const normalizedLocale = typeof locale === "string" && locale.trim() ? locale.trim().toLowerCase() : "en";
	const participants = new Set();

	const userName = typeof names?.user === "string" ? names.user.trim() : "";
	const characterList = Array.isArray(names?.characters) ? names.characters.map((name) => (typeof name === "string" ? name.trim() : "")).filter(Boolean) : [];

	if (target === participantTargets.USER || target === participantTargets.BOTH) {
		if (userName) {
			participants.add(userName);
		}
	}

	if (target === participantTargets.CHARACTER || target === participantTargets.BOTH) {
		for (const charName of characterList) {
			if (charName) participants.add(charName);
		}
	}

	if (participants.size === 0 || target === participantTargets.NONE) {
		return { guidance: "", participants: [] };
	}

	const participantArray = Array.from(participants);
	const formattedList = formatParticipantList(participantArray, normalizedLocale);
	const templateSource = typeof templateOverride === "string" && templateOverride.trim()
		? templateOverride
		: t(
			"prompts.participant_guidance.template",
			"### Participant Policy\nAlways include the following participants in CharactersPresent and Characters: {{participants}}.\nNever remove these participants; infer their state even if they are temporarily off-screen."
		);
	const normalizedTemplate = typeof templateSource === "string" ? templateSource.replace(/\r\n/g, "\n") : "";
	if (!normalizedTemplate.trim()) {
		return { guidance: "", participants: participantArray };
	}

	let guidance = normalizedTemplate;
	if (guidance.includes("{{participants}}")) {
		guidance = guidance.replace(/{{participants}}/g, formattedList);
	} else if (formattedList) {
		guidance = `${guidance}\n${formattedList}`;
	}

	guidance = guidance
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();

	return {
		guidance,
		participants: participantArray,
	};
}

/**
 * Formats a human-readable participant list based on locale conventions.
 * @param {string[]} participants - Names to format.
 * @param {string} locale - Locale identifier.
 * @returns {string} Formatted participant list.
 */
function formatParticipantList(participants, locale) {
	if (!Array.isArray(participants) || participants.length === 0) {
		return "";
	}

	const sanitized = participants.filter((name) => typeof name === "string" && name.trim()).map((name) => name.trim());
	if (sanitized.length === 0) {
		return "";
	}

	const lowerLocale = locale.toLowerCase();
	const delimiter = lowerLocale.startsWith("zh") ? "、" : ", ";

	if (!lowerLocale.startsWith("zh") && sanitized.length === 2) {
		return `${sanitized[0]} and ${sanitized[1]}`;
	}

	return sanitized.join(delimiter);
}
