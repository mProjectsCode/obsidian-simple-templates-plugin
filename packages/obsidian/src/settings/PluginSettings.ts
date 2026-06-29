export interface PluginSettings {
	templateFolderPath: string;
	defaultOutputFolderPath: string;
	ui: { showContextMenuItems: boolean };
}

export const DEFAULT_SETTINGS: PluginSettings = {
	templateFolderPath: 'Templates',
	defaultOutputFolderPath: '',
	ui: { showContextMenuItems: true },
};

/** Deserialises raw plugin data, falling back to defaults for missing keys. */
export function loadPluginSettings(value: unknown): PluginSettings {
	let loaded = value !== null && typeof value === 'object' ? (value as Partial<PluginSettings>) : {};
	return {
		templateFolderPath: typeof loaded.templateFolderPath === 'string' ? loaded.templateFolderPath : DEFAULT_SETTINGS.templateFolderPath,
		defaultOutputFolderPath:
			typeof loaded.defaultOutputFolderPath === 'string' ? loaded.defaultOutputFolderPath : DEFAULT_SETTINGS.defaultOutputFolderPath,
		ui: {
			showContextMenuItems:
				typeof loaded.ui?.showContextMenuItems === 'boolean'
					? loaded.ui.showContextMenuItems
					: DEFAULT_SETTINGS.ui.showContextMenuItems,
		},
	};
}
