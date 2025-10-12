import { t } from "../../lib/i18n.js";
export const DEFAULT_PRESET_NAME = "Default Built-In (EN)";
export const TRACKER_METADATA_VERSION = 3;
const PREFIX_DATA_DEFINITIONS = [
	{
		name: "TimeAnchor",
		definition: {
			name: "TimeAnchor",
			type: "STRING",
			presence: "DYNAMIC",
			prompt: "Record the precise ISO-8601 timestamp anchoring this scene. Choose a datetime that reflects the story's own chronology (e.g., 2024-06-15T14:30:00Z), not a template placeholder.",
			defaultValue: "<Scene ISO-8601 timestamp>",
			exampleValues: [
				"\"2024-06-15T14:30:00Z\"",
				"\"1348-05-12T07:30:00Z\"",
				"\"2325-07-22T18:05:00+02:00\""
			],
			nestedFields: {},
			metadata: {
				internal: true,
				external: false,
				internalKeyId: "timeAnchor",
				internalOnly: true,
			},
		},
	},
];
const INTERNAL_DATA_DEFINITIONS = [
	{
		name: "StoryEvents",
		definition: {
			name: "StoryEvents",
			type: "OBJECT",
			presence: "DYNAMIC",
			prompt: "Lifecycle event log used to coordinate internal tracker automations.",
			defaultValue: "<Story events if present>",
			exampleValues: [
				"{}",
				"{\"BirthEvents\": {\"Mira\": {\"NewBornDescription\": \"Mira, the newborn of Harry and Monika, female — she sleeps in short bursts and can only communicate through soft cries.\"}}, \"GrowthEvents\": {\"Molly Thompson\": {\"GrowthDescription\": \"Molly Thompson has grown into an energetic teenager with her father Jack's athletic build and her mother Rose's quick wit.\"}}, \"DeathEvents\": {\"Sir Alden\": {\"DeathCauseDescription\": \"Sir Alden fell defending the northern gate, struck down by the dragon's final burst of flame.\"}}}"
			],
			nestedFields: {
				"internal-story-birth-events": {
					name: "BirthEvents",
					type: "FOR_EACH_OBJECT",
					presence: "DYNAMIC",
					genderSpecific: "all",
					prompt: "Count only completed births — the baby must be fully delivered and present. Ignore labor, contractions, or partial delivery. Use \"Unnamed baby of <mother name>\" for unnamed babies. For each newborn, update the details:",
					defaultValue: "<Baby Name>",
					exampleValues: [
						"[\"None\"]",
						"[\"Liam Johnson\", \"Emily Clark\"]",
						"[\"Unnamed baby of Alice\"]"
					],
					nestedFields: {
						"internal-story-birth-description": {
							name: "NewBornDescription",
							type: "STRING",
							presence: "DYNAMIC",
							genderSpecific: "all",
							prompt: "Describe the newborn, including name, gender, parents, appearance, notable traits, and their immediate newborn behaviours (e.g., crying, sleeping patterns, inability to speak or walk).",
							defaultValue: "<description of the newborn baby>",
							exampleValues: [
								"Mira, the newborn of Harry and Monika, female — she sleeps in short bursts, cries softly when hungry, and cannot yet focus her bright blue eyes on anything distant.",
								"Molly, the newborn of Jack and Rose, female — she clenches her tiny fists, reacts to her parents' voices, and only communicates with soft whimpers.",
								"Arwen, the newborn of Elrond and Celebrían, female — she has luminous eyes, slightly pointed ears, and can only express herself through gentle coos."
							],
							metadata: {
								internal: true,
								external: false,
								internalKeyId: "newBornDescription",
								internalOnly: true,
							},
						},
					},
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "birthEvents",
						internalOnly: true,
					},
				},
				"internal-story-growth-events": {
					name: "GrowthEvents",
					type: "FOR_EACH_OBJECT",
					presence: "DYNAMIC",
					genderSpecific: "all",
					prompt: "Track major growth milestones for existing characters. For each update, provide a complete, card-ready description that reflects current age, physical changes, behavioural shifts, skills, relationships, and notable story developments.",
					defaultValue: "<Character Name>",
					exampleValues: [
						"[\"Mira Thompson\"]",
						"[\"Molly Johnson\"]",
						"[\"Arwen Half-elven\"]"
					],
					nestedFields: {
						"internal-story-growth-description": {
							name: "GrowthDescription",
							type: "STRING",
							presence: "DYNAMIC",
							genderSpecific: "all",
							prompt: "Provide a full character description reflecting the current stage of life: appearance, age, personality, behaviour, skills, relationships, and any recent narrative developments.",
							defaultValue: "<updated character description>",
							exampleValues: [
								"Mira Thompson, now five years old, has inquisitive blue eyes, a restless mind, and a fearless curiosity. She chatters endlessly about the world she discovers each day and already mimics her mother Monika's analytical instincts.",
								"Molly Johnson has grown into an energetic teenager with her father Jack's athletic build and her mother Rose's quick wit. She balances school with competitive swimming, and her confidence is tempered by a fierce loyalty to her family.",
								"Arwen Half-elven now stands as a poised young adult, carrying the wisdom of her father Elrond and the grace of her mother Celebrían. Her luminous eyes reflect centuries of elven memory, and she moves through Rivendell as a calming presence and diplomat."
							],
							metadata: {
								internal: true,
								external: false,
								internalKeyId: "growthDescription",
								internalOnly: true,
							},
						},
					},
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "growthEvents",
						internalOnly: true,
					},
				},
				"internal-story-death-events": {
					name: "DeathEvents",
					type: "FOR_EACH_OBJECT",
					presence: "DYNAMIC",
					genderSpecific: "all",
					prompt: "Track characters whose stories have ended. For each death, provide the character name and a concise description of how and why they died, along with any immediate narrative consequences.",
					defaultValue: "<Character Name>",
					exampleValues: [
						"[\"Sir Alden\"]",
						"[\"Mira Thompson\"]",
						"[\"Unnamed soldier\"]"
					],
					nestedFields: {
						"internal-story-death-description": {
							name: "DeathCauseDescription",
							type: "STRING",
							presence: "DYNAMIC",
							genderSpecific: "all",
							prompt: "Summarize the cause of death and any immediate aftermath or impact on the narrative.",
							defaultValue: "<cause of death description>",
							exampleValues: [
								"Sir Alden fell defending the northern gate, struck down by the dragon's final burst of flame.",
								"Mira Thompson passed peacefully at the age of 84, surrounded by family after a lifetime of pioneering research.",
								"The unnamed soldier perished during the midnight ambush, triggering the retreat of the remaining scouts."
							],
							metadata: {
								internal: true,
								external: false,
								internalKeyId: "deathCauseDescription",
								internalOnly: true,
							},
						},
					},
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "deathEvents",
						internalOnly: true,
					},
				},
			},
			metadata: {
				internal: true,
				external: false,
				internalKeyId: "storyEvents",
				internalOnly: true,
			},
		},
	},
	{
		name: "TimeAnalysis",
		definition: {
			name: "TimeAnalysis",
			type: "OBJECT",
			presence: "STATIC",
			prompt: "Auto-generated timing diagnostics derived from TimeAnchor. Used for internal engines and auditing.",
			defaultValue: "{}",
			exampleValues: [
				"{\"AnchorRaw\": \"2024-06-15T14:30:00Z\", \"IsoTimestamp\": \"2024-06-15T14:30:00.000Z\", \"ElapsedSeconds\": \"120\", \"ElapsedDays\": \"0.00139\"}"
			],
			nestedFields: {
				"internal-timeanalysis-anchor": {
					name: "AnchorRaw",
					type: "STRING",
					presence: "STATIC",
					prompt: "The raw TimeAnchor value before parsing.",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"2024-06-15T14:30:00Z\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisAnchorRaw",
						internalOnly: true,
					},
				},
				"internal-timeanalysis-iso": {
					name: "IsoTimestamp",
					type: "STRING",
					presence: "STATIC",
					prompt: "Normalized ISO timestamp parsed from TimeAnchor.",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"2024-06-15T14:30:00.000Z\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisIso",
						internalOnly: true,
					},
				},
				"internal-timeanalysis-epoch": {
					name: "EpochMillis",
					type: "STRING",
					presence: "STATIC",
					prompt: "Milliseconds since Unix epoch for this anchor.",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"1718461800000\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisEpoch",
						internalOnly: true,
					},
				},
				"internal-timeanalysis-elapsed-seconds": {
					name: "ElapsedSeconds",
					type: "STRING",
					presence: "STATIC",
					prompt: "Elapsed seconds since the previous anchor, if available.",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"120\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisElapsedSeconds",
						internalOnly: true,
					},
				},
				"internal-timeanalysis-elapsed-days": {
					name: "ElapsedDays",
					type: "STRING",
					presence: "STATIC",
					prompt: "Elapsed days (decimal) since the previous anchor.",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"0.00139\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisElapsedDays",
						internalOnly: true,
					},
				},
				"internal-timeanalysis-note": {
					name: "TimelineNote",
					type: "STRING",
					presence: "STATIC",
					prompt: "Any warnings or notes about the timeline (e.g., invalid or regressing anchors).",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"TimeAnchor parsed successfully.\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisNote",
						internalOnly: true,
					},
				},
				"internal-timeanalysis-parsed-at": {
					name: "ParsedAt",
					type: "STRING",
					presence: "STATIC",
					prompt: "ISO timestamp when the tracker parsed this anchor.",
					defaultValue: "<auto-filled>",
					exampleValues: [
						"\"2024-06-15T14:30:01.200Z\""
					],
					metadata: {
						internal: true,
						external: false,
						internalKeyId: "timeAnalysisParsedAt",
						internalOnly: true,
					},
				},
			},
			metadata: {
				internal: true,
				external: false,
				internalKeyId: "timeAnalysis",
				internalOnly: true,
			},
		},
	},
];
const SPECIAL_FIELD_METADATA = new Map([
	[
		"TimeAnchor",
		{
			internal: true,
			external: false,
			internalKeyId: "timeAnchor",
			internalOnly: true,
		},
	],
	[
		"LocalTime",
		{
			internal: true,
			external: true,
			internalKeyId: "localTime",
		},
	],
	[
		"TimeAnalysis",
		{
			internal: true,
			external: false,
			internalKeyId: "timeAnalysis",
			internalOnly: true,
		},
	],
	[
		"Characters",
		{
			internal: true,
			external: true,
			internalKeyId: "characters",
		},
	],
	[
		"Characters>Gender",
		{
			internal: true,
			external: true,
			internalKeyId: "characterGender",
		},
	],
]);
function cloneDefinition(definition) {
	return JSON.parse(JSON.stringify(definition));
}

