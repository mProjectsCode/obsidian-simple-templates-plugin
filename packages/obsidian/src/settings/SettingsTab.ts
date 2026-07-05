import type SimpleTemplatesPlugin from 'packages/obsidian/src/main';
import { PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem, App } from 'obsidian';

export class SimpleTemplatesSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		readonly plugin: SimpleTemplatesPlugin,
	) {
		super(app, plugin);
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		await super.setControlValue(key, value);
		if (key === 'templateFolderPath') {
			await this.plugin.registry.refresh();
		}
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Template folder',
				desc: 'Only Markdown files in this folder are treated as templates.',
				control: { type: 'folder', key: 'templateFolderPath', includeRoot: false, placeholder: 'Templates' },
			},
			{
				name: 'Default output folder',
				desc: 'Used when a template does not choose another output location.',
				control: { type: 'folder', key: 'defaultOutputFolderPath', includeRoot: true, placeholder: '/' },
			},
			{
				name: 'Show editor context menu item',
				desc: 'Show "Create note from template" in the Markdown editor context menu.',
				control: { type: 'toggle', key: 'showContextMenuItems' },
			},
		];
	}
}
