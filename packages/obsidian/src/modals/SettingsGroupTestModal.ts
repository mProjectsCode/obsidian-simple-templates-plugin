import type { App } from 'obsidian';
import { Modal, SettingGroup } from 'obsidian';

/** Temporary modal for visually testing a settings group outside the settings tab. */
export class SettingsGroupTestModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle('Settings group test');

		new SettingGroup(this.contentEl)
			.setHeading('Test group')
			.addSetting(setting => {
				setting.setName('First placeholder setting').setDesc('Placeholder description for the first setting.');
			})
			.addSetting(setting => {
				setting.setName('Second placeholder setting').setDesc('Placeholder description for the second setting.');
			});
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
