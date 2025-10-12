import { t } from "../../../lib/i18n.js";
import { debug, error, warn } from "../../../lib/utils.js";
import { TrackerTemplateGenerator } from "./trackerTemplateGenerator.js";

export class TrackerPromptMaker {
	/**
	 * Constructor for TrackerPromptMaker.
	 * @param {Object} existingObject - Optional existing JSON object to prepopulate the component.
	 * @param {Function} onTrackerPromptSave - Callback function invoked when the backend object is updated.
	 */
	constructor(existingObject = {}, onTrackerPromptSave = () => {}) {
		this.backendObject = {}; // Internal representation of the prompt structure.
		this.onTrackerPromptSave = onTrackerPromptSave; // Save callback.
		this.element = $('<div class="tracker-prompt-maker"></div>'); // Root element of the component.
		this.fieldCounter = 0; // Counter to generate unique field IDs.
		this.showInternalFields = false;
		this.init(existingObject); // Initialize the component.
	}

	static get FIELD_TYPES() {
		return {
			STRING: "String",
			ARRAY: "Array",
			OBJECT: "Object",
			FOR_EACH_OBJECT: "For Each Object",
			FOR_EACH_ARRAY: "For Each Array",
			ARRAY_OBJECT: "Array Object",
		};
	}

	static get NESTING_FIELD_TYPES() {
		return ["OBJECT", "FOR_EACH_OBJECT", "FOR_EACH_ARRAY", "ARRAY_OBJECT"];
	}

	static get FIELD_PRESENCE_OPTIONS() {
		return {
			DYNAMIC: "Dynamic",
			STATIC: "Static",
		};
	}

	static get FIELD_INCLUDE_OPTIONS() {
		return {
			DYNAMIC: "dynamic",
			STATIC: "static",
			ALL: "all",
		};
	}

	/**
	 * Initializes the component by building the UI and populating with existing data if provided.
	 * @param {Object} existingObject - Optional existing JSON object.
	 */
	init(existingObject) {
		this.buildUI(); // Build the initial UI.
		if (Object.keys(existingObject).length > 0) {
			this.populateFromExistingObject(existingObject); // Prepopulate if data is provided.
		} else {
			// Initialize sortable after the UI is ready
			this.makeFieldsSortable(this.fieldsContainer, this.backendObject);
		}
	}

	/**
	 * Builds the main UI elements of the component.
	 */
	buildUI() {
		// Clear existing content in this.element to prevent duplication
		this.element.empty();

		const internalToggleWrapper = $('<div class="internal-toggle-wrapper"></div>');
		const internalToggleLabel = $(`
			<label class="show-internal-toggle">
				<span></span>
				<input type="checkbox" />
			</label>
		`);
		internalToggleLabel.find("span").text(t("trackerPromptMaker.toggle.showInternal", "Show internal keys"));
		this.internalToggleInput = internalToggleLabel.find("input");
		this.internalToggleInput.prop("checked", this.showInternalFields);
		this.internalToggleInput.on("change", (event) => {
			this.showInternalFields = $(event.currentTarget).is(":checked");
			this.updateInternalFieldVisibility();
		});
		internalToggleWrapper.append(internalToggleLabel);
		this.element.append(internalToggleWrapper);

		// Container for fields.
		this.fieldsContainer = $('<div class="fields-container"></div>');
		this.element.append(this.fieldsContainer);

		const buttonsWrapper = $('<div class="buttons-wrapper"></div>');

		// Button to add a new field.
		const addFieldBtn = $('<button class="menu_button interactable"></button>')
			.text(t("trackerPromptMaker.buttons.addField", "Add Field"))
			.on("click", () => {
				this.addField(); // Add field without specifying parent (top-level)
				this.syncBackendOrderWithDOM();
			});
		buttonsWrapper.append(addFieldBtn);

		// Button to generate template from current fields
		// const generateTemplateBtn = $('<button class="menu_button interactable generate-template-btn">Generate Message Template</button>')
		// 	.attr('title', 'Generate HTML template for message display based on current fields')
		// 	.on("click", () => {
		// 		this.generateTemplate();
		// 	});
		// buttonsWrapper.append(generateTemplateBtn);

		this.element.append(buttonsWrapper);
	}

	/**
	 * Makes a given container and its nested containers sortable.
	 * @param {jQuery} container - The container whose fields should be sortable.
	 * @param {Object} parentBackendObject - The corresponding backend object section.
	 */
    makeFieldsSortable(container, parentBackendObject) {
        let dragStartInfo = null;
        
        container.on("mousedown", "> .field-wrapper > .name-dynamic-type-wrapper > .drag-handle", (event) => {
            // Store drag start information for smart positioning
            const draggedElement = $(event.currentTarget).closest('.field-wrapper');
            const containerRect = container[0].getBoundingClientRect();
            const elementRect = draggedElement[0].getBoundingClientRect();
            
            dragStartInfo = {
                element: draggedElement,
                containerTop: containerRect.top,
                containerHeight: containerRect.height,
                elementTop: elementRect.top,
                elementBottom: elementRect.bottom,
                containerScrollTop: container[0].scrollTop || container.parent().scrollTop() || 0
            };
            
            container.css("height", `${container.height()}px`);
            container.addClass("dragging");
        });
    
        container.on("mouseup", "> .field-wrapper > .name-dynamic-type-wrapper > .drag-handle", function () {
            if (!container.hasClass("ui-sortable-helper")) {
                container.removeClass("dragging");
                container.css("height", "");
            }
            dragStartInfo = null;
        });
    
        container
            .sortable({
                items: "> .field-wrapper",
                handle: "> .name-dynamic-type-wrapper > .drag-handle", // Specify the drag handle
                axis: "y", // Lock movement to vertical axis
                tolerance: "intersect", // Use intersect location for placeholder positioning
                helper: (event, ui) => {
                    // Clone the element to create a helper
                    const helper = ui.clone();
					// Style the helper to show only the name-dynamic-type-wrapper
					helper.children(":not(.name-dynamic-type-wrapper)").hide(); // Hide all except name-dynamic-type-wrapper
					// Add visual enhancement for better visibility
					helper.addClass('ui-sortable-helper-enhanced');
                    return helper;
                },
                cursorAt: { top: 10, left: 10 }, // Adjust the cursor's position relative to the dragged element
                start: (event, ui) => {
                    this.handleSmartPositioning(dragStartInfo, container);
			},
				stop: () => {
					// Remove the dragging class and reset container height
					container.removeClass("dragging");
					container.css("height", ""); // Remove the fixed height
					// Reset any positioning adjustments
					this.resetSmartPositioning(container);
					this.syncBackendOrderWithDOM();
					dragStartInfo = null;
				},
            })
    }

