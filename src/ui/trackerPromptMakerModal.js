import { t } from "../../lib/i18n.js";
import { TrackerPromptMaker } from "./components/trackerPromptMaker.js";

export class TrackerPromptMakerModal {
    constructor() {
        if (TrackerPromptMakerModal.instance) {
            return TrackerPromptMakerModal.instance;
        }
        TrackerPromptMakerModal.instance = this;
        this.modal = null;
        this.tracker = null;
        this.onSave = null;
    }

    /**
     * Displays the modal with the provided tracker object and onSave callback.
     * @param {object} tracker - The tracker definition object to edit.
     * @param {function} onSave - Callback function to handle the updated tracker.
     */
    show(tracker, onSave) {
        this.tracker = tracker;
        this.onSave = onSave;

        if (!this.modal) {
            this.createModal();
        }

        this.updateContent();
        document.body.appendChild(this.modal);
        this.modal.showModal();
    }

    /**
     * Creates the modal dialog elements.
     */
    createModal() {
        this.modal = document.createElement('dialog');
        this.modal.className = 'tracker-prompt-maker-modal popup popup--animation-fast';

        // Control Bar
        const modalControlBar = document.createElement('div');
        modalControlBar.className = 'tracker-modal-control-bar';

        // Close Button
        const modalCloseButton = document.createElement('div');
        modalCloseButton.id = 'TrackerPromptModalClose';
        modalCloseButton.className = 'fa-solid fa-circle-xmark hoverglow';
        modalCloseButton.onclick = () => {
            this.close();
        };
        modalControlBar.appendChild(modalCloseButton);

        // Content Area
        this.modalContent = document.createElement('div');
        this.modalContent.className = 'tracker-modal-content';

        // Append elements to modal
        this.modal.appendChild(modalControlBar);
        this.modal.appendChild(this.modalContent);
    }

    /**
     * Updates the modal content with the Tracker Prompt Maker interface.
     */
    updateContent() {
        this.modalContent.innerHTML = '';
        const title = document.createElement('h3');
        title.className = 'tracker-modal-title';
        title.textContent = t("trackerPromptMaker.title", "Tracker Prompt Maker");
        this.modalContent.appendChild(title);

        // Initialize TrackerPromptMaker with the tracker and onSave callback
        const trackerPromptMaker = new TrackerPromptMaker(this.tracker, (updatedTracker) => {
            this.tracker = updatedTracker;
            if (this.onSave) {
                this.onSave(updatedTracker);
            }
        });

        // Append the TrackerPromptMaker element to the modal content
        $(this.modalContent).append(trackerPromptMaker.getElement());
    }

    /**
     * Closes the modal, removes it from the DOM, and resets the singleton instance.
     */
    close() {
        if (this.modal) {
            this.modal.close();
            document.body.removeChild(this.modal);
            this.modal = null;
            TrackerPromptMakerModal.instance = null;
        }
    }
}
