import { normalizeVaultFolder, parseFrontmatter } from 'packages/core/src/index';
import { FilePickerModal } from 'packages/obsidian/src/modals/FilePickerModal';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { TemplateMetadataEditorModal } from 'packages/obsidian/src/modals/TemplateMetadataEditorModal';
import { NoteTemplateExecutor } from 'packages/obsidian/src/notes/NoteTemplateExecutor';
import {
	createObsidianSpecialVariableRegistry,
	type ObsidianSpecialVariableRegistry,
} from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import { DEFAULT_SETTINGS, loadPluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import type { PluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import { SimpleTemplatesSettingsTab } from 'packages/obsidian/src/settings/SettingsTab';
import { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import { pathAffectsTemplateRegistry } from 'packages/obsidian/src/templates/RegistryPaths';
import type { TAbstractFile } from 'obsidian';
import { Notice, Plugin, TFile, debounce } from 'obsidian';

export default class SimpleTemplatesPlugin extends Plugin {
	settings: PluginSettings = structuredClone(DEFAULT_SETTINGS);
	registry!: TemplateRegistry;
	specialVariables!: ObsidianSpecialVariableRegistry;
	private executor!: NoteTemplateExecutor;

	override async onload(): Promise<void> {
		this.settings = loadPluginSettings(await this.loadData());
		this.specialVariables = createObsidianSpecialVariableRegistry();
		this.registry = new TemplateRegistry(this.app.vault, () => this.settings.templateFolderPath, this.specialVariables);
		this.executor = new NoteTemplateExecutor(this);
		await this.registry.refresh();

		this.addSettingTab(new SimpleTemplatesSettingsTab(this.app, this));
		this.registerCommands();
		this.registerContextMenu();
		this.registerVaultListeners();
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
			callback: () => this.editCurrentTemplate(),
		});
		this.addCommand({
			id: 'edit-template-metadata',
			name: 'Templates: Edit template metadata…',
			callback: () => this.pickMetadataFile(),
		});
		this.addCommand({
			id: 'refresh-template-registry',
			name: 'Templates: Refresh template registry',
			callback: async () => {
				await this.registry.refresh();
				new Notice(`Found ${this.registry.getAll().length} valid template(s).`);
			},
		});
		this.addCommand({ id: 'validate-templates', name: 'Templates: Validate templates', callback: () => this.showValidationSummary() });
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

	private registerVaultListeners(): void {
		let refresh = debounce(
			() => {
				void this.registry.refresh().catch(error => {
					console.error('Simple Templates: registry refresh failed', error);
				});
			},
			250,
			true,
		);
		this.registerEvent(this.app.vault.on('create', file => this.scheduleRegistryRefresh(file, refresh)));
		this.registerEvent(this.app.vault.on('modify', file => this.scheduleRegistryRefresh(file, refresh)));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.scheduleRegistryRefresh(file, refresh, oldPath)));
		this.registerEvent(this.app.vault.on('delete', file => this.scheduleRegistryRefresh(file, refresh)));
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private insideTemplateFolder(file: TFile): boolean {
		return this.pathIsInsideTemplateFolder(file.path);
	}

	private pathIsInsideTemplateFolder(path: string): boolean {
		try {
			let folder = normalizeVaultFolder(this.settings.templateFolderPath);
			return !folder || path.startsWith(`${folder}/`);
		} catch {
			return false;
		}
	}

	/**
	 * Called by vault-change events.  Fires the debounced refresh only if the
	 * changed file could affect the registry (i.e. it is inside the template
	 * folder or is a directory being renamed away / into it).
	 */
	private scheduleRegistryRefresh(file: TAbstractFile, refresh: () => void, oldPath?: string): void {
		let folder: string;
		try {
			folder = normalizeVaultFolder(this.settings.templateFolderPath);
		} catch {
			return;
		}
		let paths = oldPath === undefined ? [file.path] : [file.path, oldPath];
		if (pathAffectsTemplateRegistry(folder, paths, file instanceof TFile)) refresh();
	}

	private async editCurrentTemplate(): Promise<void> {
		let file = this.app.workspace.getActiveFile();
		if (file?.extension !== 'md' || !this.insideTemplateFolder(file)) {
			new Notice('Open a Markdown file inside the configured template folder first.');
			return;
		}
		await this.openMetadataEditor(file);
	}

	private async pickMetadataFile(): Promise<void> {
		let validPaths = new Set(this.registry.getAll().map(template => template.sourcePath));
		let file = await new FilePickerModal(this.app, this.registry.getMarkdownFiles(), validPaths).choose();
		if (file) await this.openMetadataEditor(file);
	}

	private async openMetadataEditor(file: TFile): Promise<void> {
		let content = await this.app.vault.read(file);

		// If the frontmatter is unparseable, offer to open the file for manual repair
		try {
			parseFrontmatter(content);
		} catch (error) {
			let open = await new ConfirmModal(
				this.app,
				'Invalid YAML frontmatter',
				`${error instanceof Error ? error.message : String(error)} Open the file for manual repair?`,
				'Open file',
			).confirm();
			if (open) await this.app.workspace.getLeaf(false).openFile(file);
			return;
		}

		// Collect IDs from other templates so we can detect duplicates
		let otherIds = new Map(
			this.registry
				.getValidationResults()
				.filter(result => result.path !== file.path && result.template?.id)
				.map(result => [result.template?.id ?? '', result.path]),
		);

		new TemplateMetadataEditorModal(
			this.app,
			file,
			content,
			otherIds,
			this.specialVariables,
			async () => this.registry.refresh(),
			async changedFile => this.openMetadataEditor(changedFile),
		).open();
	}

	private showValidationSummary(): void {
		let invalid = this.registry.getValidationResults().filter(result => result.issues.some(issue => issue.severity === 'error'));
		if (invalid.length === 0) {
			new Notice(`All ${this.registry.getAll().length} template(s) are valid.`);
			return;
		}
		let summary = invalid
			.map(
				result =>
					`${result.path}: ${result.issues
						.filter(issue => issue.severity === 'error')
						.map(issue => issue.message)
						.join(' ')}`,
			)
			.join('\n');
		console.warn('Simple Templates validation results\n' + summary);
		new Notice(`${invalid.length} template file(s) are invalid. Details were written to the developer console.`, 8000);
	}
}