    /**
     * Handles smart positioning when dragging starts from bottom of container
     * @param {Object} dragStartInfo - Information about the drag start position
     * @param {jQuery} container - The sortable container
     */
    handleSmartPositioning(dragStartInfo, container) {
        if (!dragStartInfo) return;
        
        const scrollableParent = this.findScrollableParent(container);
        if (!scrollableParent) return;
        
        // Calculate if the dragged item was in the bottom 40% of the visible area
        const visibleHeight = dragStartInfo.containerHeight;
        const elementRelativeTop = dragStartInfo.elementTop - dragStartInfo.containerTop;
        const isInBottomPortion = elementRelativeTop > (visibleHeight * 0.6);
        
        if (isInBottomPortion) {
            // Scroll to show the dragged element near the top of the container
            // This ensures both the item and drop zones are visible
            const targetScrollTop = dragStartInfo.containerScrollTop + (elementRelativeTop - visibleHeight * 0.2);
            
            // Smooth scroll to the new position
            scrollableParent.animate({
                scrollTop: Math.max(0, targetScrollTop)
            }, 200, 'swing');
            
            // Mark container for smart positioning state
            container.addClass('smart-positioning-active');
        }
    }

    /**
     * Finds the scrollable parent container
     * @param {jQuery} element - Starting element
     * @returns {jQuery|null} - Scrollable parent or null if not found
     */
    findScrollableParent(element) {
        // Check if the container itself is scrollable
        if (element.css('overflow-y') === 'scroll' || element.css('overflow-y') === 'auto') {
            return element;
        }
        
        // Look for scrollable parent up the DOM tree
        let parent = element.parent();
        while (parent.length && parent[0] !== document.body) {
            const overflowY = parent.css('overflow-y');
            if (overflowY === 'scroll' || overflowY === 'auto') {
                return parent;
            }
            parent = parent.parent();
        }
        
        // Fallback to checking if body or html is scrollable
        const $body = $('body');
        const $html = $('html');
        if ($body.css('overflow-y') === 'scroll' || $body.css('overflow-y') === 'auto') {
            return $body;
        }
        if ($html.css('overflow-y') === 'scroll' || $html.css('overflow-y') === 'auto') {
            return $html;
        }
        
        return null;
    }

    /**
     * Resets any smart positioning adjustments
     * @param {jQuery} container - The sortable container
     */
    resetSmartPositioning(container) {
        container.removeClass('smart-positioning-active');
    }
    
	/**
	 * Helper function to find a field's data object in the backendObject by fieldId.
	 * @param {string} fieldId - The ID of the field to find.
	 * @param {Object} obj - The current object to search within.
	 * @returns {Object|null} - The field data object or null if not found.
	 */
	getFieldDataById(fieldId, obj = this.backendObject) {
		for (const key in obj) {
			if (key === fieldId) {
				return obj[key];
			}
			if (obj[key].nestedFields) {
				const found = this.getFieldDataById(fieldId, obj[key].nestedFields);
				if (found) return found;
			}
		}
		return null;
	}

	normalizeFieldMetadata(metadata = {}, isNewField = false) {
		const parseBoolean = (value, defaultValue = false) => {
			if (typeof value === "boolean") {
				return value;
			}
			if (typeof value === "string") {
				const clean = value.trim().toLowerCase();
				if (clean === "true") return true;
				if (clean === "false") return false;
			}
			if (typeof value === "number") {
				return value !== 0;
			}
			if (typeof value === "object" && value !== null) {
				return defaultValue;
			}
			return defaultValue;
		};

		const normalized = {
			internal: parseBoolean(metadata.internal, false),
			external: Object.prototype.hasOwnProperty.call(metadata, "external")
				? parseBoolean(metadata.external, false)
				: true,
			internalKeyId: metadata.internalKeyId || null,
		};

		if (Object.prototype.hasOwnProperty.call(metadata, "internalOnly")) {
			normalized.internalOnly = parseBoolean(metadata.internalOnly, false);
		} else {
			normalized.internalOnly = normalized.internal && !normalized.external;
		}

		if (isNewField && metadata.internal === undefined && metadata.external === undefined && metadata.internalKeyId === undefined) {
			normalized.internal = false;
			normalized.external = true;
			normalized.internalOnly = false;
		}

		return normalized;
	}

	updateInternalFieldVisibility() {
		const showInternal = this.showInternalFields;
		if (!this.fieldsContainer) return;

		this.fieldsContainer.find(".field-wrapper").each((_, element) => {
			const wrapper = $(element);
			const metadata = wrapper.data("metadata") || {};
			const isInternalOnly = Boolean(metadata.internalOnly);
			if (isInternalOnly && !showInternal) {
				wrapper.hide();
			} else {
				wrapper.show();
			}
		});
	}

