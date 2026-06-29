import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
	private resolve: (confirmed: boolean) => void = () => undefined;
	private answered = false;

	constructor(
		app: App,
		private readonly heading: string,
		private readonly message: string,
		private readonly confirmLabel: string,
	) {
		super(app);
	}

	confirm(): Promise<boolean> {
		this.open();
		return new Promise(resolve => {
			this.resolve = resolve;
		});
	}

	override onOpen(): void {
		this.setTitle(this.heading);
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton(button =>
				button.setButtonText('Cancel').onClick(() => {
					this.answered = true;
					this.resolve(false);
					this.close();
				}),
			)
			.addButton(button =>
				button
					.setCta()
					.setButtonText(this.confirmLabel)
					.onClick(() => {
						this.answered = true;
						this.resolve(true);
						this.close();
					}),
			);
	}

	override onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.resolve(false);
	}
}
