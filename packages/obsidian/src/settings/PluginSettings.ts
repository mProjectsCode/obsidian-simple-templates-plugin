import { VaultPathService } from 'packages/core/src/index';

export interface PluginSettings {
	templateFolderPath: string;
	defaultOutputFolderPath: string;
	showContextMenuItems: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	templateFolderPath: 'Templates',
	defaultOutputFolderPath: '',
	showContextMenuItems: true,
};

const PATHS = new VaultPathService();

/** Deserialises raw plugin data, falling back to defaults for missing keys. */
export function loadPluginSettings(value: unknown): PluginSettings {
	let loaded = value !== null && typeof value === 'object' ? (value as Partial<PluginSettings>) : {};
	return {
		templateFolderPath: loadFolder(loaded.templateFolderPath, DEFAULT_SETTINGS.templateFolderPath),
		defaultOutputFolderPath: loadFolder(loaded.defaultOutputFolderPath, DEFAULT_SETTINGS.defaultOutputFolderPath),
		showContextMenuItems:
			typeof loaded.showContextMenuItems === 'boolean' ? loaded.showContextMenuItems : DEFAULT_SETTINGS.showContextMenuItems,
	};
}

function loadFolder(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	try {
		return PATHS.normalizeFolder(value);
	} catch {
		return fallback;
	}
}