	createMetadataBadges(metadata) {
		const hasInternal = Boolean(metadata.internal);
		const hasExternal = Boolean(metadata.external);
		const hasKeyId = Boolean(metadata.internalKeyId);

		if (!hasInternal && !hasExternal && !hasKeyId) {
			return null;
		}

		const container = $('<div class="field-metadata-badges"></div>');

		if (hasInternal || hasExternal) {
			const badgeRow = $('<div class="field-metadata-row field-metadata-row--flags"></div>');
			badgeRow.append(`<span class="field-meta-label">${t("trackerPromptMaker.metadata.metaLabel", "Meta:")}</span>`);
			if (hasInternal) {
				badgeRow.append(`<span class="field-badge field-badge--internal">${t("trackerPromptMaker.metadata.internal", "Internal")}</span>`);
			}
			if (hasExternal) {
				badgeRow.append(`<span class="field-badge field-badge--external">${t("trackerPromptMaker.metadata.external", "External")}</span>`);
			}
			container.append(badgeRow);
		}

		if (hasKeyId) {
			const idRow = $('<div class="field-metadata-row field-metadata-row--id"></div>');
			idRow.append(`<span class="field-metadata-label">${t("trackerPromptMaker.metadata.internalKeyId", "internalKeyId:")}</span>`);
			idRow.append(`<span class="field-badge field-badge--id">${metadata.internalKeyId}</span>`);
			container.append(idRow);
		}

		return container;
	}

	normalizePresenceValue(presence) {
		const upper = typeof presence === "string" ? presence.toUpperCase() : "";
		return upper === "STATIC" ? "STATIC" : "DYNAMIC";
	}

	getPresenceLabel(presence) {
		const normalized = this.normalizePresenceValue(presence);
		const rawLabel = TrackerPromptMaker.FIELD_PRESENCE_OPTIONS[normalized] || TrackerPromptMaker.FIELD_PRESENCE_OPTIONS.DYNAMIC;
		return t(`trackerPromptMaker.presence.${normalized.toLowerCase()}`, rawLabel);
	}

	createPresenceBadge(presence) {
		const badge = $('<span class="field-badge field-badge--presence"></span>');
		this.applyPresenceBadgeState(badge, presence);
		return badge;
	}

	applyPresenceBadgeState(badge, presence) {
		if (!badge || badge.length === 0) {
			return;
		}
		const normalized = this.normalizePresenceValue(presence);
		badge
			.removeClass("field-badge--presence-dynamic field-badge--presence-static")
			.addClass(`field-badge--presence-${normalized.toLowerCase()}`)
			.text(this.getPresenceLabel(normalized));
	}

	setFieldPresenceOnWrapper(fieldWrapper, presence) {
		const normalized = this.normalizePresenceValue(presence);
		if (!fieldWrapper || fieldWrapper.length === 0) {
			return normalized;
		}

		fieldWrapper.attr("data-presence", normalized);
		const presenceContainer = fieldWrapper.find("> .name-dynamic-type-wrapper > .presence-wrapper");
		if (presenceContainer.length) {
			presenceContainer.attr("data-presence", normalized);
			let badge = presenceContainer.find(".field-badge--presence");
			if (badge.length === 0) {
				badge = this.createPresenceBadge(normalized);
				presenceContainer.append(badge);
			} else {
				this.applyPresenceBadgeState(badge, normalized);
			}
		}
		return normalized;
	}

	applyReadOnlyState(fieldWrapper, metadata) {
		const isDualScope = metadata.internal === true && metadata.external === true;

		if (!metadata.internalOnly && !isDualScope) {
			return;
		}

		const disableSelectors = [
			'.field-type-wrapper select',
			'.field-gender-specific select'
		];

		if (metadata.internalOnly) {
			fieldWrapper.find("input, textarea, select").prop("disabled", true);
			fieldWrapper.find(".menu_button").prop("disabled", true).addClass("disabled");
			fieldWrapper.find(".drag-handle").addClass("drag-handle--disabled").css("pointer-events", "none");
			fieldWrapper.addClass("field-wrapper--locked");
			return;
		}

		if (isDualScope) {
			const controlScope = fieldWrapper.children(".name-dynamic-type-wrapper");
			disableSelectors.forEach((selector) => {
				controlScope.find(selector).prop("disabled", true);
			});

			fieldWrapper.addClass("field-wrapper--locked-partial");
		}
	}