function createFieldIdGenerator(startIndex = 0) {
	let index = startIndex;
	return () => `field-${index++}`;
}

function rebuildWithUniqueIds(fields, generator) {
	if (!fields || typeof fields !== "object") {
		return {};
	}
	const rebuilt = {};
	for (const [, field] of Object.entries(fields)) {
		if (!field || typeof field !== "object") continue;
		const cloned = cloneDefinition(field);
		if (cloned.nestedFields && typeof cloned.nestedFields === "object") {
			cloned.nestedFields = rebuildWithUniqueIds(cloned.nestedFields, generator);
		}
		const newId = generator();
		rebuilt[newId] = cloned;
	}
	return rebuilt;
}

function regenerateFieldIds(definition) {
	if (!definition || typeof definition !== "object") {
		return;
	}
	const generator = createFieldIdGenerator();
	const rebuilt = rebuildWithUniqueIds(definition, generator);
	for (const key of Object.keys(definition)) {
		delete definition[key];
	}
	for (const [key, value] of Object.entries(rebuilt)) {
		definition[key] = value;
	}
}

function getNextFieldId(definition) {
	let maxIndex = -1;
	for (const key of Object.keys(definition)) {
		const match = key.match(/^field-(\d+)$/);
		if (match) {
			maxIndex = Math.max(maxIndex, Number(match[1]));
		}
	}
	return `field-${maxIndex + 1}`;
}
function ensureFieldFromTemplate(container, template, context) {
	if (!container || typeof container !== "object") {
		return;
	}
	const entries = Object.entries(container);
	const found = entries.find(([, field]) => field?.name === template.name);
	if (!found) {
		const fieldId = getNextFieldId(container);
		container[fieldId] = cloneDefinition(template);
		context.changed = true;
		return;
	}
	const [fieldId] = found;
	const templClone = cloneDefinition(template);
	if (!_.isEqual(container[fieldId], templClone)) {
		container[fieldId] = templClone;
		context.changed = true;
	}
}
export function ensureInternalDataFields(definition) {
	const context = { changed: false };
	if (!definition || typeof definition !== "object") {
		return context;
	}
	for (const internalField of INTERNAL_DATA_DEFINITIONS) {
		ensureFieldFromTemplate(definition, internalField.definition, context);
	}
	regenerateFieldIds(definition);
	return context;
}
export function ensurePrefixDataFields(definition) {
	const context = { changed: false };
	if (!definition || typeof definition !== "object") {
		return context;
	}
	const existingEntries = Object.entries(definition);
	const nameToEntry = new Map();
	for (const [fieldId, field] of existingEntries) {
		if (field && typeof field === "object" && field.name) {
			nameToEntry.set(field.name, { fieldId, field });
		}
	}
	const rebuilt = {};
	let index = 0;
	const assignField = (field) => {
		const newId = `field-${index++}`;
		rebuilt[newId] = field;
	};
	for (const prefix of PREFIX_DATA_DEFINITIONS) {
		const existing = nameToEntry.get(prefix.name);
		let fieldToInsert;
		if (existing) {
			fieldToInsert = cloneDefinition(existing.field);
			nameToEntry.delete(prefix.name);
		} else {
			fieldToInsert = cloneDefinition(prefix.definition);
			context.changed = true;
		}
		assignField(fieldToInsert);
	}
	for (const [fieldId, field] of existingEntries) {
		if (!field || typeof field !== "object" || !field.name) continue;
		if (rebuilt && Object.values(rebuilt).some((existingField) => existingField.name === field.name)) continue;
		assignField(cloneDefinition(field));
	}
	const originalKeys = Object.keys(definition);
	for (const key of originalKeys) {
		delete definition[key];
	}
	for (const [key, field] of Object.entries(rebuilt)) {
		definition[key] = field;
	}
	regenerateFieldIds(definition);
	return context;
}
function normalizeMetadata(metadata = {}) {
	const normalized = {
		internal: metadata.internal === true,
		external: metadata.external !== false,
		internalKeyId: metadata.internalKeyId || null,
	};
	if (Object.prototype.hasOwnProperty.call(metadata, "internalOnly")) {
		normalized.internalOnly = Boolean(metadata.internalOnly);
	} else {
		normalized.internalOnly = normalized.internal && !normalized.external;
	}
	return normalized;
}
function applyMetadataRecursive(fields, path = [], context = { changed: false, legacyDetected: false }) {
	for (const field of Object.values(fields || {})) {
		if (!field || typeof field !== "object") continue;
		const currentPath = [...path, field.name || ""];
		const pathKey = currentPath.join(">");
		const providedMetadata = field.metadata;
		if (!providedMetadata || typeof providedMetadata !== "object") {
			context.legacyDetected = true;
		}
		const specialMetadata = SPECIAL_FIELD_METADATA.get(pathKey);
		const normalizedMetadata = normalizeMetadata({
			...providedMetadata,
			...(specialMetadata ? cloneDefinition(specialMetadata) : {}),
		});
		if (!providedMetadata || !_.isEqual(providedMetadata, normalizedMetadata)) {
			context.changed = true;
			field.metadata = normalizedMetadata;
		} else {
			field.metadata = normalizedMetadata;
		}
		if (field.nestedFields && Object.keys(field.nestedFields).length > 0) {
			applyMetadataRecursive(field.nestedFields, currentPath, context);
		}
	}
	return context;
}
export function ensureTrackerMetadata(definition) {
	if (!definition || typeof definition !== "object") {
		return { changed: false, legacyDetected: false };
	}
	return applyMetadataRecursive(definition, []);
}
//#region Setting Enums
export const generationTargets = {
	BOTH: "both",
	USER: "user",
	CHARACTER: "character",
	NONE: "none",
};
export const trackerFormat = {
	JSON: "JSON",
	YAML: "YAML",
};
export const PREVIEW_PLACEMENT = {
	BEFORE: "before",
	AFTER: "after",
	APPEND: "append",
	PREPEND: "prepend",
};
//#endregion
//#region Shared
const generateContextTemplate = t("prompts.generateContextTemplate", `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
{{trackerSystemPrompt}}
{{participantGuidance}}
<!-- Start of Context -->
{{characterDescriptions}}
### Recent Messages with Trackers
{{recentMessages}}
### Current Tracker
<tracker>
{{currentTracker}}
</tracker>
<!-- End of Context --><|eot_id|>`);
const generateSystemPrompt = t("prompts.generateSystemPrompt", `You are a Scene Tracker Assistant, tasked with providing clear, consistent, and structured updates to a scene tracker for a roleplay. Use the latest message, previous tracker details, and context from recent messages to accurately update the tracker. Your response must follow the specified {{trackerFormat}} structure exactly, ensuring that each field is filled and complete. If specific information is not provided, make reasonable assumptions based on prior descriptions, logical inferences, or default character details.
### Key Instructions:
1. **Tracker Format**: Always respond with a complete tracker in {{trackerFormat}} format. Every field must be present in the response, even if unchanged. Do not omit fields or change the {{trackerFormat}} structure.
2. **Default Assumptions for Missing Information**: 
   - **Character Details**: If no new details are provided for a character, assume reasonable defaults (e.g., hairstyle, posture, or attire based on previous entries or context).
   - **Outfit**: Describe the complete outfit for each character, using specific details for color, fabric, and style (e.g., “fitted black leather jacket with silver studs on the collar”). **Underwear must always be included in the outfit description.** If underwear is intentionally missing, specify this clearly in the description (e.g., "No bra", "No panties"). If the character is undressed, list the entire outfit.
   - **StateOfDress**: Describe how put-together or disheveled the character appears, including any removed clothing. If the character is undressed, indicate where discarded items are placed.
3. **Incremental Time Progression**: 
   - Advance the scene clock in small, logical increments (seconds or minutes) unless the narrative explicitly calls for a larger skip (sleep, travel, “three days pass,” etc.).
   - Always update TimeAnchor with the new ISO-8601 timestamp that reflects this advancement; never reuse the exact previous timestamp unless the story is frozen in the same instant.
   - Immediately follow by updating LocalTime so it translates the same moment into the setting’s flavourful calendar, era, or colloquial timekeeping.
4. **Context-Appropriate Times**: 
   - Ensure that the time aligns with the setting. For example, if the scene takes place in a public venue (e.g., a mall), choose an appropriate time within standard operating hours.
5. **Location Format**: Avoid unintended reuse of specific locations from previous examples or responses. Provide specific, relevant, and detailed locations based on the context, using the format:
   - **Example**: “Food court, second floor near east wing entrance, Madison Square Mall, Los Angeles, CA” 
6. **Consistency**: Match field structures precisely, maintaining {{trackerFormat}} syntax. If no changes occur in a field, keep the most recent value.
7. **Topics Format**: Ensure topics are one- or two-word keywords relevant to the scene to help trigger contextual information. Avoid long phrases.
8. **Avoid Redundancies**: Use only details provided or logically inferred from context. Do not introduce speculative or unnecessary information.
9. **Focus and Pause**: Treat each scene update as a standalone, complete entry. Respond with the full tracker every time, even if there are only minor updates.
### Tracker Template
Return your response in the following {{trackerFormat}} structure, following this format precisely:
\`\`\`
<tracker>
{{defaultTracker}}
</tracker>
\`\`\`
### Important Reminders:
1. **Recent Messages and Current Tracker**: Before updating, always consider the recent messages and the provided <Current Tracker> to ensure all changes are accurately represented.
2. **Structured Response**: Do not add any extra information outside of the {{trackerFormat}} tracker structure.
3. **Complete Entries**: Always provide the full tracker in {{trackerFormat}}, even if only minor updates are made.
Your primary objective is to ensure clarity, consistency, and structured responses for scene tracking in {{trackerFormat}} format, providing complete details even when specifics are not explicitly stated.`);
const generateRequestPrompt = t("prompts.generateRequestPrompt", `[Analyze the previous message along with the recent messages provided below and update the current scene tracker based on logical inferences and explicit details. Pause and ensure only the tracked data is provided, formatted in {{trackerFormat}}. Avoid adding, omitting, or rearranging fields unless specified. Respond with the full tracker every time.
### Response Rules:
{{trackerFieldPrompt}}
Ensure the response remains consistent, strictly follows this structure in {{trackerFormat}}, and omits any extra data or deviations. You MUST enclose the tracker in <tracker></tracker> tags]`);
const generateRecentMessagesTemplate = t("prompts.generateRecentMessagesTemplate", `{{#if tracker}}Tracker: <tracker>
{{tracker}}
</tracker>
{{/if}}{{char}}: {{message}}`);
const characterDescriptionTemplate = t("prompts.characterDescriptionTemplate", `### {{char}}'s Description
{{charDescription}}`);
const mesTrackerTemplate = `<div class="tracker_default_mes_template">
    <table>
        <tr data-field-id="field-1" data-internal-key-id="localTime">
            <td>LocalTime:</td>
            <td>{{LocalTime}}</td>
        </tr>
        <tr data-field-id="field-2">
            <td>Location:</td>
            <td>{{Location}}</td>
        </tr>
        <tr data-field-id="field-3">
            <td>Weather:</td>
            <td>{{Weather}}</td>
        </tr>
    </table>
    <details>
        <summary><span>Tracker</span></summary>
        <table>
            <tr data-field-id="field-7">
                <td>Topics:</td>
                <td>{{#join "; " Topics}}</td>
            </tr>
            <tr data-field-id="field-8">
                <td>Present:</td>
                <td>{{#join "; " CharactersPresent}}</td>
            </tr>
        </table>
        <div class="mes_tracker_characters">
            {{#foreach Characters character}}
            <hr>
            <strong>{{character}}:</strong><br />
            <table>
                <tr data-field-id="field-9" data-internal-key-id="characterGender">
                    <td>Gender:</td>
                    <td>{{character.Gender}}</td>
                </tr>
                <tr data-field-id="field-10">
                    <td>Age:</td>
                    <td>{{character.Age}}</td>
                </tr>
                <tr data-field-id="field-11">
                    <td>Hair:</td>
                    <td>{{character.Hair}}</td>
                </tr>
                <tr data-field-id="field-12">
                    <td>Makeup:</td>
                    <td>{{character.Makeup}}</td>
                </tr>
                <tr data-field-id="field-13">
                    <td>Outfit:</td>
                    <td>{{character.Outfit}}</td>
                </tr>
                <tr data-field-id="field-14">
                    <td>State:</td>
                    <td>{{character.StateOfDress}}</td>
                </tr>
                <tr data-field-id="field-15">
                    <td>Position:</td>
                    <td>{{character.PostureAndInteraction}}</td>
                </tr>
                <tr data-field-id="field-16">
                    <td>BustWaistHip:</td>
                    <td>{{character.BustWaistHip}}</td>
                </tr>
                <tr data-field-id="field-17">
                    <td>FertilityCycle:</td>
                    <td>{{character.FertilityCycle}}</td>
                </tr>
                <tr data-field-id="field-18">
                    <td>Pregnancy:</td>
                    <td>{{character.Pregnancy}}</td>
                </tr>
                <tr data-field-id="field-19">
                    <td>Virginity:</td>
                    <td>{{character.Virginity}}</td>
                </tr>
                <tr data-field-id="field-20">
                    <td>Traits:</td>
                    <td>{{character.Traits}}</td>
                </tr>
                <tr data-field-id="field-21">
                    <td>Children:</td>
                    <td>{{character.Children}}</td>
                </tr>
            </table>
            {{/foreach}}
        </div>
    </details>
</div>
<hr>`;
// Replace the mesTrackerJavascript around line 361
const mesTrackerJavascript = `()=>{
const GENDER_FIELD_KEY="characterGender";
const GENDER_SYMBOLS={
male:["\u2642","\u2642\uFE0F"],
female:["\u2640","\u2640\uFE0F"],
trans:["\u26A7","\u26A7\uFE0F"]
};
const hideFields=(mesId,element)=>{
const sections=element.querySelectorAll('.mes_tracker_characters strong');
const addStyle=()=>{
if(document.querySelector('style[data-tracker-alignment]'))return;
const style=document.createElement('style');
style.textContent='.mes_tracker_characters{display:flex;flex-direction:column;}.mes_tracker_characters table{table-layout:fixed!important;width:100%!important;border-spacing:0!important;}.mes_tracker_characters table td:first-child{width:120px!important;min-width:120px!important;max-width:120px!important;text-align:left!important;vertical-align:top!important;padding:2px 5px!important;}.mes_tracker_characters table td:last-child{width:calc(100% - 125px)!important;text-align:left!important;vertical-align:top!important;padding:2px 5px!important;word-wrap:break-word!important;}';
style.setAttribute('data-tracker-alignment','true');
document.head.appendChild(style);
};
addStyle();
sections.forEach((header,index)=>{
const name=header.textContent.replace(':','').trim();
let next=header.nextElementSibling;
let table=null;
while(next){
if(next.tagName==='TABLE'){
table=next;break;
}
next=next.nextElementSibling;
}
if(table){
const rows=Array.from(table.rows);
const genderRow=rows.find(row=>{
const dataKey=row.dataset&&row.dataset.internalKeyId;
if(dataKey===GENDER_FIELD_KEY)return true;
const firstCell=row.cells[0];
if(!dataKey&&firstCell){
return firstCell.textContent.trim()==='Gender:';
}
return false;
});
if(!genderRow||!genderRow.cells[1])return;
const genderText=genderRow.cells[1].textContent.trim();
const containsSymbol=(text,symbols)=>symbols.some(symbol=>text.includes(symbol));
const isFemale=containsSymbol(genderText,GENDER_SYMBOLS.female);
const isMale=containsSymbol(genderText,GENDER_SYMBOLS.male);
const isTrans=containsSymbol(genderText,GENDER_SYMBOLS.trans);
const fieldsToHide=[];
if(!isFemale){
fieldsToHide.push(...[{label:'BustWaistHip:',key:null,fieldId:'field-16'},{label:'FertilityCycle:',key:null,fieldId:'field-17'},{label:'Pregnancy:',key:null,fieldId:'field-18'}]);
}
if(!isMale){
fieldsToHide.push(...[]);
}
if(!isTrans){
fieldsToHide.push(...[]);
}
if(fieldsToHide.length===0)return;
rows.forEach(row=>{
if(!row.cells[0])return;
const label=row.cells[0].textContent.trim();
const dataKey=row.dataset?row.dataset.internalKeyId:null;
const fieldId=row.dataset?row.dataset.fieldId:null;
const matches=fieldsToHide.some(spec=>{
if(spec.key&&dataKey===spec.key)return true;
if(spec.fieldId&&fieldId===spec.fieldId)return true;
if(spec.label&&label===spec.label)return true;
return false;
});
if(matches){
row.style.display='none';
}
});
}
});
};
const init=()=>{
try{
const ctx=SillyTavern.getContext();
if(ctx&&ctx.eventSource){
ctx.eventSource.on("TRACKER_ENHANCED_PREVIEW_ADDED",hideFields);
ctx.eventSource.on("TRACKER_ENHANCED_PREVIEW_UPDATED",hideFields);
}
}catch(e){
console.warn('[tracker-enhanced] Init failed, SillyTavern context not available:',e.message);
}
};
const cleanup=()=>{
try{
const ctx=SillyTavern.getContext();
if(ctx&&ctx.eventSource&&typeof ctx.eventSource.off==='function'){
ctx.eventSource.off("TRACKER_ENHANCED_PREVIEW_ADDED",hideFields);
ctx.eventSource.off("TRACKER_ENHANCED_PREVIEW_UPDATED",hideFields);
}
const style=document.querySelector('style[data-tracker-alignment]');
if(style)style.remove();
}catch(e){
console.warn('[tracker-enhanced] Cleanup failed, SillyTavern context not available:',e.message);
const style=document.querySelector('style[data-tracker-alignment]');
if(style)style.remove();
}
};
return{init,cleanup,hideGenderSpecificFields:hideFields};
}`;
const trackerDef = {
	"field-0": {
		"name": "LocalTime",
		"type": "STRING",
		"presence": "DYNAMIC",
		"prompt": "Describe how the anchored moment reads inside the story world. Use the setting’s own calendars, watches, suns, bells, or metaphors, ensuring it aligns with the culture and location established in the scene.",
		"defaultValue": "<Local timekeeping description if changed>",
		"exampleValues": [
			"Morning rush on 10/16/2024 (Wednesday), Midtown Manhattan",
			"Third watch before dawn, Year of the Plague, Canterbury countryside",
			"Jingkang Era, third month eighteenth day, Mao hour in Bianliang (Song dynasty)",
			"Stardate 45231.5, orbital dusk above Epsilon Eridani",
			"Embermoon 18, Crystal Era VI, Temple of Lumen"
		],
		"nestedFields": {},
		"metadata": {
			"internal": true,
			"external": true,
			"internalKeyId": "localTime"
		}
	},
	"field-1": {
		"name": "Location",
		"type": "STRING",
		"presence": "DYNAMIC",
		"prompt": "Provide a **detailed and specific location**, including exact places like rooms, landmarks, or stores, following this format: \"Specific Place, Building, City, State\". Avoid unintended reuse of specific locations from previous examples. Example: \"Food court, second floor near east wing entrance, Madison Square Mall, Los Angeles, CA\".",
		"defaultValue": "<Updated location if changed>",
		"exampleValues": [
			"Conference Room B, 12th Floor, Apex Corporation, New York, NY",
			"Main Gym Hall, Maple Street Fitness Center, Denver, CO",
			"South Beach, Miami, FL"
		],
		"nestedFields": {},
		"metadata": {
			"internal": false,
			"external": true
		}
	},
	"field-2": {
		"name": "Weather",
		"type": "STRING",
		"presence": "DYNAMIC",
		"prompt": "Describe current weather concisely to set the scene. Example: \"Light Drizzle, Cool Outside\".",
		"defaultValue": "<Updated weather if changed>",
		"exampleValues": [
			"Overcast, mild temperature",
			"Clear skies, warm evening",
			"Sunny, gentle sea breeze"
		],
		"nestedFields": {},
		"metadata": {
			"internal": false,
			"external": true
		}
	},
	"field-3": {
		"name": "Topics",
		"type": "ARRAY_OBJECT",
		"presence": "DYNAMIC",
		"prompt": "",
		"defaultValue": "",
		"exampleValues": [
			"",
			"",
			""
		],
		"nestedFields": {
			"field-4": {
			"name": "PrimaryTopic",
			"type": "STRING",
			"presence": "DYNAMIC",
			"prompt": "**One- or two-word topic** describing main activity or focus of the scene.",
			"defaultValue": "<Updated Primary Topic if changed>",
			"exampleValues": [
				"Presentation",
				"Workout",
				"Relaxation"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-5": {
			"name": "EmotionalTone",
			"type": "STRING",
			"presence": "DYNAMIC",
			"prompt": "**One- or two-word topic** describing dominant emotional atmosphere of the scene.",
			"defaultValue": "<Updated Emotional Tone if changed>",
			"exampleValues": [
				"Tense",
				"Focused",
				"Calm"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
		"field-6": {
		"name": "InteractionTheme",
		"type": "STRING",
		"presence": "DYNAMIC",
		"prompt": "**One- or two-word topic** describing primary type of interactions or relationships in the scene.",
		"defaultValue": "<Updated Interaction Theme if changed>",
		"exampleValues": [
			"Professional",
			"Supportive",
			"Casual"
		],
		"nestedFields": {},
		"metadata": {
			"internal": false,
			"external": true
		}
		}
		},
		"metadata": {
			"internal": false,
			"external": true
		}
	},
	"field-7": {
		"name": "CharactersPresent",
		"type": "ARRAY",
		"presence": "DYNAMIC",
		"prompt": "List all characters currently present in an array format.",
		"defaultValue": "<List of characters present if changed>",
		"exampleValues": [
			"[\"Emma Thompson\", \"James Miller\", \"Sophia Rodriguez\"]",
			"[\"Daniel Lee\", \"Olivia Harris\"]",
			"[\"Liam Johnson\", \"Emily Clark\"]"
		],
		"nestedFields": {},
		"metadata": {
			"internal": false,
			"external": true
		}
	},
	"field-8": {
		"name": "Characters",
		"type": "FOR_EACH_OBJECT",
		"presence": "DYNAMIC",
		"prompt": "For each character, update the following details:",
		"defaultValue": "<Character Name>",
		"exampleValues": [
			"[\"Emma Thompson\", \"James Miller\", \"Sophia Rodriguez\"]",
			"[\"Daniel Lee\", \"Olivia Harris\"]",
			"[\"Liam Johnson\", \"Emily Clark\"]"
		],
		"nestedFields": {
			"field-9": {
			"name": "Gender",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "A single word and an emoji (♂️ / ♀️ / ⚧️/ ❓) for Character gender. ",
			"defaultValue": "<Current gender if no update is needed>",
			"exampleValues": [
				"\"Male ♂️\"",
				"\"Female ♀️\"",
				"\"Trans ⚧️\"",
				"\"Unkown ❓\""
			],
			"nestedFields": {},
			"metadata": {
				"internal": true,
				"external": true,
				"internalKeyId": "characterGender"
			}
			},
			"field-10": {
			"name": "Age",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "A single number displays character age based on Narrative. Change with time advancement. Or \"Unkown\" if unkown.",
			"defaultValue": "<Current Age if no update is needed>",
			"exampleValues": [
				"\"Unkown\"",
				"\"18\"",
				"\"32\""
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-11": {
			"name": "Hair",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "Describe style only.",
			"defaultValue": "<Updated hair description if changed>",
			"exampleValues": [
				"[\"Shoulder-length blonde hair, styled straight\", \"Short black hair, neatly combed\", \"Long curly brown hair, pulled back into a low bun\"]",
				"[\"Short brown hair, damp with sweat\", \"Medium-length red hair, tied up in a high ponytail\"]",
				"[\"Short sandy blonde hair, slightly tousled\", \"Long wavy brown hair, loose and flowing\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-12": {
			"name": "Makeup",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "Describe current makeup.",
			"defaultValue": "<Updated makeup if changed>",
			"exampleValues": [
				"[\"Natural look with light foundation and mascara\", \"None\", \"Subtle eyeliner and nude lipstick\"]",
				"[\"None\", \"Minimal, sweat-resistant mascara\"]",
				"[\"None\", \"Sunscreen applied, no additional makeup\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-13": {
			"name": "Outfit",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "**IMPORTANT!** List the complete outfit, including **underwear and accessories**, even if the character is undressed. **Underwear must always be included in the outfit description. If underwear is intentionally missing, specify this clearly (e.g. \"No Bra\", \"No Panties\").** Outfit should stay the same until changed for a new one.",
			"defaultValue": "<Full outfit description, even if removed including color, fabric, and style details; **always include underwear and accessories if present. If underwear is intentionally missing, specify clearly**>",
			"exampleValues": [
				"[\"Navy blue blazer over a white silk blouse; Gray pencil skirt; Black leather belt; Sheer black stockings; Black leather pumps; Pearl necklace; Silver wristwatch; White lace balconette bra; White lace hipster panties matching the bra\", \"Dark gray suit; Light blue dress shirt; Navy tie with silver stripes; Black leather belt; Black dress shoes; Black socks; White cotton crew-neck undershirt; Black cotton boxer briefs\", \"Cream-colored blouse with ruffled collar; Black slacks; Brown leather belt; Brown ankle boots; Gold hoop earrings; Beige satin push-up bra; Beige satin bikini panties matching the bra\"]",
				"[\"Gray moisture-wicking t-shirt; Black athletic shorts; White ankle socks; Gray running shoes; Black sports watch; Blue compression boxer briefs\", \"Black sports tank top; Purple athletic leggings; Black athletic sneakers; White ankle socks; Fitness tracker bracelet; Black racerback sports bra; Black seamless athletic bikini briefs matching the bra\"]",
				"[\"Light blue short-sleeve shirt; Khaki shorts; Brown leather sandals; Silver wristwatch; Blue plaid cotton boxer shorts\", \"White sundress over a red halter bikini; Straw hat; Brown flip-flops; Gold anklet; Red halter bikini top; Red tie-side bikini bottoms matching the top\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-14": {
			"name": "StateOfDress",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "Describe how put-together or disheveled the character appears, including any removed clothing. Note where clothing items from outfit were discarded.",
			"defaultValue": "<Current state of dress if no update is needed. Note location where discarded outfit items are placed if character is undressed>",
			"exampleValues": [
				"[\"Professionally dressed, neat appearance\", \"Professionally dressed, attentive\", \"Professionally dressed, organized\"]",
				"[\"Workout attire, lightly perspiring\", \"Workout attire, energized\"]",
				"[\"Shirt and sandals removed, placed on beach towel\", \"Sundress and hat removed, placed on beach chair\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-15": {
			"name": "PostureAndInteraction",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "Describe physical posture, position relative to others or objects, and interactions.",
			"defaultValue": "<Current posture and interaction if no update is needed>",
			"exampleValues": [
				"[\"Standing at the podium, presenting slides, holding a laser pointer\", \"Sitting at the conference table, taking notes on a laptop\", \"Sitting next to James, reviewing printed documents\"]",
				"[\"Lifting weights at the bench press, focused on form\", \"Running on the treadmill at a steady pace\"]",
				"[\"Standing at the water's edge, feet in the surf\", \"Lying on a beach towel, sunbathing with eyes closed\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-16": {
			"name": "BustWaistHip",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "female",
			"prompt": "**Female Character only!** Display Bust/Waist/Hip measurements in centimetre based on narrative. Or \"Unkown\" if unknown.",
			"defaultValue": "<Current BustWaistHip if no update is needed>",
			"exampleValues": [
			"\"Unknown\"",
			"\"B80:W60:H86 (CM)\"",
			"\"B79:W56:H83 (CM)\""
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-17": {
			"name": "FertilityCycle",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "female",
			"prompt": "**Female Character only!** Displays the current fertility cycle stage. States advance with time. If Pregnancy tracking indicates conception, immediately switch FertilityCycle to \"Pregnant 👶\" and pause the cycle. Remain \"Pregnant 👶\" for the full duration of pregnancy. Resume cycle after delivery.",
			"defaultValue": "<Current fertility cycle if no update is needed>",
			"exampleValues": [
				"\"Menstrual 🩸 (Safe)\"",
				"\"Follicular 🌱 (Low Risk)\"",
				"\"Ovulating 🌸 (High Risk!)\"", 
				"\"Luteal 🌙 (Moderate Risk)\"",
				"\"Pregnant 👶\""
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-18": {
			"name": "Pregnancy",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "female",
			"prompt": "**Female Character only!** Perform a d100 roll post-creampie scene to determine conception, chances are based on fertility cycle: Menstrual (0%), Follicular (15%), Ovulating (85%), Luteal (30%), Pregnant (0%) (e.g., rolled 80 during ovulating phase, 80<85, then yes. ). If yes, track days pregnant and trimester (1st: 0-90; 2nd: 91-180; 3rd: 181-270). Describe this with father's name.",
			"defaultValue": "<Current Pregnancy if no update is needed>",
			"exampleValues": [
				"\"Not Pregnant\"",
				"\"1st trimester, 0 days, impregnated by Harry\"",
				"\"3st trimester, 200 days, impregnated by Harry\""
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-19": {
			"name": "Virginity",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "If virgin: \"Virgin\" else \"Lost to {partner}\".  Or \"Unkown\" if unkown.",
			"defaultValue": "<Current Virginity if no update is needed>",
			"exampleValues": [
				"\"Unkown\"",
				"\"Virgin\"",
				"\"Lost to Sam Witwicky\""
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-20": {
			"name": "Traits",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "Add or Remove trait based on Narrative. \"{trait}: {short description}\"",
			"defaultValue": "<Current Traits if no update is needed>",
			"exampleValues": [
				"[\"No Traits\"]",
				"[\"Giant Penis: causes tearing pain to partner during sex.\", \"Emotional Intelligence: deeply philosophical and sentimental\"]",
				"[\"Tight Pussy: increase partner pleasure during sex.\", \"Masochist: gain pleasure from pain.\", \"Sadistic: deriving pleasure from inflicting pain.\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			},
			"field-21": {
			"name": "Children",
			"type": "STRING",
			"presence": "DYNAMIC",
			"genderSpecific": "all",
			"prompt": "Add child after birth based on Narrative. Format: \"{Birth Order}: {Name}, {Gender + Symbol}, child with {Other Parent}\"",
			"defaultValue": "<Current Children if no update is needed>",
			"exampleValues": [
				"[\"No Child\"]",
				"[\"1st Born: Eve, Female ♀️, child with Harry\"]",
				"[\"1st Born: Aya, Female ♀️, child with Bob\", \"2nd Born: Max, Male ♂️, child with Sam\"]"
			],
			"nestedFields": {},
			"metadata": {
				"internal": false,
				"external": true
			}
			}
		},
		"metadata": {
			"internal": true,
			"external": true,
			"internalKeyId": "characters"
		}
	},
	"field-22": {
		"name": "StoryEvents",
		"type": "OBJECT",
		"presence": "DYNAMIC",
		"prompt": "Lifecycle event log used to coordinate internal tracker automations.",
		"defaultValue": "<Story events if present>",
		"exampleValues": [
			"{}",
			"{\"BirthEvents\": {\"Mira\": {\"NewBornDescription\": \"Mira, the newborn of Harry and Monika, female — she sleeps in short bursts and can only communicate through soft cries.\"}}, \"GrowthEvents\": {\"Molly Thompson\": {\"GrowthDescription\": \"Molly Thompson has grown into an energetic teenager with her father Jack's athletic build and her mother Rose's quick wit.\"}}, \"DeathEvents\": {\"Sir Alden\": {\"DeathCauseDescription\": \"Sir Alden fell defending the northern gate, struck down by the dragon's final burst of flame.\"}}}"
		],
		"nestedFields": {
				"internal-story-birth-events": {
				"name": "BirthEvents",
				"type": "FOR_EACH_OBJECT",
				"presence": "DYNAMIC",
				"genderSpecific": "all",
				"prompt": "Count only completed births — the baby must be fully delivered and present. Ignore labor, contractions, or partial delivery. Use \"Unnamed baby of <mother name>\" for unnamed babies. For each newborn, update the details:",
				"defaultValue": "<Baby Name>",
				"exampleValues": [
					"[\"None\"]",
					"[\"Liam Johnson\", \"Emily Clark\"]",
					"[\"Unnamed baby of Alice\"]"
				],
				"nestedFields": {
					"internal-story-birth-description": {
					"name": "NewBornDescription",
					"type": "STRING",
					"presence": "DYNAMIC",
					"genderSpecific": "all",
					"prompt": "Describe the newborn, including name, gender, parents, appearance, notable traits, and their immediate newborn behaviours (e.g., crying, sleeping patterns, inability to speak or walk).",
					"defaultValue": "<description of the newborn baby>",
					"exampleValues": [
						"Mira, the newborn of Harry and Monika, female — she sleeps in short bursts, cries softly when hungry, and cannot yet focus her bright blue eyes on anything distant.",
						"Molly, the newborn of Jack and Rose, female — she clenches her tiny fists, reacts to her parents' voices, and only communicates with soft whimpers.",
						"Arwen, the newborn of Elrond and Celebrían, female — she has luminous eyes, slightly pointed ears, and can only express herself through gentle coos."
					],
					"metadata": {
						"internal": true,
						"external": false,
						"internalKeyId": "newBornDescription",
						"internalOnly": true
					}
					}
				},
				"metadata": {
					"internal": true,
					"external": false,
					"internalKeyId": "birthEvents",
					"internalOnly": true
				}
				},
				"internal-story-growth-events": {
				"name": "GrowthEvents",
				"type": "FOR_EACH_OBJECT",
				"presence": "DYNAMIC",
				"genderSpecific": "all",
				"prompt": "Track major growth milestones for existing characters. For each update, provide a complete, card-ready description that reflects current age, physical changes, behavioural shifts, skills, relationships, and notable story developments.",
				"defaultValue": "<Character Name>",
				"exampleValues": [
					"[\"Mira Thompson\"]",
					"[\"Molly Johnson\"]",
					"[\"Arwen Half-elven\"]"
				],
				"nestedFields": {
					"internal-story-growth-description": {
					"name": "GrowthDescription",
					"type": "STRING",
					"presence": "DYNAMIC",
					"genderSpecific": "all",
					"prompt": "Provide a full character description reflecting the current stage of life: appearance, age, personality, behaviour, skills, relationships, and any recent narrative developments.",
					"defaultValue": "<updated character description>",
					"exampleValues": [
						"Mira Thompson, now five years old, has inquisitive blue eyes, a restless mind, and a fearless curiosity. She chatters endlessly about the world she discovers each day and already mimics her mother Monika's analytical instincts.",
						"Molly Johnson has grown into an energetic teenager with her father Jack's athletic build and her mother Rose's quick wit. She balances school with competitive swimming, and her confidence is tempered by a fierce loyalty to her family.",
						"Arwen Half-elven now stands as a poised young adult, carrying the wisdom of her father Elrond and the grace of her mother Celebrían. Her luminous eyes reflect centuries of elven memory, and she moves through Rivendell as a calming presence and diplomat."
					],
					"metadata": {
						"internal": true,
						"external": false,
						"internalKeyId": "growthDescription",
						"internalOnly": true
					}
					}
				},
				"metadata": {
					"internal": true,
					"external": false,
					"internalKeyId": "growthEvents",
					"internalOnly": true
				}
				},
				"internal-story-death-events": {
				"name": "DeathEvents",
				"type": "FOR_EACH_OBJECT",
				"presence": "DYNAMIC",
				"genderSpecific": "all",
				"prompt": "Track characters whose stories have ended. For each death, provide the character name and a concise description of how and why they died, along with any immediate narrative consequences.",
				"defaultValue": "<Character Name>",
				"exampleValues": [
					"[\"Sir Alden\"]",
					"[\"Mira Thompson\"]",
					"[\"Unnamed soldier\"]"
				],
				"nestedFields": {
					"internal-story-death-description": {
					"name": "DeathCauseDescription",
					"type": "STRING",
					"presence": "DYNAMIC",
					"genderSpecific": "all",
					"prompt": "Summarize the cause of death and any immediate aftermath or impact on the narrative.",
					"defaultValue": "<cause of death description>",
					"exampleValues": [
						"Sir Alden fell defending the northern gate, struck down by the dragon's final burst of flame.",
						"Mira Thompson passed peacefully at the age of 84, surrounded by family after a lifetime of pioneering research.",
						"The unnamed soldier perished during the midnight ambush, triggering the retreat of the remaining scouts."
					],
					"metadata": {
						"internal": true,
						"external": false,
						"internalKeyId": "deathCauseDescription",
						"internalOnly": true
					}
					}
				},
				"metadata": {
					"internal": true,
					"external": false,
					"internalKeyId": "deathEvents",
					"internalOnly": true
				}
				}
			},
		"metadata": {
			"internal": true,
			"external": false,
			"internalKeyId": "storyEvents",
			"internalOnly": true
		}
	}
};
ensurePrefixDataFields(trackerDef);
ensureInternalDataFields(trackerDef);
ensureTrackerMetadata(trackerDef);
const trackerPreviewSelector = ".mes_block .mes_text";
const trackerPreviewPlacement = "before";
const numberOfMessages = 5;
const generateFromMessage = 3;
const minimumDepth = 0;
const responseLength = 0;
const roleplayPrompt = t("prompts.roleplayPrompt", "Treat the tracker block as backstage notes. Never include <tracker> tags or describe tracker updates in your reply. Stay fully in character and respond only with the dialogue or actions the character would naturally deliver, using the tracker information purely as reference.");
//#endregion
export const defaultSettings = {
	enabled: true,
	languageOverride: "auto",
	selectedProfile: "current",
	selectedCompletionPreset: "current",
	generationTarget: generationTargets.BOTH,
	showPopupFor: generationTargets.NONE,
	trackerFormat: trackerFormat.YAML,

	generateContextTemplate: generateContextTemplate,
	generateSystemPrompt: generateSystemPrompt,
	generateRequestPrompt: generateRequestPrompt,
	generateRecentMessagesTemplate: generateRecentMessagesTemplate,

	characterDescriptionTemplate: characterDescriptionTemplate,

	mesTrackerTemplate: mesTrackerTemplate,
	mesTrackerJavascript: mesTrackerJavascript,
	trackerDef: trackerDef,

	trackerPreviewSelector: trackerPreviewSelector,
	trackerPreviewPlacement: trackerPreviewPlacement,

	numberOfMessages: numberOfMessages,
	generateFromMessage: generateFromMessage,
	minimumDepth: minimumDepth,
	responseLength: responseLength,
	roleplayPrompt: roleplayPrompt,
	selectedPreset: DEFAULT_PRESET_NAME,
	presets: {
		[DEFAULT_PRESET_NAME]: {

			generateContextTemplate: generateContextTemplate,
			generateSystemPrompt: generateSystemPrompt,
			generateRequestPrompt: generateRequestPrompt,
			generateRecentMessagesTemplate: generateRecentMessagesTemplate,
			roleplayPrompt: roleplayPrompt,

			characterDescriptionTemplate: characterDescriptionTemplate,

			mesTrackerTemplate: mesTrackerTemplate,
			mesTrackerJavascript: mesTrackerJavascript,
			trackerDef: trackerDef,
		},
	},
	devToolsEnabled: false,
	debugMode: false,
	trackerInjectionEnabled: true,
	toolbarIndicatorEnabled: false,
	metadataSchemaVersion: TRACKER_METADATA_VERSION,
};
// Default test data for development
export const testTavernCardV2 = {
	spec: 'chara_card_v2',
	spec_version: '2.0',
	name: 'Test Character',
	avatar: 'test_character.png',
	data: {
		name: 'Test Character',
		description: 'A mysterious figure with piercing blue eyes and silver hair. They wear a long dark cloak that seems to shimmer with an otherworldly energy. Their presence commands attention, yet they move with an almost supernatural grace.',
		personality: 'Enigmatic, intelligent, and curious. Speaks with measured words and often poses philosophical questions. Has a dry sense of humor and appreciates intellectual discourse. Can be both warm and distant, depending on their mood.',
		scenario: 'You encounter this mysterious figure in an ancient library, surrounded by towering shelves of forgotten tomes. The air is thick with the scent of old parchment and magic.',
		first_mes: '*A figure emerges from between the towering bookshelves, their footsteps silent on the dusty floor. They regard you with curious eyes that seem to hold centuries of knowledge.*\n\n"Ah, a visitor. How refreshing." *They close the ancient tome in their hands with a soft thud.* "Tell me, what brings you to this repository of forgotten knowledge? Surely not mere chance..."',
		mes_example: '<START>\n{{user}}: Who are you?\n{{char}}: *A slight smile plays at the corners of their lips.* "Who am I? Such a simple question with such a complex answer. I am a keeper of knowledge, a seeker of truth, a wanderer between worlds. But you may call me {{char}}, if names are what you require."\n<START>\n{{user}}: What is this place?\n{{char}}: *They gesture broadly at the endless rows of books.* "This? This is where stories go to rest, where knowledge waits to be rediscovered. Every book here contains a universe, every page a possibility. Beautiful, is it not?"',
		creator_notes: 'This character is designed for philosophical and mystical roleplay scenarios. They work best in fantasy or supernatural settings.',
		system_prompt: 'You are a mysterious, knowledgeable entity who speaks in riddles and metaphors. You have vast knowledge but reveal it slowly and cryptically.',
		post_history_instructions: 'Remember to maintain an air of mystery. Never fully reveal all knowledge at once.',
		alternate_greetings: [
			'*The figure looks up from their book, silver hair catching the dim light.* "Interesting. The threads of fate have brought us together once more."',
			'*You find them standing by a window, gazing at the stars.* "The cosmos whispers secrets tonight. Can you hear them?"'
		],
		tags: ['fantasy', 'mysterious', 'philosophical', 'magic'],
		creator: 'TrackerEnhanced',
		character_version: '1.0',
		extensions: {
			talkativeness: 0.7,
			fav: false,
			world: '',
			depth_prompt: {
				prompt: '{{char}} is an ancient being with vast knowledge who speaks cryptically.',
				depth: 4,
				role: 'system'
			},
			tracker_enhanced: {
				default_tracked: true,
				custom_fields: {}
			}
		}
	}
};
export const testGroupData = {
	name: 'Test Adventure Party',
	members: [], // Will be populated with actual character avatars during testing
	avatar_url: '', // Will use default avatar
	allow_self_responses: false,
	activation_strategy: 0, // NATURAL
	generation_mode: 0, // SWAP
	disabled_members: [],
	chat_metadata: {
		scenario: 'The party gathers at the tavern to plan their next adventure.'
	},
	fav: false,
	auto_mode_delay: 5,
	generation_mode_join_prefix: '### {{char}}:\n',
	generation_mode_join_suffix: '\n\n',
	tracker_enhanced_metadata: {
		party_name: 'The Silver Wanderers',
		party_level: 5,
		current_quest: 'Investigate the mysterious disappearances in the northern villages',
		party_gold: 1500,
		party_reputation: 'Respected'
	}
};
