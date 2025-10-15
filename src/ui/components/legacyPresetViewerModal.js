import { t } from "../../../lib/i18n.js";
import { debug, warn } from "../../../lib/utils.js";
import { formatLegacyTimestamp, mapLegacyReasons } from "../utils/legacyPresetUi.js";

class LegacyPresetViewerModal {
	constructor() {
		this.modal = null;
		this.content = null;
		this.body = null;
		this.copyButton = null;
	}

	ensureModal() {
		if (this.modal) {
			return;
		}

		this.modal = document.createElement("dialog");
		this.modal.className = "tracker-legacy-preset-modal popup popup--animation-fast";
		this.modal.addEventListener("cancel", (event) => {
			event.preventDefault();
			this.close();
		});

		const controlBar = document.createElement("div");
		controlBar.className = "tracker-modal-control-bar";

		const closeButton = document.createElement("div");
		closeButton.className = "fa-solid fa-circle-xmark hoverglow";
		closeButton.id = "TrackerLegacyPresetClose";
		closeButton.addEventListener("click", () => this.close());
		controlBar.appendChild(closeButton);

		this.content = document.createElement("div");
		this.content.className = "tracker-modal-content tracker-legacy-preset-content";

		const footer = document.createElement("div");
		footer.className = "tracker-modal-footer tracker-legacy-preset-footer";

		this.copyButton = document.createElement("button");
		this.copyButton.className = "tracker-modal-save-button menu_button interactable";
		this.copyButton.textContent = t("settings.presets.viewer.copy", "Copy JSON");
		this.copyButton.addEventListener("click", () => this.copyPreset());
		footer.appendChild(this.copyButton);

		const dismissButton = document.createElement("button");
		dismissButton.className = "tracker-modal-cancel-button menu_button interactable";
		dismissButton.textContent = t("settings.presets.viewer.close", "Close");
		dismissButton.addEventListener("click", () => this.close());
		footer.appendChild(dismissButton);

		this.modal.appendChild(controlBar);
		this.modal.appendChild(this.content);
		this.modal.appendChild(footer);
	}

	createMetaItem(label, value) {
		const wrapper = document.createElement("div");
		wrapper.className = "tracker-legacy-preset-meta-item";

		const labelElement = document.createElement("span");
		labelElement.className = "tracker-legacy-preset-meta-label";
		labelElement.textContent = label;

		const valueElement = document.createElement("span");
		valueElement.className = "tracker-legacy-preset-meta-value";
		valueElement.textContent = value;

		wrapper.appendChild(labelElement);
		wrapper.appendChild(valueElement);
		return wrapper;
	}

