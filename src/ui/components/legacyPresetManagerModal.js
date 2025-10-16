import { t } from "../../../lib/i18n.js";
import { debug } from "../../../lib/utils.js";
import { formatLegacyTimestamp, mapLegacyReasons } from "../utils/legacyPresetUi.js";

function normalizeLegacyRecords(store = {}) {
	const records = [];
	if (!store || typeof store !== "object" || Array.isArray(store)) {
		return records;
	}
	for (const [label, entry] of Object.entries(store)) {
		if (!entry || typeof entry !== "object") {
			continue;
		}
		const originalName = typeof entry.originalName === "string" ? entry.originalName : label;
		const quarantinedAt = typeof entry.quarantinedAt === "string" ? entry.quarantinedAt : null;
		const reasons = Array.isArray(entry.reasons) ? entry.reasons : [];
		const preset = entry.preset ?? entry.payload ?? entry.snapshot ?? entry;
		records.push({
			label,
			originalName,
			quarantinedAt,
			reasons,
			preset,
		});
	}
	return records.sort((a, b) => {
		const aTime = a.quarantinedAt ? Date.parse(a.quarantinedAt) : 0;
		const bTime = b.quarantinedAt ? Date.parse(b.quarantinedAt) : 0;
		if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
			return a.label.localeCompare(b.label);
		}
		if (Number.isNaN(aTime)) {
			return 1;
		}
		if (Number.isNaN(bTime)) {
			return -1;
		}
		return bTime - aTime;
	});
}

export class LegacyPresetManagerModal {
	constructor({ onView, onExport, onDelete } = {}) {
		this.modal = null;
		this.content = null;
		this.listContainer = null;
		this.actions = {
			onView: typeof onView === "function" ? onView : null,
			onExport: typeof onExport === "function" ? onExport : null,
			onDelete: typeof onDelete === "function" ? onDelete : null,
		};
		this.records = [];
		this.highlightLabel = null;
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
		closeButton.id = "TrackerLegacyPresetManagerClose";
		closeButton.addEventListener("click", () => this.close());
		controlBar.appendChild(closeButton);

		this.content = document.createElement("div");
		this.content.className = "tracker-modal-content tracker-legacy-manager-content";

		const title = document.createElement("h3");
		title.className = "tracker-modal-title";
		title.textContent = t("settings.presets.legacy.modal.title", "Legacy Preset Archive");
		this.content.appendChild(title);

		const subtitle = document.createElement("p");
		subtitle.className = "tracker-legacy-manager-warning";
		subtitle.textContent = t(
			"settings.presets.legacy.modal.subtitle",
			"These presets were quarantined by schema checks. Inspect or export them from here; they stay read-only and cannot be applied."
		);
		this.content.appendChild(subtitle);

		this.listContainer = document.createElement("div");
		this.listContainer.className = "tracker-legacy-manager-list";
		this.content.appendChild(this.listContainer);

		const footer = document.createElement("div");
		footer.className = "tracker-modal-footer tracker-legacy-preset-footer";

		const closeButtonFooter = document.createElement("button");
		closeButtonFooter.className = "tracker-modal-cancel-button menu_button interactable tracker-legacy-close-button";
		closeButtonFooter.textContent = t("settings.presets.viewer.close", "Close");
		closeButtonFooter.addEventListener("click", () => this.close());
		footer.appendChild(closeButtonFooter);

		this.modal.appendChild(controlBar);
		this.modal.appendChild(this.content);
		this.modal.appendChild(footer);
	}

	updateActions(handlers = {}) {
		if (handlers.onView && typeof handlers.onView === "function") {
			this.actions.onView = handlers.onView;
		}
		if (handlers.onExport && typeof handlers.onExport === "function") {
			this.actions.onExport = handlers.onExport;
		}
		if (handlers.onDelete && typeof handlers.onDelete === "function") {
			this.actions.onDelete = handlers.onDelete;
		}
	}

	updateStore(store = {}, options = {}) {
		this.records = normalizeLegacyRecords(store);
		this.highlightLabel = options.highlightLabel || null;
		if (!this.listContainer) {
			return;
		}
		this.renderList();
	}