	/**
	 * Adds a new field to the component.
	 * @param {Object|null} parentObject - The parent object in the backendObject where the field should be added.
	 * @param {string|null} parentFieldId - ID of the parent field if adding a nested field.
	 * @param {Object} fieldData - Optional data to prepopulate the field.
	 * @param {string|null} fieldId - Optional field ID to use (maintains consistency when loading existing data).
	 * @param {boolean} [isNewField=true] - Flag indicating if the field is new or being loaded from existing data.
	 */
	addField(parentObject = null, parentFieldId = null, fieldData = {}, fieldId = null, isNewField = true) {
		if (!fieldId) {
			fieldId = `field-${this.fieldCounter++}`; // Generate a unique field ID.
		} else {
			// Ensure fieldCounter is ahead of field IDs
			const idNum = parseInt(fieldId.split("-")[1]);
			if (idNum >= this.fieldCounter) {
				this.fieldCounter = idNum + 1;
			}
		}

		fieldData.exampleValues = Array.isArray(fieldData.exampleValues) ? [...fieldData.exampleValues] : [];

		const metadata = this.normalizeFieldMetadata(fieldData.metadata, isNewField);
		fieldData.metadata = metadata;

		const labels = {
			fieldName: t("trackerPromptMaker.labels.fieldName", "Field Name:"),
			fieldNamePlaceholder: t("trackerPromptMaker.placeholders.fieldName", "Field Name"),
			presence: t("trackerPromptMaker.labels.presence", "Presence:"),
			fieldType: t("trackerPromptMaker.labels.fieldType", "Field Type:"),
			genderSpecific: t("trackerPromptMaker.labels.genderSpecific", "Gender Specific:"),
			prompt: t("trackerPromptMaker.labels.prompt", "Prompt or Note:"),
			promptPlaceholder: t("trackerPromptMaker.placeholders.prompt", "Prompt or Note"),
			defaultValue: t("trackerPromptMaker.labels.defaultValue", "Default Value:"),
			defaultValuePlaceholder: t("trackerPromptMaker.placeholders.defaultValue", "Default Value"),
			exampleValuesHeading: t("trackerPromptMaker.labels.exampleValues", "Example Values:"),
			addNestedField: t("trackerPromptMaker.buttons.addNestedField", "Add Nested Field"),
			addExampleValue: t("trackerPromptMaker.buttons.addExampleValue", "Add Example Value"),
			removeExampleValue: t("trackerPromptMaker.buttons.removeExampleValue", "Remove Example Value"),
			removeField: t("trackerPromptMaker.buttons.removeField", "Remove Field"),
		};

		const fieldTypeOptions = Object.entries(TrackerPromptMaker.FIELD_TYPES).map(([key, value]) => ({
			value: key,
			label: t(`trackerPromptMaker.fieldType.${key.toLowerCase()}`, value),
		}));

		const genderSpecificOptions = [
			{ value: "all", label: t("trackerPromptMaker.genderSpecific.all", "All Genders") },
			{ value: "female", label: t("trackerPromptMaker.genderSpecific.female", "Female Only") },
			{ value: "male", label: t("trackerPromptMaker.genderSpecific.male", "Male Only") },
			{ value: "trans", label: t("trackerPromptMaker.genderSpecific.trans", "Trans Only") },
		];

		const fieldWrapper = $('<div class="field-wrapper"></div>').attr("data-field-id", fieldId);
		fieldWrapper.data("metadata", metadata);
		if (metadata.internal) {
			fieldWrapper.addClass("field-wrapper--internal");
		}
		if (metadata.internalOnly) {
			fieldWrapper.addClass("field-wrapper--internal-only");
		}

		// Combined div for Field Name, Static/Dynamic Toggle, and Field Type Selector
		const nameDynamicTypeDiv = $('<div class="name-dynamic-type-wrapper"></div>');

		// Drag Handle
		const dragHandle = $('<span class="drag-handle">&#x2630;</span>'); // Unicode for hamburger icon
		nameDynamicTypeDiv.append(dragHandle);

		// Field Name Input with label
		const fieldNameLabel = $("<label></label>").text(labels.fieldName);
		const fieldNameInput = $('<input type="text" class="text_pole">')
			.attr("placeholder", labels.fieldNamePlaceholder)
			.val(fieldData.name || "")
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.validateFieldName(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const fieldNameDiv = $('<div class="field-name-wrapper"></div>').append(fieldNameLabel, fieldNameInput);

		// Presence Indicator with badge
		const presenceLabel = $("<span></span>").addClass("presence-label").text(labels.presence);
		const presenceDiv = $('<div class="presence-wrapper"></div>').append(presenceLabel);
		const presenceKey = this.normalizePresenceValue(fieldData.presence);

		// Field Type Selector with label
		const fieldTypeLabel = $("<label></label>").text(labels.fieldType);
		const fieldTypeKey = fieldData.type || "STRING";
		const fieldTypeSelector = $("<select></select>");
		fieldTypeOptions.forEach(({ value, label }) => {
			fieldTypeSelector.append($("<option></option>").attr("value", value).text(label));
		});
		fieldTypeSelector
			.val(fieldTypeKey)
			.on("change", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.selectFieldType(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const fieldTypeDiv = $('<div class="field-type-wrapper"></div>').append(fieldTypeLabel, fieldTypeSelector);

		// Gender Specific Selector with label (only for nested character fields)
		const genderSpecificLabel = $("<label></label>").text(labels.genderSpecific);
		const genderSpecificKey = fieldData.genderSpecific || "all";
		const genderSpecificSelector = $("<select></select>");
		genderSpecificOptions.forEach(({ value, label }) => {
			genderSpecificSelector.append($("<option></option>").attr("value", value).text(label));
		});
		genderSpecificSelector
			.val(genderSpecificKey)
			.on("change", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.updateGenderSpecific(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const genderSpecificDiv = $('<div class="gender-specific-wrapper"></div>').append(genderSpecificLabel, genderSpecificSelector);

		// Append field name, presence, and type selectors
		nameDynamicTypeDiv.append(fieldNameDiv, presenceDiv, fieldTypeDiv);

		const metaRowContainer = $('<div class="field-meta-row"></div>');
		genderSpecificDiv.addClass("field-gender-specific");
		metaRowContainer.append(genderSpecificDiv);

		const metadataBadges = this.createMetadataBadges(metadata);
		if (metadataBadges) {
			metaRowContainer.append(metadataBadges);
		}
		nameDynamicTypeDiv.append(metaRowContainer);

		// Append the combined div to fieldWrapper
		fieldWrapper.append(nameDynamicTypeDiv);
		fieldData.presence = this.setFieldPresenceOnWrapper(fieldWrapper, presenceKey);

		// Prompt, Default Value, and Example Values Wrapper
		const promptDefaultExampleWrapper = $('<div class="prompt-default-example-wrapper"></div>');

		// Prompt Input with label
		const promptLabel = $("<label></label>").text(labels.prompt);
		const promptInput = $('<textarea type="text" class="text_pole"></textarea>')
			.attr("placeholder", labels.promptPlaceholder)
			.val(fieldData.prompt || "")
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.updatePrompt(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const promptDiv = $('<div class="prompt-wrapper"></div>').append(promptLabel, promptInput);

		// Default and Example Wrapper
		const defaultExampleWrapper = $('<div class="default-example-wrapper"></div>');

		// Default Value Input with label
		const defaultValueLabel = $("<label></label>").text(labels.defaultValue);
		const defaultValueInput = $('<input type="text" class="text_pole">')
			.attr("placeholder", labels.defaultValuePlaceholder)
			.val(fieldData.defaultValue || "")
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				this.updateDefaultValue(e.target.value, currentFieldId);
				this.syncBackendObject();
			});
		const defaultValueDiv = $('<div class="default-value-wrapper"></div>').append(defaultValueLabel, defaultValueInput);

		// Example Values Heading, Controls, and Container
		const exampleValuesHeading = $("<h4></h4>").text(labels.exampleValuesHeading);
		const exampleValuesControls = $('<div class="example-values-controls"></div>').css({
			display: "flex",
			justifyContent: "flex-end",
			gap: "6px",
			marginBottom: "4px",
		});
		const exampleValuesContainer = $('<div class="example-values-container"></div>');

		// Append default value div, example values heading, and container to defaultExampleWrapper
		defaultExampleWrapper.append(defaultValueDiv, exampleValuesHeading, exampleValuesControls, exampleValuesContainer);

		// Append promptDiv and defaultExampleWrapper to promptDefaultExampleWrapper
		promptDefaultExampleWrapper.append(promptDiv, defaultExampleWrapper);

		// Append promptDefaultExampleWrapper to fieldWrapper
		fieldWrapper.append(promptDefaultExampleWrapper);

		// Nested Fields Container
		const nestedFieldsContainer = $('<div class="nested-fields-container"></div>');
		fieldWrapper.append(nestedFieldsContainer);

		const buttonsWrapper = $('<div class="buttons-wrapper"></div>');

		// Add Nested Field Button
		const addNestedFieldBtn = $('<button class="menu_button interactable"></button>')
			.text(labels.addNestedField)
			.on("click", () => {
				if (metadata.internalOnly) {
					return;
				}
				this.addField(null, fieldId);
				// After adding a nested field, make it sortable
				const nestedFieldData = this.getFieldDataById(fieldId).nestedFields;
				this.makeFieldsSortable(nestedFieldsContainer, nestedFieldData);
				this.syncBackendOrderWithDOM();
			})
			.hide(); // Initially hidden

		// Show the button if the field type allows nesting
		if (TrackerPromptMaker.NESTING_FIELD_TYPES.includes(fieldData.type) && !metadata.internalOnly) {
			addNestedFieldBtn.show();
		}
		addNestedFieldBtn.prop("disabled", metadata.internalOnly);

		// Add Example Value Button (per field)
		const addExampleValueBtn = $('<button class="menu_button interactable"></button>')
			.text(labels.addExampleValue)
			.on("click", () => {
				if (metadata.internalOnly) {
					return;
				}
				this.addExampleValue(fieldWrapper, "", true);
				this.syncBackendObject();
			})
			.css({
				width: "auto",
				display: "inline-flex",
				"white-space": "nowrap",
			});
		addExampleValueBtn.prop("disabled", metadata.internalOnly);

		// Remove Example Value Button (per field)
		const removeExampleValueBtn = $('<button class="menu_button interactable"></button>')
			.text(labels.removeExampleValue)
			.on("click", () => {
				if (metadata.internalOnly) {
					return;
				}
				this.removeExampleValue(fieldWrapper);
			})
			.css({
				width: "auto",
				display: "inline-flex",
				"white-space": "nowrap",
			});
		removeExampleValueBtn.prop("disabled", metadata.internalOnly);
		exampleValuesControls.append(addExampleValueBtn, removeExampleValueBtn);

		buttonsWrapper.append(addNestedFieldBtn);

		// Remove Field Button
		const removeFieldBtn = $('<button class="menu_button interactable field-remove-button"></button>')
			.text(labels.removeField)
			.on("click", () => {
			this.removeField(fieldId, fieldWrapper);
		});
		if (metadata.internal) {
			removeFieldBtn.hide();
		}
		buttonsWrapper.append(removeFieldBtn);

		fieldWrapper.append(buttonsWrapper);

		// Append fieldWrapper to the DOM
		if (parentFieldId) {
			const parentFieldWrapper = this.element.find(`[data-field-id="${parentFieldId}"] > .nested-fields-container`);
			parentFieldWrapper.append(fieldWrapper);
		} else {
			this.fieldsContainer.append(fieldWrapper);
		}

		debug(`Added field with ID: ${fieldId}`);

		// Initialize the backend object structure for this field
		if (parentFieldId) {
			const parentFieldData = this.getFieldDataById(parentFieldId);
			if (parentFieldData) {
				parentFieldData.nestedFields[fieldId] = {
					name: fieldData.name || "",
					type: fieldData.type || "STRING",
					presence: fieldData.presence || "DYNAMIC",
					prompt: fieldData.prompt || "",
					defaultValue: fieldData.defaultValue || "",
					exampleValues: [...fieldData.exampleValues],
					nestedFields: {},
					metadata: metadata,
				};
			} else {
				error(`Parent field with ID ${parentFieldId} not found.`);
			}
		} else {
			this.backendObject[fieldId] = {
				name: fieldData.name || "",
				type: fieldData.type || "STRING",
				presence: fieldData.presence || "DYNAMIC",
				prompt: fieldData.prompt || "",
				defaultValue: fieldData.defaultValue || "",
				exampleValues: [...fieldData.exampleValues],
				nestedFields: {},
				metadata: metadata,
			};
		}

		// Make nested fields sortable if this field type allows nesting
		if (TrackerPromptMaker.NESTING_FIELD_TYPES.includes(fieldData.type)) {
			const nestedFieldData = this.getFieldDataById(fieldId).nestedFields;
			this.makeFieldsSortable(nestedFieldsContainer, nestedFieldData);
		}

		// Populate example values if any
		if (fieldData.exampleValues && fieldData.exampleValues.length > 0) {
			fieldData.exampleValues.forEach((exampleValue) => {
				this.addExampleValue(fieldWrapper, exampleValue, false);
			});
		}

		// Recursively build nested fields if any
		if (fieldData.nestedFields && Object.keys(fieldData.nestedFields).length > 0) {
			Object.entries(fieldData.nestedFields).forEach(([nestedFieldId, nestedFieldData]) => {
				this.addField(null, fieldId, nestedFieldData, nestedFieldId, false);
			});
		}

		this.applyReadOnlyState(fieldWrapper, metadata);
		this.updateInternalFieldVisibility();
	}

	/**
	 * Removes a field from the component and backend object.
	 * @param {string} fieldId - The ID of the field to remove.
	 * @param {jQuery} fieldWrapper - The jQuery element of the field wrapper in the UI.
	 */
	removeField(fieldId, fieldWrapper) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData?.metadata?.internal) {
			warn(`Attempted to remove internal field "${fieldData.name}" ignored.`);
			if (typeof toastr !== "undefined") {
				toastr.warning(t("trackerPromptMaker.messages.internalFieldLocked", "Internal fields cannot be removed."));
			}
			return;
		}

		// Confirm before removing
		if (confirm(t("trackerPromptMaker.messages.confirmRemoveField", "Are you sure you want to remove this field?"))) {
			// Remove from backend object
			this.deleteFieldDataById(fieldId);
			// Remove from UI
			fieldWrapper.remove();
			debug(`Removed field with ID: ${fieldId}`);
			this.syncBackendOrderWithDOM();
		}
	}

	/**
	 * Helper function to delete a field's data from backendObject by fieldId.
	 * @param {string} fieldId - The ID of the field to delete.
	 * @param {Object} obj - The current object to search within.
	 * @returns {boolean} - True if deleted, false otherwise.
	 */
	deleteFieldDataById(fieldId, obj = this.backendObject) {
		for (const key in obj) {
			if (key === fieldId) {
				delete obj[key];
				return true;
			}
			if (obj[key].nestedFields) {
				const deleted = this.deleteFieldDataById(fieldId, obj[key].nestedFields);
				if (deleted) return true;
			}
		}
		return false;
	}

	/**
	 * Validates the field name to ensure it doesn't contain double quotes.
	 * @param {string} name - The field name entered by the user.
	 * @param {string} fieldId - The ID of the field being validated.
	 * @returns {boolean} - True if valid, false otherwise.
	 */
	validateFieldName(name, fieldId) {
		if (name.includes('"')) {
			warn("Field name cannot contain double quotes.");
			toastr.error("Field name cannot contain double quotes.");
			return false;
		}
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.name = name;
			debug(`Validated field name: ${name} for field ID: ${fieldId}`);
			return true;
		} else {
			error(`Field with ID ${fieldId} not found during validation.`);
			return false;
		}
	}

	/**
	 * Handles the selection of the field type and updates the UI accordingly.
	 * @param {string} type - The selected field type.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	selectFieldType(type, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.type = type || "STRING";
			debug(`Selected field type: ${type} for field ID: ${fieldId}`);
			const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
			const addNestedFieldBtn = fieldWrapper.find(".menu_button:contains('Add Nested Field')");
			const isNestingType = TrackerPromptMaker.NESTING_FIELD_TYPES.includes(type);
			addNestedFieldBtn.toggle(isNestingType);
		} else {
			error(`Field with ID ${fieldId} not found during type selection.`);
		}
	}

	/**
	 * Handles the selection of the presence.
	 * @param {string} presence - The selected presence.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	selectPresence(presence, fieldId) {
		const normalized = this.normalizePresenceValue(presence);
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.presence = normalized;
			debug(`Selected presence: ${normalized} for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during presence selection.`);
		}
		const fieldWrapper = this.fieldsContainer.find(`.field-wrapper[data-field-id="${fieldId}"]`);
		if (fieldWrapper.length) {
			this.setFieldPresenceOnWrapper(fieldWrapper, normalized);
		}
	}

	/**
	 * Updates the prompt or note for the field.
	 * @param {string} promptText - The prompt text entered by the user.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	updatePrompt(promptText, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.prompt = promptText;
			debug(`Updated prompt for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during prompt update.`);
		}
	}

	/**
	 * Updates the default value for the field.
	 * @param {string} defaultValue - The default value entered by the user.
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	updateDefaultValue(defaultValue, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.defaultValue = defaultValue;
			debug(`Updated default value for field ID: ${fieldId}`);
		} else {
			error(`Field with ID ${fieldId} not found during default value update.`);
		}
	}

	/**
	 * Updates the gender specific setting for the field.
	 * @param {string} genderSpecific - The gender specific setting (all, female, male, trans).
	 * @param {string} fieldId - The ID of the field being updated.
	 */
	updateGenderSpecific(genderSpecific, fieldId) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData) {
			fieldData.genderSpecific = genderSpecific;
			debug(`Updated gender specific setting for field ID: ${fieldId} to: ${genderSpecific}`);
		} else {
			error(`Field with ID ${fieldId} not found during gender specific update.`);
		}
	}

	/**
	 * Adds an example value input to a specific field.
	 * @param {jQuery} fieldWrapper - The jQuery element of the field wrapper.
	 * @param {string} exampleValue - Optional initial value for the example value.
	 * @param {boolean} [pushToBackend=true] - Whether to push the example value to the backend object.
	 */
	addExampleValue(fieldWrapper, exampleValue = "", pushToBackend = true) {
		const fieldId = fieldWrapper.attr("data-field-id");
		const metadata = fieldWrapper.data("metadata") || {};
		if (metadata.internalOnly && pushToBackend) {
			return;
		}

		// Example value input
		const exampleValueInput = $('<input class="text_pole" type="text">')
			.attr("placeholder", t("trackerPromptMaker.placeholders.exampleValue", "Example Value"))
			.val(exampleValue)
			.on("input", (e) => {
				const currentFieldId = fieldWrapper.attr("data-field-id");
				const index = $(e.target).data("index");
				this.updateExampleValue(currentFieldId, e.target.value, index);
				this.syncBackendObject();
			});

		// Assign an index to the example value input
		const index = this.getFieldDataById(fieldId).exampleValues.length;
		exampleValueInput.data("index", index);

		// Append the exampleValueInput to the example values container
		const exampleValuesContainer = fieldWrapper.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container");
		exampleValuesContainer.append(exampleValueInput);

		// Initialize the example value in the backend object only if pushToBackend is true
		if (pushToBackend) {
			this.getFieldDataById(fieldId).exampleValues.push(exampleValue);
		}

		this.updateExampleValueIndices(fieldId);
	}

	/**
	 * Removes the last example value for a specific field.
	 * @param {jQuery} fieldWrapper - The jQuery element of the field wrapper.
	 */
	removeExampleValue(fieldWrapper) {
		const fieldId = fieldWrapper.attr("data-field-id");
		const fieldData = this.getFieldDataById(fieldId);
		const metadata = fieldWrapper.data("metadata") || {};
		if (!fieldData || metadata.internalOnly) {
			return;
		}

		if (fieldData.exampleValues.length === 0) {
			return;
		}

		fieldData.exampleValues.pop();

		const exampleValuesContainer = fieldWrapper.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container");
		exampleValuesContainer.find("input.text_pole").last().remove();

		this.updateExampleValueIndices(fieldId);
		this.syncBackendObject();
	}

	/**
	 * Updates the example value in the backend object.
	 * @param {string} fieldId - The ID of the field being updated.
	 * @param {string} value - The new example value.
	 * @param {number} index - The index of the example value in the array.
	 */
	updateExampleValue(fieldId, value, index) {
		const fieldData = this.getFieldDataById(fieldId);
		if (fieldData && fieldData.exampleValues && index < fieldData.exampleValues.length) {
			fieldData.exampleValues[index] = value;
			debug(`Updated example value at index ${index} for field ID: ${fieldId}`);
		} else {
			error(`Invalid fieldId or index during example value update. Field ID: ${fieldId}, Index: ${index}`);
		}
	}

	/**
	 * Updates the indices of all example value inputs for a specific field after removal.
	 * @param {string} fieldId - The ID of the field.
	 */
	updateExampleValueIndices(fieldId) {
		const fieldWrapper = this.element.find(`[data-field-id="${fieldId}"]`);
		const exampleValueInputs = fieldWrapper.find("> .prompt-default-example-wrapper > .default-example-wrapper > .example-values-container input.text_pole");
		exampleValueInputs.each((i, input) => {
			$(input).data("index", i);
		});
	}

	/**
	 * Synchronizes the backend object with the current state of the component.
	 */
	syncBackendObject() {
		// Backend object is updated in real-time, so we just log and trigger the save callback.
		debug("Backend object synchronized.");
		this.triggerSaveCallback();
	}

	/**
	 * Triggers the save callback function with the current backend object.
	 */
	triggerSaveCallback() {
		this.onTrackerPromptSave(this.backendObject);
		debug("Save callback triggered.");
	}

	/**
	 * Populates the component with data from an existing object and rebuilds the UI.
	 * @param {Object} existingObject - The existing JSON object.
	 */
	populateFromExistingObject(existingObject) {
		try {
			// Clear existing backend object and reset field counter
			this.backendObject = {};
			this.fieldCounter = 0;

			// Rebuild the UI
			this.buildUI();

			// Build fields from the existing object
			this.buildFieldsFromObject(existingObject, null, null);

			// Make top-level container sortable
			this.makeFieldsSortable(this.fieldsContainer, this.backendObject);

			this.updateInternalFieldVisibility();

			debug("Populated from existing object.");
		} catch (err) {
			error("Error populating from existing object:", err);
			toastr.error("Failed to load data.");
		}
	}

	/**
	 * Recursively builds fields from the existing object and updates the UI.
	 * @param {Object} obj - The object to build fields from.
	 * @param {Object|null} parentObject - The parent object in the backendObject.
	 * @param {string|null} parentFieldId - The ID of the parent field if any.
	 */
	buildFieldsFromObject(obj, parentObject, parentFieldId = null) {
		Object.entries(obj).forEach(([fieldId, fieldData]) => {
			// Use the appropriate parent object
			const currentParentObject = parentObject ? parentObject : this.backendObject;
			// Add the field (isNewField = false because we're loading existing data)
			this.addField(currentParentObject, parentFieldId, fieldData, fieldId, false);
		});
	}

	/**
	 * Returns the root HTML element of the component for embedding.
	 * @returns {jQuery} - The root element of the component.
	 */
	getElement() {
		return this.element;
	}

	/**
	 * Aligns backendObject order and metadata with the current DOM without renumbering field IDs.
	 */
	syncBackendOrderWithDOM() {
		const restoreInteractivity = (fieldWrapper) => {
			fieldWrapper
				.removeClass("field-wrapper--internal field-wrapper--internal-only field-wrapper--locked field-wrapper--locked-partial");
			fieldWrapper.find("input, textarea, select").prop("disabled", false);
			fieldWrapper.find(".menu_button").prop("disabled", false).removeClass("disabled");
			fieldWrapper.find(".drag-handle").removeClass("drag-handle--disabled").css("pointer-events", "");
		};

		const synchronize = (container, backendRef = {}) => {
			const orderedBackend = {};

			container.children(".field-wrapper").each((_, element) => {
				const fieldWrapper = $(element);
				const fieldId = fieldWrapper.attr("data-field-id");
				if (!fieldId) {
					return;
				}

				let fieldData = backendRef[fieldId];
				if (!fieldData) {
					fieldData = this.getFieldDataById(fieldId) || {};
				}

				fieldData.metadata = this.normalizeFieldMetadata(fieldData.metadata || {}, false);
				fieldWrapper.data("metadata", fieldData.metadata);

				restoreInteractivity(fieldWrapper);

				fieldWrapper.toggleClass("field-wrapper--internal", fieldData.metadata.internal === true);
				fieldWrapper.toggleClass("field-wrapper--internal-only", fieldData.metadata.internalOnly === true);

				this.applyReadOnlyState(fieldWrapper, fieldData.metadata);
				this.setFieldPresenceOnWrapper(fieldWrapper, fieldData.presence || "DYNAMIC");

				const removeFieldBtn = fieldWrapper.find("> .buttons-wrapper > .field-remove-button");
				if (removeFieldBtn.length) {
					if (fieldData.metadata.internal) {
						removeFieldBtn.hide();
					} else {
						removeFieldBtn.show();
					}
				}

				const nestedContainer = fieldWrapper.find("> .nested-fields-container");
				if (nestedContainer.length) {
					fieldData.nestedFields = synchronize(nestedContainer, fieldData.nestedFields || {});
				} else {
					fieldData.nestedFields = {};
				}

				orderedBackend[fieldId] = fieldData;
			});

			return orderedBackend;
		};

		this.backendObject = synchronize(this.fieldsContainer, this.backendObject || {});

		debug("Synchronized backend object with DOM.", { backendObject: this.backendObject });

		this.updateInternalFieldVisibility();
		this.syncBackendObject();
	}

	/**
	 * Generates a template from current tracker definition and triggers appropriate callbacks
	 */
	generateTemplate() {
		try {
			if (typeof debug === 'function') {
				debug('TrackerPromptMaker: Generate Template called. Current backendObject:', this.backendObject);
			}
			
			// Check if we have any fields defined
			if (!this.backendObject || Object.keys(this.backendObject).length === 0) {
				// Use console if toastr is not available
				if (typeof toastr !== 'undefined') {
					toastr.warning('No tracker fields defined. Please add some fields first.', 'Template Generation');
				} else {
					console.warn('Template Generation: No tracker fields defined. Please add some fields first.');
				}
				return;
			}

			// Generate the template
			const templateGenerator = new TrackerTemplateGenerator();
			const generatedTemplate = templateGenerator.generateTableTemplate(this.backendObject);
			
			if (typeof debug === 'function') {
				debug('TrackerPromptMaker: Generated template:', generatedTemplate);
			}
			
			// Try to access extension settings from the module
			try {
				// Import the extensionSettings from the main module
				import('../../index.js').then(module => {
					if (module.extensionSettings) {
						module.extensionSettings.mesTrackerTemplate = generatedTemplate;
						if (typeof debug === 'function') {
							debug('TrackerPromptMaker: Updated extension settings with template');
						}
						
						// Update the settings textarea if it exists
						const templateTextarea = $("#tracker_enhanced_mes_tracker_template");
						if (templateTextarea.length) {
							templateTextarea.val(generatedTemplate);
							if (typeof debug === 'function') {
								debug('TrackerPromptMaker: Updated settings textarea');
							}
						}
						
						// Try to save settings
						if (typeof saveSettingsDebounced === 'function') {
							saveSettingsDebounced();
							if (typeof debug === 'function') {
								debug('TrackerPromptMaker: Saved settings');
							}
						}
					}
				}).catch(err => {
					if (typeof debug === 'function') {
						debug('TrackerPromptMaker: Could not import extension settings:', err);
					}
				});
			} catch (importError) {
				if (typeof debug === 'function') {
					debug('TrackerPromptMaker: Import not supported, trying fallback methods');
				}
				
				// Fallback: Update the textarea directly for manual editing
				const templateTextarea = $("#tracker_enhanced_mes_tracker_template");
				if (templateTextarea.length) {
					templateTextarea.val(generatedTemplate);
					if (typeof debug === 'function') {
						debug('TrackerPromptMaker: Updated settings textarea via fallback');
					}
				}
			}
			
			// Show success message
			if (typeof toastr !== 'undefined') {
				toastr.success('Template generated and applied successfully! Please save your settings.', 'Template Generation');
			} else {
				console.log('Template Generation: Template generated and applied successfully!');
			}
			if (typeof debug === 'function') {
				debug('TrackerPromptMaker: Template generation completed');
			}
			
		} catch (error) {
			console.error('Failed to generate template from Prompt Maker:', error);
			if (typeof toastr !== 'undefined') {
				toastr.error('Failed to generate template. Check console for details.', 'Template Generation');
			}
		}
	}
}
