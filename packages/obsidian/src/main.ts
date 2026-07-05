import { NoteTemplateExecutor } from 'packages/obsidian/src/notes/NoteTemplateExecutor';
import { createObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import { DEFAULT_SETTINGS, loadPluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import type { PluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import { SimpleTemplatesSettingsTab } from 'packages/obsidian/src/settings/SettingsTab';
import { TemplateManagementController } from 'packages/obsidian/src/templates/TemplateManagementController';
import { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import { TemplateRegistryMonitor } from 'packages/obsidian/src/templates/TemplateRegistryMonitor';
import 'packages/obsidian/src/styles.css';
import { Notice, Plugin } from 'obsidian';

export default class SimpleTemplatesPlugin extends Plugin {
	settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
	registry!: TemplateRegistry;
	private noteExecutor!: NoteTemplateExecutor;
	private templateManagement!: TemplateManagementController;

	override async onload(): Promise<void> {
		this.settings = loadPluginSettings(await this.loadData());
		let specialVariables = createObsidianSpecialVariableRegistry();
		this.registry = new TemplateRegistry(this.app.vault, () => this.settings.templateFolderPath, specialVariables);
		this.noteExecutor = new NoteTemplateExecutor({
			plugin: this,
			registry: this.registry,
			specialVariables,
			getSettings: () => this.settings,
		});
		this.templateManagement = new TemplateManagementController({
			app: this.app,
			registry: this.registry,
			specialVariables,
			getSettings: () => this.settings,
		});

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
			id: 'create-template',
			name: 'Create template',
			callback: () => this.templateManagement.create(),
		});
		this.addCommand({
			id: 'create-note-from-template',
			name: 'Create note from template',
			callback: () => this.noteExecutor.execute(),
		});
		this.addCommand({
			id: 'edit-current-template-metadata',
			name: 'Edit current template metadata',
			callback: () => this.templateManagement.editCurrent(),
		});
		this.addCommand({
			id: 'edit-template-metadata',
			name: 'Edit template metadata…',
			callback: () => this.templateManagement.pick(),
		});
		this.addCommand({
			id: 'refresh-template-registry',
			name: 'Refresh template registry',
			callback: async () => {
				await this.registry.refresh();
				new Notice(`Found ${this.registry.getAll().length} valid template(s).`);
			},
		});
		this.addCommand({
			id: 'validate-templates',
			name: 'Validate templates',
			callback: () => this.templateManagement.showValidationSummary(),
		});
	}

	private registerContextMenu(): void {
		this.registerEvent(
			this.app.workspace.on('editor-menu', menu => {
				if (!this.settings.showContextMenuItems) {
					return;
				}
				menu.addItem(item =>
					item
						.setTitle('Create note from template')
						.setIcon('copy-plus')
						.onClick(() => this.noteExecutor.execute()),
				);
			}),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
