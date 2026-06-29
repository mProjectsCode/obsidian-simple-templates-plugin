import type SimpleTemplatesPlugin from 'packages/obsidian/src/main';
import { PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem, App } from 'obsidian';

/** Reads a value from a nested object using a dot-separated path (e.g.
 *  `"ui.showContextMenuItems"`). */
function getPath(object: object, path: string): unknown {
	let cursor: unknown = object;
	for (let part of path.split('.')) {
		if (cursor === null || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
}

/** Writes a value into a nested object, creating intermediate objects as
 *  needed. */
function setPath(object: object, path: string, value: unknown): void {
	let parts = path.split('.');
	let last = parts.pop();
	if (!last) return;
	let cursor = object as Record<string, unknown>;
	for (let part of parts) {
		let next = cursor[part];
		if (next === null || typeof next !== 'object') cursor[part] = {};
		cursor = cursor[part] as Record<string, unknown>;
	}
	cursor[last] = value;
}

export class SimpleTemplatesSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		readonly plugin: SimpleTemplatesPlugin,
	) {
		super(app, plugin);
	}

	override getControlValue(key: string): unknown {
		return getPath(this.plugin.settings, key);
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		setPath(this.plugin.settings, key, value);
		await this.plugin.saveSettings();
		if (key === 'templateFolderPath') await this.plugin.registry.refresh();
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
				control: { type: 'toggle', key: 'ui.showContextMenuItems' },
			},
		];
	}
}
