import { SettingGroup } from 'obsidian';

/** Adds the standard cancel and primary-action row used by plugin modals. */
export function addModalActions(
	container: HTMLElement,
	primaryLabel: string,
	onCancel: () => void | Promise<void>,
	onPrimary: () => void | Promise<void>,
): void {
	new SettingGroup(container).addSetting(setting => {
		setting
			.addButton(button =>
				button.setButtonText('Cancel').onClick(() => {
					void onCancel();
				}),
			)
			.addButton(button =>
				button
					.setCta()
					.setButtonText(primaryLabel)
					.onClick(() => {
						void onPrimary();
					}),
			);
	});
}
