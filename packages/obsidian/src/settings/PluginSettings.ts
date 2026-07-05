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
	let loadedSettings: Partial<PluginSettings> = {};
	if (value !== null && typeof value === 'object') loadedSettings = value;

	let showContextMenuItems = DEFAULT_SETTINGS.showContextMenuItems;
	if (typeof loadedSettings.showContextMenuItems === 'boolean') {
		showContextMenuItems = loadedSettings.showContextMenuItems;
	}

	return {
		templateFolderPath: loadFolder(loadedSettings.templateFolderPath, DEFAULT_SETTINGS.templateFolderPath),
		defaultOutputFolderPath: loadFolder(loadedSettings.defaultOutputFolderPath, DEFAULT_SETTINGS.defaultOutputFolderPath),
		showContextMenuItems,
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
