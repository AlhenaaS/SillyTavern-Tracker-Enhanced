import { extensionSettings } from "../../../index.js";
import { TrackerPromptMaker } from "./trackerPromptMaker.js";

export class TrackerContentRenderer {
	constructor() {
		this.schema = extensionSettings.trackerDef;
	}

	get FIELD_TYPES() {
		const types = { ...TrackerPromptMaker.FIELD_TYPES };
		Object.keys(types).forEach((key) => {
			types[key] = key;
		});
		return types;
	}

	/**
	 * Generates a default hierarchical view of the tracker fields.
	 * @param {object} tracker - The tracker data object.
	 * @returns {HTMLElement} - The root element containing the rendered view.
	 */
	renderDefaultView(tracker, options = {}) {
		const includeInternal = options.includeInternal === true;
		const root = document.createElement("div");
		root.className = "tracker-view-container";

		const formatScalar = (val) => (typeof val === "undefined" || val === null ? "" : String(val));

		const createFields = (object, schema, parentElement, context = {}) => {
			const sourceObject = object && typeof object === "object" ? object : {};
			for (const [fieldId, fieldSchema] of Object.entries(schema)) {
				const metadata = fieldSchema.metadata || {};
				if ((!includeInternal && metadata.internalOnly) || (includeInternal && !metadata.internalOnly)) {
					continue;
				}

				const value = sourceObject[fieldSchema.name];
				const fieldType = fieldSchema.type;

				const wrapper = document.createElement("div");
				wrapper.className = "tracker-view-field";
				this.decorateFieldElement(wrapper, fieldId, fieldSchema, context);

				const label = document.createElement("span");
				label.className = "tracker-view-label";
				label.textContent = `${fieldSchema.name}: `;
				wrapper.appendChild(label);

				switch (fieldType) {
					case this.FIELD_TYPES.ARRAY:
					case this.FIELD_TYPES.ARRAY_OBJECT: {
						let arrayValue = value;
						if (fieldType === this.FIELD_TYPES.ARRAY_OBJECT) {
							arrayValue = value && typeof value === "object" ? Object.values(value) : [];
						}
						const arrayString = Array.isArray(arrayValue) ? arrayValue.join("; ") : "";
						const valueSpan = document.createElement("span");
						valueSpan.className = "tracker-view-value";
						valueSpan.textContent = arrayString;
						wrapper.appendChild(valueSpan);
						break;
					}
					case this.FIELD_TYPES.OBJECT: {
						if (value && typeof value === "object") {
							const nestedFields = document.createElement("div");
							nestedFields.className = "tracker-view-nested";
							createFields(value, fieldSchema.nestedFields, nestedFields, context);
							wrapper.appendChild(nestedFields);
						}
						break;
					}
					case this.FIELD_TYPES.FOR_EACH_OBJECT: {
						if (!value || typeof value !== "object" || Array.isArray(value)) {
							const valueSpan = document.createElement("span");
							valueSpan.className = "tracker-view-value";
							valueSpan.textContent = formatScalar(value);
							wrapper.appendChild(valueSpan);
							break;
						}

						const nestedFields = document.createElement("div");
						nestedFields.className = "tracker-view-nested";
						const isCharactersCollection = this.isCharactersField(fieldSchema);
						Object.entries(value).forEach(([nestedKey, nestedValue]) => {
							const forEachWrapper = document.createElement("div");
							forEachWrapper.className = "tracker-view-field";
							forEachWrapper.classList.add("tracker-view-collection-entry");
							forEachWrapper.dataset.collectionEntry = nestedKey;
							if (isCharactersCollection) {
								forEachWrapper.dataset.characterContainer = "true";
								forEachWrapper.dataset.characterEntry = nestedKey;
							}

							const forEachLabel = document.createElement("span");
							forEachLabel.className = "tracker-view-label";
							forEachLabel.textContent = `${nestedKey}: `;
							forEachWrapper.appendChild(forEachLabel);

							const forEachFields = document.createElement("div");
							forEachFields.className = "tracker-view-nested";
							if (isCharactersCollection) {
								forEachFields.dataset.characterEntry = nestedKey;
							}
							if (nestedValue && typeof nestedValue === "object") {
								const nestedContext = {
									...context,
									currentCharacterKey: isCharactersCollection ? nestedKey : context.currentCharacterKey,
								};
								createFields(nestedValue, fieldSchema.nestedFields, forEachFields, nestedContext);
							}
							forEachWrapper.appendChild(forEachFields);
							nestedFields.appendChild(forEachWrapper);
						});
						wrapper.appendChild(nestedFields);
						break;
					}
					case this.FIELD_TYPES.FOR_EACH_ARRAY: {
						if (!value || typeof value !== "object") {
							const valueSpan = document.createElement("span");
							valueSpan.className = "tracker-view-value";
							valueSpan.textContent = formatScalar(value);
							wrapper.appendChild(valueSpan);
							break;
						}

						const nestedFields = document.createElement("div");
						nestedFields.className = "tracker-view-nested";

						Object.entries(value).forEach(([nestedKey, nestedValue]) => {
							// nestedValue is expected to be an array
							const forEachWrapper = document.createElement("div");
							forEachWrapper.className = "tracker-view-field";

							const forEachLabel = document.createElement("span");
							forEachLabel.className = "tracker-view-label";
							forEachLabel.textContent = `${nestedKey}: `;
							forEachWrapper.appendChild(forEachLabel);

							const forEachFields = document.createElement("div");
							forEachFields.className = "tracker-view-nested";

							// Determine if single string field or multiple fields
							const nestedFieldValues = Object.values(fieldSchema.nestedFields);
							const singleStringField = nestedFieldValues.length === 1 && nestedFieldValues[0].type === this.FIELD_TYPES.STRING;

							if (singleStringField) {
								// Arrays of strings
								const arrayString = Array.isArray(nestedValue) ? nestedValue.join("; ") : "";
								const valueSpan = document.createElement("span");
								valueSpan.className = "tracker-view-value";
								valueSpan.textContent = arrayString;
								forEachFields.appendChild(valueSpan);
							} else {
								// Arrays of objects
								if (Array.isArray(nestedValue)) {
									nestedValue.forEach((arrItem, arrIndex) => {
										const arrItemWrapper = document.createElement("div");
										arrItemWrapper.className = "tracker-view-field";

										const arrItemLabel = document.createElement("span");
										arrItemLabel.className = "tracker-view-label";
										arrItemLabel.textContent = `[${arrIndex}]: `;
										arrItemWrapper.appendChild(arrItemLabel);

										const arrItemFields = document.createElement("div");
										arrItemFields.className = "tracker-view-nested";
										if (arrItem && typeof arrItem === "object") {
											createFields(arrItem, fieldSchema.nestedFields, arrItemFields, context);
										}

										arrItemWrapper.appendChild(arrItemFields);
										forEachFields.appendChild(arrItemWrapper);
									});
								}
							}

							forEachWrapper.appendChild(forEachFields);
							nestedFields.appendChild(forEachWrapper);
						});

						wrapper.appendChild(nestedFields);
						break;
					}
					default: {
						const valueSpan = document.createElement("span");
						valueSpan.className = "tracker-view-value";
						valueSpan.textContent = typeof value === "undefined" || value === null ? "" : value;
						wrapper.appendChild(valueSpan);
						break;
					}
				}

				parentElement.appendChild(wrapper);
			}
		};

		createFields(tracker, this.schema, root);

		if (!includeInternal) {
			this.applyGenderVisibility(root, tracker, { mode: "view" });
		}

		return root;
	}

