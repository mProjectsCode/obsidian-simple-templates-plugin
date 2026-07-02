import { NoteTemplateExecutor } from 'packages/obsidian/src/notes/NoteTemplateExecutor';
import {
	createObsidianSpecialVariableRegistry,
	type ObsidianSpecialVariableRegistry,
} from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import { DEFAULT_SETTINGS, loadPluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import type { PluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import { SimpleTemplatesSettingsTab } from 'packages/obsidian/src/settings/SettingsTab';
import { TemplateMetadataManager } from 'packages/obsidian/src/templates/TemplateMetadataManager';
import { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import { TemplateRegistryMonitor } from 'packages/obsidian/src/templates/TemplateRegistryMonitor';
import 'packages/obsidian/src/styles.css';
import { Notice, Plugin } from 'obsidian';

export default class SimpleTemplatesPlugin extends Plugin {
	settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
	registry!: TemplateRegistry;
	specialVariables!: ObsidianSpecialVariableRegistry;
	private executor!: NoteTemplateExecutor;
	private metadata!: TemplateMetadataManager;

	override async onload(): Promise<void> {
		this.settings = loadPluginSettings(await this.loadData());
		this.specialVariables = createObsidianSpecialVariableRegistry();
		this.registry = new TemplateRegistry(this.app.vault, () => this.settings.templateFolderPath, this.specialVariables);
		this.executor = new NoteTemplateExecutor(this);
		this.metadata = new TemplateMetadataManager(this);

		this.addSettingTab(new SimpleTemplatesSettingsTab(this.app, this));
		this.registerCommands();
		this.registerContextMenu();
		new TemplateRegistryMonitor(this, this.registry, () => this.settings.templateFolderPath).register();
		this.app.workspace.onLayoutReady(() => {
			void this.registry.refresh().catch(error => {
				console.error('Simple Templates: initial registry refresh failed', error);
			});
		});
	}

	private registerCommands(): void {
		this.addCommand({
			id: 'create-note-from-template',
			name: 'Templates: Create note from template',
			callback: () => this.executor.execute(),
		});
		this.addCommand({
			id: 'edit-current-template-metadata',
			name: 'Templates: Edit current template metadata',
			callback: () => this.metadata.editCurrent(),
		});
		this.addCommand({
			id: 'edit-template-metadata',
			name: 'Templates: Edit template metadata…',
			callback: () => this.metadata.pick(),
		});
		this.addCommand({
			id: 'refresh-template-registry',
			name: 'Templates: Refresh template registry',
			callback: async () => {
				await this.registry.refresh();
				new Notice(`Found ${this.registry.getAll().length} valid template(s).`);
			},
		});
		this.addCommand({
			id: 'validate-templates',
			name: 'Templates: Validate templates',
			callback: () => this.metadata.showValidationSummary(),
		});
	}

	private registerContextMenu(): void {
		this.registerEvent(
			this.app.workspace.on('editor-menu', menu => {
				if (!this.settings.ui.showContextMenuItems) return;
				menu.addItem(item =>
					item
						.setTitle('Create note from template')
						.setIcon('copy-plus')
						.onClick(() => this.executor.execute()),
				);
			}),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
