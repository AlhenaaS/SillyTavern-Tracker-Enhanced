import { chat } from "../../../../../../../script.js";
import { extensionSettings } from "../../../index.js";
import { debug, log, warn } from "../../../lib/utils.js";

const TRACKER_PREVIEW_TARGET_SELECTOR = ".mes_block .mes_text";

export class TrackerPreview {
    constructor(messageId, trackerContentRenderer) {
        this.messageId = messageId;
        this.contentRenderer = trackerContentRenderer;
        this.init();
    }

    init() {
        this.messageElement = document.querySelector(`#chat .mes[mesid="${this.messageId}"]`);

        if (!this.messageElement) {
            warn(`Message with mesid="${this.messageId}" not found. Aborting TrackerPreview initialization.`);
            return;
        }

        this.tracker = this.getTracker();
        if (this.tracker && Object.keys(this.tracker).length > 0) this.render();
    }

    getTracker() {
        if (!chat[this.messageId].tracker) {
            chat[this.messageId].tracker = {};
        }
        return chat[this.messageId].tracker;
    }

    handleTrackerReplacement() {
        this.tracker = this.getTracker();
        this.update();
    }

    render() {
        const template = extensionSettings.mesTrackerTemplate;
        const previewHtml = this.contentRenderer.renderFromTemplate(this.tracker, template);

        const existingPreview = this.messageElement.querySelector('.mes_tracker');
        if (existingPreview) existingPreview.remove();

        if (!this.tracker || Object.keys(this.tracker).length === 0) {
            debug(`Tracker for message ${this.messageId} is empty. Skipping preview.`);
            return;
        }

        this.previewElement = document.createElement('div');
        this.previewElement.className = 'mes_tracker';
        this.previewElement.innerHTML = previewHtml;

        const targetElement = this.messageElement.querySelector(TRACKER_PREVIEW_TARGET_SELECTOR);
        if (targetElement) {
            targetElement.before(this.previewElement);
        } else {
            warn(`Target element "${TRACKER_PREVIEW_TARGET_SELECTOR}" not found within message ${this.messageId}.`);
        }
    }

    update(tracker = null) {
        log(`Updating preview for message ${this.messageId}`);
        this.tracker = tracker || this.getTracker();
        this.render();
    }

    updateMessageId(newMessageId) {
        debug(`Updating messageId for preview from ${this.messageId} to ${newMessageId}`);
        this.messageId = newMessageId;
        this.init();
    }

    delete() {
        if (this.previewElement && this.previewElement.parentNode) {
            this.previewElement.parentNode.removeChild(this.previewElement);
        }
    }
}
