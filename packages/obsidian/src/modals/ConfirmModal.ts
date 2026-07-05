import type { App } from 'obsidian';
import { addModalActions } from 'packages/obsidian/src/modals/ModalActions';
import { PromiseModal } from 'packages/obsidian/src/modals/PromiseModal';

/** A simple yes/no confirmation dialog that resolves a Promise with the
 *  user's choice. */
export class ConfirmModal extends PromiseModal<boolean> {
	constructor(
		app: App,
		private readonly heading: string,
		private readonly message: string,
		private readonly confirmLabel: string,
	) {
		super(app, false);
	}

	/** Opens the modal and returns a promise that resolves with the boolean
	 *  result. */
	confirm(): Promise<boolean> {
		return this.awaitResult();
	}

	override onOpen(): void {
		this.setTitle(this.heading);
		this.contentEl.createEl('p', { text: this.message });

		addModalActions(
			this.contentEl,
			this.confirmLabel,
			() => this.submitResult(false),
			() => this.submitResult(true),
		);
	}
}