	updateContent(presetName, presetData, metadata = {}) {
		if (!this.content) {
			return;
		}

		this.content.innerHTML = "";

		const title = document.createElement("h3");
		title.className = "tracker-modal-title";
		title.id = "tracker_legacy_preset_viewer_title";
		const titleTemplate = t("settings.presets.viewer.title", "Legacy Preset (Read Only)");
		title.textContent = `${titleTemplate}: ${presetName}`;
		this.content.appendChild(title);

		const description = document.createElement("p");
		description.className = "tracker-legacy-preset-description";
		description.textContent = t(
			"settings.presets.viewer.description",
			"This preset uses an older schema and cannot be applied. Preview the saved values below."
		);
		this.content.appendChild(description);

		const metaContainer = document.createElement("div");
		metaContainer.className = "tracker-legacy-preset-meta";

		if (metadata.originalName) {
			const originalLabel = t("settings.presets.viewer.original", "Original name");
			metaContainer.appendChild(this.createMetaItem(originalLabel, metadata.originalName));
		}

		if (metadata.quarantinedAt) {
			const quarantinedLabel = t("settings.presets.viewer.quarantined", "Quarantined at");
			const formattedTimestamp = formatLegacyTimestamp(metadata.quarantinedAt);
			metaContainer.appendChild(this.createMetaItem(quarantinedLabel, formattedTimestamp));
		}

		if (metaContainer.childElementCount > 0) {
			this.content.appendChild(metaContainer);
		}

		const reasonsContainer = document.createElement("div");
		reasonsContainer.className = "tracker-legacy-preset-reasons";
		const reasonsTitle = document.createElement("div");
		reasonsTitle.className = "tracker-legacy-preset-reasons-title";
		reasonsTitle.textContent = t("settings.presets.viewer.reasons.title", "Compatibility reasons");
		reasonsContainer.appendChild(reasonsTitle);

		const reasonsList = document.createElement("ul");
		reasonsList.className = "tracker-legacy-manager-reason-list";
		const mappedReasons = mapLegacyReasons(metadata.reasons);
		if (mappedReasons.length === 0) {
			const emptyReason = document.createElement("li");
			emptyReason.className = "tracker-legacy-manager-reason-item";
			emptyReason.textContent = t("settings.presets.viewer.reasons.empty", "No compatibility reasons were recorded.");
			reasonsList.appendChild(emptyReason);
		} else {
			for (const reason of mappedReasons) {
				const item = document.createElement("li");
				item.className = "tracker-legacy-manager-reason-item";

				const severity = document.createElement("span");
				severity.className = "tracker-legacy-manager-severity";
				if ((reason.severity || "").toLowerCase() === "changed") {
					severity.classList.add("is-changed");
				}
				severity.textContent = reason.severityLabel || "";
				item.appendChild(severity);

				const label = document.createElement("span");
				label.textContent = reason.label;
				item.appendChild(label);

				if (reason.path) {
					const path = document.createElement("code");
					path.className = "tracker-legacy-manager-path";
					path.textContent = reason.path;
					item.appendChild(path);
				}

				reasonsList.appendChild(item);
			}
		}
		reasonsContainer.appendChild(reasonsList);
		this.content.appendChild(reasonsContainer);

		this.body = document.createElement("pre");
		this.body.className = "tracker-legacy-preset-json";
		try {
			this.body.textContent = JSON.stringify(presetData, null, 2);
		} catch (err) {
			warn("Failed to stringify legacy preset", { err });
			this.body.textContent = t("settings.presets.viewer.stringifyError", "Unable to display preset payload.");
		}
		this.content.appendChild(this.body);

		if (this.copyButton) {
			this.copyButton.textContent = t("settings.presets.viewer.copy", "Copy JSON");
		}
	}

	copyPreset() {
		if (!this.body) {
			return;
		}
		const text = this.body.textContent || "";
		if (!navigator?.clipboard) {
			try {
				const textarea = document.createElement("textarea");
				textarea.value = text;
				textarea.style.position = "fixed";
				textarea.style.left = "-9999px";
				document.body.appendChild(textarea);
				textarea.select();
				document.execCommand("copy");
				document.body.removeChild(textarea);
				if (typeof toastr !== "undefined") {
					toastr.success(t("settings.presets.viewer.copySuccess", "Legacy preset copied to clipboard."));
				}
			} catch (err) {
				warn("Failed fallback copy for legacy preset", { err });
			}
			return;
		}

		navigator.clipboard
			.writeText(text)
			.then(() => {
				if (typeof toastr !== "undefined") {
					toastr.success(t("settings.presets.viewer.copySuccess", "Legacy preset copied to clipboard."));
				}
			})
			.catch((err) => {
				warn("Failed to copy legacy preset to clipboard", { err });
			});
	}

	show(presetName, presetData, metadata = {}) {
		this.ensureModal();
		this.updateContent(presetName, presetData, metadata);
		if (!this.modal.isConnected) {
			document.body.appendChild(this.modal);
		}
		try {
			this.modal.showModal();
		} catch (err) {
			debug("Failed to show legacy preset modal via showModal; attempting open attribute.", { err });
			this.modal.setAttribute("open", "open");
		}
	}

	close() {
		if (!this.modal) {
			return;
		}
		if (this.modal.open) {
			this.modal.close();
		}
		if (this.modal.isConnected) {
			document.body.removeChild(this.modal);
		}
		this.modal = null;
		this.content = null;
		this.body = null;
		this.copyButton = null;
	}
}

export const legacyPresetViewer = new LegacyPresetViewerModal();