	/**
	 * Generates an editable representation of the tracker fields in an inline format.
	 * @param {object} tracker - The tracker data object.
	 * @param {function} onUpdate - Callback function to pass the updated tracker object.
	 * @returns {HTMLElement} - The root element containing the editor view.
	 */
	renderEditorView(tracker, onUpdate) {
		const root = document.createElement("div");
		root.className = "tracker-editor-container";

		function adjustTextareaHeight(textarea) {
			textarea.style.minHeight = "0px";
			textarea.style.overflowY = "hidden";
			textarea.style.height = "0px";
			textarea.style.height = textarea.scrollHeight + "px";
		}

		const createAutoResizingTextarea = (value, onChange) => {
			const textarea = document.createElement("textarea");
			textarea.className = "tracker-editor-textarea";
			textarea.value = value || "";

			textarea.style.minHeight = "0px";
			textarea.style.overflowY = "hidden";
			textarea.style.resize = "none";

			const adjust = () => adjustTextareaHeight(textarea);

			requestAnimationFrame(adjust);

			textarea.addEventListener("input", (event) => {
				let newValue = event.target.value.replace(/"/g, "'");
				if (newValue !== event.target.value) {
					toastr.warning("Double quotes are not allowed and have been replaced with single quotes.");
					event.target.value = newValue;
				}
				onChange(newValue);
				adjust();
			});

			return textarea;
		};

		const propagateUpdate = () => {
			onUpdate(tracker);
			this.applyGenderVisibility(root, tracker, { mode: "edit" });
		};

		const createEditorFields = (object, schema, parentElement, context = {}) => {
			for (const [fieldId, fieldSchema] of Object.entries(schema)) {
				const metadata = fieldSchema.metadata || {};
				if (metadata.internalOnly) {
					continue;
				}

				const value = object[fieldSchema.name];
				const fieldType = fieldSchema.type;

				const wrapper = document.createElement("div");
				wrapper.className = "tracker-editor-field";
				this.decorateFieldElement(wrapper, fieldId, fieldSchema, context);

				const label = document.createElement("label");
				label.className = "tracker-editor-label";
				label.textContent = `${fieldSchema.name}: `;
				wrapper.appendChild(label);

				switch (fieldType) {
					case this.FIELD_TYPES.ARRAY: {
						const arrayValue = Array.isArray(value) ? value : [];
						object[fieldSchema.name] = arrayValue;

						const listContainer = document.createElement("div");
						listContainer.className = "tracker-editor-list";

						arrayValue.forEach((itemValue, index) => {
							const itemWrapper = document.createElement("div");
							itemWrapper.className = "tracker-editor-list-item";

							const textarea = createAutoResizingTextarea(itemValue, (newVal) => {
								arrayValue[index] = newVal;
								propagateUpdate();
							});
							itemWrapper.appendChild(textarea);

							const removeButton = document.createElement("button");
							removeButton.className = "menu_button interactable";
							removeButton.textContent = "Remove";
							removeButton.addEventListener("click", () => {
								arrayValue.splice(index, 1);
								propagateUpdate();
								root.replaceWith(this.renderEditorView(tracker, onUpdate));
							});
							itemWrapper.appendChild(removeButton);

							listContainer.appendChild(itemWrapper);
						});

						const addButton = document.createElement("button");
						addButton.className = "menu_button interactable";
						addButton.textContent = "Add Item";
						addButton.addEventListener("click", () => {
							arrayValue.push("");
							propagateUpdate();
							root.replaceWith(this.renderEditorView(tracker, onUpdate));
						});
						listContainer.appendChild(addButton);

						wrapper.appendChild(listContainer);
						break;
					}
					case this.FIELD_TYPES.ARRAY_OBJECT:
					case this.FIELD_TYPES.OBJECT: {
						const nestedObject = value || {};
						object[fieldSchema.name] = nestedObject;

						const nestedFields = document.createElement("div");
						nestedFields.className = "tracker-editor-nested";
						createEditorFields(nestedObject, fieldSchema.nestedFields, nestedFields, context);
						wrapper.appendChild(nestedFields);
						break;
					}
					case this.FIELD_TYPES.FOR_EACH_OBJECT: {
						const objectValue = value || {};
						object[fieldSchema.name] = objectValue;

						const nestedFields = document.createElement("div");
						nestedFields.className = "tracker-editor-nested";

						const createDefaultValues = (schemaMap) => {
							const obj = {};
							for (const nestedField of Object.values(schemaMap)) {
								switch (nestedField.type) {
									case this.FIELD_TYPES.STRING:
										obj[nestedField.name] = nestedField.defaultValue || "";
										break;
									case this.FIELD_TYPES.ARRAY:
										obj[nestedField.name] = nestedField.defaultValue || [];
										break;
									case this.FIELD_TYPES.OBJECT:
										obj[nestedField.name] = createDefaultValues(nestedField.nestedFields);
										break;
									default:
										obj[nestedField.name] = nestedField.defaultValue || "";
								}
							}
							return obj;
						};

						const isCharactersCollection = this.isCharactersField(fieldSchema);

						Object.entries(objectValue).forEach(([nestedKey, nestedValue]) => {
							const itemWrapper = document.createElement("div");
							itemWrapper.className = "tracker-editor-field";
							itemWrapper.classList.add("tracker-editor-collection-entry");
							itemWrapper.dataset.collectionEntry = nestedKey;
							if (isCharactersCollection) {
								itemWrapper.dataset.characterContainer = "true";
								itemWrapper.dataset.characterEntry = nestedKey;
							}

							const keyLabel = document.createElement("label");
							keyLabel.className = "tracker-editor-label";
							keyLabel.textContent = `${nestedKey}: `;
							itemWrapper.appendChild(keyLabel);

							const removeButton = document.createElement("button");
							removeButton.className = "menu_button interactable";
							removeButton.textContent = "Remove";
							removeButton.addEventListener("click", () => {
								delete objectValue[nestedKey];
								propagateUpdate();
								itemWrapper.remove();
							});

							const forEachFields = document.createElement("div");
							forEachFields.className = "tracker-editor-nested";
							if (isCharactersCollection) {
								forEachFields.dataset.characterEntry = nestedKey;
							}
							const nestedContext = {
								...context,
								currentCharacterKey: isCharactersCollection ? nestedKey : context.currentCharacterKey,
							};
							createEditorFields(nestedValue, fieldSchema.nestedFields, forEachFields, nestedContext);
							forEachFields.appendChild(removeButton);
							itemWrapper.appendChild(forEachFields);

							nestedFields.appendChild(itemWrapper);
						});

						const addButton = document.createElement("button");
						addButton.className = "menu_button interactable";
						addButton.textContent = "Add Item";
						addButton.addEventListener("click", () => {
							const newKey = prompt("Enter key for new item:");
							if (!newKey) {
								return;
							}
							if (Object.prototype.hasOwnProperty.call(objectValue, newKey)) {
								alert("An item with that key already exists.");
								return;
							}

							const newObject = createDefaultValues(fieldSchema.nestedFields);
							objectValue[newKey] = newObject;
							propagateUpdate();

							const itemWrapper = document.createElement("div");
							itemWrapper.className = "tracker-editor-field";
							itemWrapper.classList.add("tracker-editor-collection-entry");
							itemWrapper.dataset.collectionEntry = newKey;
							if (isCharactersCollection) {
								itemWrapper.dataset.characterContainer = "true";
								itemWrapper.dataset.characterEntry = newKey;
							}

							const keyLabel = document.createElement("label");
							keyLabel.className = "tracker-editor-label";
							keyLabel.textContent = `${newKey}: `;
							itemWrapper.appendChild(keyLabel);

							const removeButton = document.createElement("button");
							removeButton.className = "menu_button interactable";
							removeButton.textContent = "Remove";
							removeButton.addEventListener("click", () => {
								delete objectValue[newKey];
								propagateUpdate();
								itemWrapper.remove();
							});

							const forEachFields = document.createElement("div");
							forEachFields.className = "tracker-editor-nested";
							if (isCharactersCollection) {
								forEachFields.dataset.characterEntry = newKey;
							}
							const newContext = {
								...context,
								currentCharacterKey: isCharactersCollection ? newKey : context.currentCharacterKey,
							};
							createEditorFields(newObject, fieldSchema.nestedFields, forEachFields, newContext);
							forEachFields.appendChild(removeButton);
							itemWrapper.appendChild(forEachFields);

							nestedFields.insertBefore(itemWrapper, addButton);
						});

						nestedFields.appendChild(addButton);
						wrapper.appendChild(nestedFields);
						break;
					}
					case this.FIELD_TYPES.FOR_EACH_ARRAY: {
						const objectValue = value || {};
						object[fieldSchema.name] = objectValue;

						const nestedFields = document.createElement("div");
						nestedFields.className = "tracker-editor-nested";

						const nestedFieldValues = Object.values(fieldSchema.nestedFields);
						const singleStringField = nestedFieldValues.length === 1 && nestedFieldValues[0].type === this.FIELD_TYPES.STRING;

						const createDefaultValues = (schemaMap) => {
							const obj = {};
							for (const nestedField of Object.values(schemaMap)) {
								switch (nestedField.type) {
									case this.FIELD_TYPES.STRING:
										obj[nestedField.name] = nestedField.defaultValue || "";
										break;
									case this.FIELD_TYPES.ARRAY:
										obj[nestedField.name] = nestedField.defaultValue || [];
										break;
									case this.FIELD_TYPES.OBJECT:
										obj[nestedField.name] = createDefaultValues(nestedField.nestedFields);
										break;
									default:
										obj[nestedField.name] = nestedField.defaultValue || "";
								}
							}
							return obj;
						};

						const createDefaultArrayItem = () => {
							if (singleStringField) {
								return "";
							}
							return createDefaultValues(fieldSchema.nestedFields);
						};

						Object.entries(objectValue).forEach(([nestedKey, arrayValue]) => {
							if (!Array.isArray(arrayValue)) {
								arrayValue = [];
								objectValue[nestedKey] = arrayValue;
							}

							const itemWrapper = document.createElement("div");
							itemWrapper.className = "tracker-editor-field";

							const keyLabel = document.createElement("label");
							keyLabel.className = "tracker-editor-label";
							keyLabel.textContent = `${nestedKey}: `;
							itemWrapper.appendChild(keyLabel);

							const removeKeyButton = document.createElement("button");
							removeKeyButton.className = "menu_button interactable";
							removeKeyButton.textContent = "Remove Key";
							removeKeyButton.addEventListener("click", () => {
								delete objectValue[nestedKey];
								propagateUpdate();
								itemWrapper.remove();
							});
							itemWrapper.appendChild(removeKeyButton);

							const arrayContainer = document.createElement("div");
							arrayContainer.className = "tracker-editor-nested";

							arrayValue.forEach((arrItem, arrIndex) => {
								const arrItemWrapper = document.createElement("div");
								arrItemWrapper.className = "tracker-editor-field";

								const arrItemLabel = document.createElement("span");
								arrItemLabel.className = "tracker-editor-label";
								arrItemLabel.textContent = `[${arrIndex}]: `;
								arrItemWrapper.appendChild(arrItemLabel);

								if (singleStringField) {
									const textarea = createAutoResizingTextarea(arrItem, (newVal) => {
										arrayValue[arrIndex] = newVal;
										propagateUpdate();
									});
									arrItemWrapper.appendChild(textarea);
								} else {
									if (typeof arrItem !== "object" || arrItem === null) {
										arrItem = createDefaultArrayItem();
										arrayValue[arrIndex] = arrItem;
									}
									const arrItemFields = document.createElement("div");
									arrItemFields.className = "tracker-editor-nested";
									createEditorFields(arrItem, fieldSchema.nestedFields, arrItemFields, context);
									arrItemWrapper.appendChild(arrItemFields);
								}

								const removeItemButton = document.createElement("button");
								removeItemButton.className = "menu_button interactable";
								removeItemButton.textContent = "Remove Item";
								removeItemButton.addEventListener("click", () => {
									arrayValue.splice(arrIndex, 1);
									propagateUpdate();
									root.replaceWith(this.renderEditorView(tracker, onUpdate));
								});
								arrItemWrapper.appendChild(removeItemButton);

								arrayContainer.appendChild(arrItemWrapper);
							});

							const addItemButton = document.createElement("button");
							addItemButton.className = "menu_button interactable";
							addItemButton.textContent = "Add Item";
							addItemButton.addEventListener("click", () => {
								arrayValue.push(createDefaultArrayItem());
								propagateUpdate();
								root.replaceWith(this.renderEditorView(tracker, onUpdate));
							});
							arrayContainer.appendChild(addItemButton);

							itemWrapper.appendChild(arrayContainer);
							nestedFields.appendChild(itemWrapper);
						});

						const addKeyButton = document.createElement("button");
						addKeyButton.className = "menu_button interactable";
						addKeyButton.textContent = "Add Key";
						addKeyButton.addEventListener("click", () => {
							const newKey = prompt("Enter key for new array:");
							if (!newKey) {
								return;
							}
							if (Object.prototype.hasOwnProperty.call(objectValue, newKey)) {
								alert("A key with that name already exists.");
								return;
							}
							objectValue[newKey] = [];
							propagateUpdate();
							root.replaceWith(this.renderEditorView(tracker, onUpdate));
						});

						nestedFields.appendChild(addKeyButton);
						wrapper.appendChild(nestedFields);
						break;
					}
					default: {
						const textarea = createAutoResizingTextarea(value, (newVal) => {
							object[fieldSchema.name] = newVal;
							propagateUpdate();
						});
						wrapper.appendChild(textarea);
						break;
					}
				}

				parentElement.appendChild(wrapper);
			}
		};

		createEditorFields(tracker, this.schema, root);

		if (tracker._extraFields !== undefined) {
			const extraFieldsWrapper = document.createElement("div");
			extraFieldsWrapper.className = "tracker-editor-field";

			const extraLabel = document.createElement("label");
			extraLabel.className = "tracker-editor-label";
			extraLabel.textContent = "_extraFields: ";
			extraFieldsWrapper.appendChild(extraLabel);

			let displayValue = typeof tracker._extraFields === "object" ? JSON.stringify(tracker._extraFields, null, 2) : tracker._extraFields;

			const extraTextarea = document.createElement("textarea");
			extraTextarea.className = "tracker-editor-textarea";
			extraTextarea.value = displayValue;

			const adjustExtraTextareaHeight = (textarea) => {
				textarea.style.height = "auto";
				textarea.style.height = textarea.scrollHeight + "px";
			};

			requestAnimationFrame(() => adjustExtraTextareaHeight(extraTextarea));

			extraTextarea.addEventListener("input", (event) => {
				const content = event.target.value.trim();
				if (content === "") {
					delete tracker._extraFields;
				} else {
					try {
						tracker._extraFields = JSON.parse(content);
					} catch (e) {
						tracker._extraFields = content;
					}
				}
				propagateUpdate();
				adjustExtraTextareaHeight(event.target);
			});

			extraFieldsWrapper.appendChild(extraTextarea);
			root.appendChild(extraFieldsWrapper);
		}

		this.applyGenderVisibility(root, tracker, { mode: "edit" });
		return root;
	}

	isCharactersField(fieldSchema) {
		if (!fieldSchema || typeof fieldSchema !== "object") {
			return false;
		}
		const metadata = fieldSchema.metadata || {};
		if (metadata.internalKeyId === "characters") {
			return true;
		}
		const fieldName = typeof fieldSchema.name === "string" ? fieldSchema.name.toLowerCase() : "";
		return fieldName === "characters";
	}

	decorateFieldElement(element, fieldId, fieldSchema, context = {}) {
		if (!element || !fieldSchema) {
			return;
		}

		if (fieldId) {
			element.dataset.fieldId = fieldId;
		}

		if (fieldSchema.name) {
			element.dataset.fieldName = fieldSchema.name;
		}

		const metadata = fieldSchema.metadata || {};
		if (metadata.internalKeyId) {
			element.dataset.internalKeyId = metadata.internalKeyId;
		}

		if (fieldSchema.genderSpecific && fieldSchema.genderSpecific !== "all") {
			element.dataset.genderSpecific = fieldSchema.genderSpecific;
		} else {
			delete element.dataset.genderSpecific;
		}

		if (context.currentCharacterKey) {
			element.dataset.characterEntry = context.currentCharacterKey;
		}
	}

	applyGenderVisibility(root, tracker, options = {}) {
		if (!root) {
			return;
		}

		const includeInternal = options.includeInternal === true;
		this.resetGenderVisibility(root);

		if (includeInternal) {
			return;
		}

		const characters = tracker && tracker.Characters;
		if (!characters || typeof characters !== "object") {
			return;
		}

		const containers = root.querySelectorAll("[data-character-container='true']");
		containers.forEach((container) => {
			const characterKey = container.dataset.characterEntry || container.dataset.collectionEntry;
			if (!characterKey) {
				return;
			}

			const characterData = characters[characterKey] || {};
			const genderValue = characterData.Gender || characterData.gender || "";
			const genderFlags = this.extractGenderFlags(genderValue);

			const fields = container.querySelectorAll("[data-gender-specific]");
			fields.forEach((fieldElement) => {
				const requirement = (fieldElement.dataset.genderSpecific || "").toLowerCase();
				if (!requirement || requirement === "all") {
					return;
				}

				if (this.shouldHideForGender(requirement, genderFlags)) {
					fieldElement.classList.add("tracker-gender-hidden");
					fieldElement.style.display = "none";
					fieldElement.setAttribute("aria-hidden", "true");
				}
			});
		});
	}

	resetGenderVisibility(root) {
		root.querySelectorAll("[data-gender-specific]").forEach((element) => {
			element.classList.remove("tracker-gender-hidden");
			element.style.display = "";
			element.removeAttribute("aria-hidden");
		});
	}

	extractGenderFlags(value) {
		const text = typeof value === "string" ? value : "";
		const normalized = text.toLowerCase();
		const containsAny = (haystack, symbols) => symbols.some((symbol) => haystack.includes(symbol));

		const femaleSymbols = ["♀", "♀️", "\u2640", "\u2640\uFE0F"];
		const maleSymbols = ["♂", "♂️", "\u2642", "\u2642\uFE0F"];
		const transSymbols = ["⚧", "⚧️", "\u26A7", "\u26A7\uFE0F"];

		const isFemale = containsAny(text, femaleSymbols) || normalized.includes("female") || normalized.includes("woman");
		const isMale = containsAny(text, maleSymbols) || normalized.includes("male") || normalized.includes("man");
		const isTrans = containsAny(text, transSymbols) || normalized.includes("trans");

		return {
			female: Boolean(isFemale),
			male: Boolean(isMale),
			trans: Boolean(isTrans),
		};
	}

	shouldHideForGender(requirement, flags) {
		switch (requirement) {
			case "female":
				return !flags.female;
			case "male":
				return !flags.male;
			case "trans":
				return !flags.trans;
			default:
				return false;
		}
	}

	/**
	 * Renders the tracker data using a custom template.
	 * Supports nested loops and conditionals.
	 * @param {object} tracker - The tracker data object.
	 * @param {string} template - The custom template string.
	 * @returns {HTMLElement} - The root element containing the rendered template.
	 */
	renderFromTemplate(tracker, template) {
		const root = document.createElement("div");
		root.className = "tracker-template-container";

		const renderedHTML = this.renderTemplateString(template, tracker);
		root.innerHTML = renderedHTML;
		return root.outerHTML;
	}

	/**
	 * Processes the template string and replaces placeholders with tracker data.
	 * Supports nested loops and conditionals.
	 * @param {string} template - The template string.
	 * @param {object} data - The tracker data object.
	 * @returns {string} - The processed template string.
	 */
	renderTemplateString(template, data) {
		const tokens = this.tokenizeTemplate(template);
		return this.processTokens(tokens, data);
	}

	/**
	 * Tokenizes the template string into an array of tokens.
	 * @param {string} template - The template string.
	 * @returns {Array} - The array of tokens.
	 */
	tokenizeTemplate(template) {
		const tokens = [];
		const regex = /{{\s*(\/?)\s*(#?)\s*([\w.]+|\^)\s*(.*?)\s*}}/g;
		let cursor = 0;
		let match;

		while ((match = regex.exec(template)) !== null) {
			const index = match.index;

			// Add text tokens between placeholders.
			if (index > cursor) {
				tokens.push({
					type: "text",
					value: template.slice(cursor, index),
				});
			}

			const [fullMatch, closingSlash, hash, tag, params] = match;

			if (closingSlash) {
				// End tag token (e.g., {{/if}})
				tokens.push({
					type: "end",
					tag: tag.trim(),
				});
			} else if (hash) {
				// Start tag token (e.g., {{#if condition}})
				tokens.push({
					type: "start",
					tag: tag.trim(),
					params: params.trim(),
				});
			} else {
				// Variable token (e.g., {{variable}})
				tokens.push({
					type: "variable",
					value: tag.trim(),
				});
			}

			cursor = index + fullMatch.length;
		}

		// Add any remaining text after the last placeholder.
		if (cursor < template.length) {
			tokens.push({
				type: "text",
				value: template.slice(cursor),
			});
		}

		return tokens;
	}

	/**
	 * Processes the tokens recursively to generate the final string.
	 * @param {Array} tokens - The array of tokens.
	 * @param {object} data - The tracker data object.
	 * @param {object} [context={}] - The context object for scope management.
	 * @returns {string} - The processed string.
	 */
	processTokens(tokens, data, context = {}) {
		let result = "";

		while (tokens.length > 0) {
			const token = tokens.shift();

			if (token.type === "text") {
				// Append plain text to the result.
				result += token.value;
			} else if (token.type === "variable") {
				// Replace variable placeholders with actual data.
				let value = this.getValue(token.value, data, context);

				// Handle objects in variable tokens
				if (typeof value === "object" && value !== null) {
					if ("name" in value) {
						value = value.name;
					} else if ("id" in value) {
						value = value.id;
					} else {
						value = context._key; // Fallback to the parent key
					}
				}
				result += value !== undefined ? value : "";
			} else if (token.type === "start") {
				if (token.tag === "if") {
					// Handle conditional blocks.
					const condition = token.params;
					const [innerTokens, remainingTokens] = this.extractInnerTokens(tokens, "if");
					const conditionMet = this.evaluateCondition(condition, data, context);

					if (conditionMet) {
						result += this.processTokens(innerTokens, data, context);
					}

					tokens = remainingTokens;
				} else if (token.tag === "foreach") {
					// Handle loop blocks.
					const params = token.params.split(/\s+/);
					const collectionName = params[0];
					const itemName = params[1];

					const collection = this.getValue(collectionName, data, context);

					if (collection && typeof collection === "object") {
						const [innerTokens, remainingTokens] = this.extractInnerTokens(tokens, "foreach");

						const items = Array.isArray(collection) ? collection : Object.entries(collection);

						items.forEach(([key, item], index) => {
							const newContext = {
								...context,
								[itemName]: item,
								index,
								_key: key,
							};
							result += this.processTokens([...innerTokens], data, newContext);
						});

						tokens = remainingTokens;
					} else {
						// Skip the foreach block if the collection is empty or not an object.
						const [, remainingTokens] = this.extractInnerTokens(tokens, "foreach");
						tokens = remainingTokens;
					}
				} else if (token.tag === "join") {
					// Handle join operations.
					const params = token.params.match(/^(['"])(.*?)\1\s+(.+)$/);
					if (params) {
						const separator = params[2];
						const arrayName = params[3];
						const array = this.getValue(arrayName, data, context);

						if (Array.isArray(array)) {
							result += array.join(separator);
						} else if (array && typeof array === "object" && !Array.isArray(array)) {
							result += Object.values(array).join(separator);
						}
					}
					// 'join' does not require an end tag.
				}
			} else if (token.type === "end") {
				// End tokens are handled during the extraction of inner tokens.
				continue;
			}
		}

		return result;
	}

	/**
	 * Extracts inner tokens until the matching end tag is found.
	 * @param {Array} tokens - The array of tokens.
	 * @param {string} tagName - The tag name to match.
	 * @returns {Array} - An array containing inner tokens and remaining tokens.
	 * @throws {Error} - Throws an error if the end tag is not found.
	 */
	extractInnerTokens(tokens, tagName) {
		let nested = 1;
		const innerTokens = [];

		while (tokens.length > 0) {
			const token = tokens.shift();

			if (token.type === "start" && token.tag === tagName) {
				nested++;
			} else if (token.type === "end" && token.tag === tagName) {
				nested--;
				if (nested === 0) {
					return [innerTokens, tokens];
				}
			}
			innerTokens.push(token);
		}

		throw new Error(`Unmatched {{#${tagName}}}`);
	}

	/**
	 * Retrieves the value of a variable from data or context.
	 * Supports string operations.
	 * @param {string} variable - The variable name (can be nested using dot notation).
	 * @param {object} data - The tracker data object.
	 * @param {object} context - The context object.
	 * @returns {*} - The value of the variable or undefined if not found.
	 */
	getValue(variable, data, context) {
		const [path, ...operations] = variable.split("|").map((part) => part.trim());
		const parts = path.split(".");
		let value = Object.hasOwn(context, parts[0]) ? context[parts[0]] : data[parts[0]];

		for (let i = 1; i < parts.length; i++) {
			if (value && typeof value === "object" && parts[i] in value) {
				value = value[parts[i]];
			} else {
				return undefined;
			}
		}

		// Apply string operations if any
		if (typeof value === "string") {
			if (operations.length > 0) {
				value = this.applyStringOperations(value, operations);
			}
			// Sanitize for HTML
			value = value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}

		return value;
	}

	/**
	 * Applies string operations to a value.
	 * @param {string} value - The string value.
	 * @param {Array} operations - Array of operations to apply.
	 * @returns {string} - The transformed string.
	 */
	applyStringOperations(value, operations) {
		operations.forEach((operation) => {
			if (operation === "toUpperCase()") {
				value = value.toUpperCase();
			} else if (operation === "toLowerCase()") {
				value = value.toLowerCase();
			} else if (operation === "trim()") {
				value = value.trim();
			} else if (operation.startsWith("substring(")) {
				const args = operation.match(/substring\((\d+),\s*(\d+)\)/);
				if (args) {
					const start = parseInt(args[1], 10);
					const end = parseInt(args[2], 10);
					value = value.substring(start, end);
				}
			}
			// Add more string operations as needed
		});
		return value;
	}

	/**
	 * Evaluates a condition for the {{#if}} tag.
	 * Supports comparison operators.
	 * @param {string} condition - The condition string.
	 * @param {object} data - The tracker data object.
	 * @param {object} context - The context object.
	 * @returns {boolean} - The result of the condition evaluation.
	 */
	evaluateCondition(condition, data, context) {
		const operators = ["==", "!=", ">", "<", ">=", "<="];
		let operatorFound = null;

		for (const op of operators) {
			if (condition.includes(op)) {
				operatorFound = op;
				break;
			}
		}

		if (operatorFound) {
			const [left, right] = condition.split(operatorFound).map((part) => part.trim());
			const leftValue = this.getValue(left, data, context);
			const rightValue = right.replace(/^['"]|['"]$/g, ""); // Remove quotes

			switch (operatorFound) {
				case "==":
					return leftValue == rightValue;
				case "!=":
					return leftValue != rightValue;
				case ">":
					return leftValue > rightValue;
				case "<":
					return leftValue < rightValue;
				case ">=":
					return leftValue >= rightValue;
				case "<=":
					return leftValue <= rightValue;
				default:
					return false;
			}
		} else {
			// If no operator, check truthiness
			const value = this.getValue(condition, data, context);
			return !!value;
		}
	}
}
