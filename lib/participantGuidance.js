import { name1, characters, this_chid } from "../../../../../script.js";
import { groups, selected_group } from "../../../../../scripts/group-chats.js";
import { t } from "./i18n.js";
import { generationTargets } from "../src/settings/settings.js";

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
 * Builds localized participant guidance and a seed list based on the generation target.
 * @param {string} target - Generation target from settings.
 * @param {{ user?: string|null, characters?: string[] }} [names] - Participant names context.
 * @param {string} [locale="en"] - Current locale identifier.
 * @returns {{ guidance: string, participants: string[] }} Guidance text and participant seed list.
 */
export function buildParticipantGuidance(target, names = collectParticipantNames(), locale = "en") {
	const normalizedLocale = typeof locale === "string" && locale.trim() ? locale.trim().toLowerCase() : "en";
	const participants = new Set();

	const userName = typeof names?.user === "string" ? names.user.trim() : "";
	const characterList = Array.isArray(names?.characters) ? names.characters.map((name) => (typeof name === "string" ? name.trim() : "")).filter(Boolean) : [];

	if (target === generationTargets.USER || target === generationTargets.BOTH) {
		if (userName) {
			participants.add(userName);
		}
	}

	if (target === generationTargets.CHARACTER || target === generationTargets.BOTH) {
		for (const charName of characterList) {
			if (charName) participants.add(charName);
		}
	}

	if (participants.size === 0 || target === generationTargets.NONE) {
		return { guidance: "", participants: [] };
	}

	const participantArray = Array.from(participants);
	const header = t("prompts.participant_guidance.header", "### Participant Policy").trim();
	const bodyTemplate = t(
		"prompts.participant_guidance.body",
		"Always include the following participants in CharactersPresent and Characters: {{participants}}."
	);
	const fieldsLine = t(
		"prompts.participant_guidance.fields",
		"Never remove these participants; infer their state if they are temporarily off-screen."
	).trim();

	const formattedList = formatParticipantList(participantArray, normalizedLocale);
	const body = formatBodyLine(bodyTemplate, formattedList);

	const segments = [header, body];
	if (fieldsLine) {
		segments.push(fieldsLine);
	}

	return {
		guidance: segments.filter(Boolean).join("\n"),
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

/**
 * Injects the participant list into the localized body template.
 * @param {string} template - Body template that may include the `{{participants}}` token.
 * @param {string} participantList - Formatted participant list.
 * @returns {string} Finalized body line.
 */
function formatBodyLine(template, participantList) {
	const trimmedTemplate = typeof template === "string" ? template.trim() : "";
	if (!trimmedTemplate) {
		return participantList;
	}

	if (trimmedTemplate.includes("{{participants}}")) {
		return trimmedTemplate.replace(/{{participants}}/g, participantList);
	}

	return `${trimmedTemplate} ${participantList}`.trim();
}
