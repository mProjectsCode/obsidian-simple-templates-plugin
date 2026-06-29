import type { App } from 'obsidian';
import { Modal, SettingGroup } from 'obsidian';

/** A simple yes/no confirmation dialog that resolves a Promise with the
 *  user's choice. */
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

	/** Opens the modal and returns a promise that resolves with the boolean
	 *  result. */
	confirm(): Promise<boolean> {
		return new Promise(resolve => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.setTitle(this.heading);
		this.contentEl.createEl('p', { text: this.message });

		new SettingGroup(this.contentEl).addSetting(setting => {
			setting
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
		});
	}

	override onClose(): void {
		this.contentEl.empty();
		if (!this.answered) this.resolve(false);
	}
}