	renderList() {
		if (!this.listContainer) {
			return;
		}
		this.listContainer.innerHTML = "";
		if (!this.records.length) {
			const empty = document.createElement("div");
			empty.className = "tracker-legacy-manager-empty";
			empty.textContent = t("settings.presets.legacy.empty", "No legacy presets are stored right now.");
			this.listContainer.appendChild(empty);
			return;
		}

		const highlightLabel = this.highlightLabel;
		let highlightedElement = null;
		for (const record of this.records) {
			const entry = document.createElement("article");
			entry.className = "tracker-legacy-manager-entry";
			if (highlightLabel && record.label === highlightLabel) {
				entry.classList.add("is-highlighted");
				highlightedElement = entry;
			}

			const titleRow = document.createElement("div");
			titleRow.className = "tracker-legacy-manager-entry-title";
			const labelSpan = document.createElement("span");
			labelSpan.textContent = record.label;
			titleRow.appendChild(labelSpan);

			const metaRow = document.createElement("div");
			metaRow.className = "tracker-legacy-manager-entry-meta";

			const originalLabel = t("settings.presets.legacy.original", "Original name");
			const originalSpan = document.createElement("span");
			originalSpan.innerHTML = `<strong>${originalLabel}:</strong> ${record.originalName}`;
			metaRow.appendChild(originalSpan);

			const quarantinedLabel = t("settings.presets.legacy.quarantined", "Quarantined at");
			const quarantinedSpan = document.createElement("span");
			quarantinedSpan.innerHTML = `<strong>${quarantinedLabel}:</strong> ${formatLegacyTimestamp(record.quarantinedAt)}`;
			metaRow.appendChild(quarantinedSpan);

			this.listContainer.appendChild(entry);
			entry.appendChild(titleRow);
			entry.appendChild(metaRow);

			const reasons = mapLegacyReasons(record.reasons);
			const reasonsContainer = document.createElement("div");
			reasonsContainer.className = "tracker-legacy-manager-reasons";

			const reasonsTitle = document.createElement("div");
			reasonsTitle.className = "tracker-legacy-manager-reason-title";
			reasonsTitle.textContent = t("settings.presets.legacy.reasons.title", "Compatibility reasons");
			reasonsContainer.appendChild(reasonsTitle);

			const reasonsList = document.createElement("ul");
			reasonsList.className = "tracker-legacy-manager-reason-list";
			if (!reasons.length) {
				const emptyReason = document.createElement("li");
				emptyReason.className = "tracker-legacy-manager-reason-item";
				emptyReason.textContent = t("settings.presets.legacy.reasons.empty", "No compatibility reasons were recorded.");
				reasonsList.appendChild(emptyReason);
			} else {
				for (const reason of reasons) {
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
			entry.appendChild(reasonsContainer);

			const actions = document.createElement("div");
			actions.className = "tracker-legacy-manager-actions";

			if (this.actions.onView) {
				const viewButton = document.createElement("button");
				viewButton.type = "button";
				viewButton.className = "tracker-legacy-manager-button";
				viewButton.textContent = t("settings.presets.legacy.view", "View JSON");
				viewButton.addEventListener("click", () => {
					this.actions.onView?.(record);
				});
				actions.appendChild(viewButton);
			}

			if (this.actions.onExport) {
				const exportButton = document.createElement("button");
				exportButton.type = "button";
				exportButton.className = "tracker-legacy-manager-button";
				exportButton.textContent = t("settings.presets.legacy.export", "Export");
				exportButton.addEventListener("click", () => {
					this.actions.onExport?.(record);
				});
				actions.appendChild(exportButton);
			}

			if (this.actions.onDelete) {
				const deleteButton = document.createElement("button");
				deleteButton.type = "button";
				deleteButton.className = "tracker-legacy-manager-button tracker-legacy-manager-button--danger";
				deleteButton.textContent = t("settings.presets.legacy.delete", "Delete");
				deleteButton.addEventListener("click", () => {
					this.actions.onDelete?.(record);
				});
				actions.appendChild(deleteButton);
			}

			entry.appendChild(actions);
		}

		if (highlightedElement) {
			queueMicrotask(() => {
				try {
					highlightedElement.scrollIntoView({ behavior: "smooth", block: "center" });
				} catch {
					highlightedElement.scrollIntoView();
				}
			});
		}
	}

	show(store = {}, handlers = {}, options = {}) {
		this.ensureModal();
		this.updateActions(handlers);
		this.updateStore(store, options);
		if (!this.modal.isConnected) {
			document.body.appendChild(this.modal);
		}
		try {
			this.modal.showModal();
		} catch (err) {
			debug("Failed to show legacy preset manager via showModal; applying open attribute.", { err });
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
		this.listContainer = null;
		this.records = [];
		this.highlightLabel = null;
	}
}

export const legacyPresetManager = new LegacyPresetManagerModal();
