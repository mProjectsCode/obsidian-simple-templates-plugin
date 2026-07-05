import { errorMessage, FrontmatterHelper, VaultPathHelper } from 'packages/core/src/index';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { FilePickerModal } from 'packages/obsidian/src/modals/FilePickerModal';
import { TemplateCreationModal } from 'packages/obsidian/src/modals/TemplateCreationModal';
import { TemplateMetadataEditorModal } from 'packages/obsidian/src/modals/TemplateMetadataEditorModal';
import { TemplateValidationModal } from 'packages/obsidian/src/modals/TemplateValidationModal';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { PluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import type { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import { VaultFolderService } from 'packages/obsidian/src/vault/VaultFolderService';
import type { App, TFile } from 'obsidian';
import { Notice, normalizePath } from 'obsidian';

export interface TemplateManagementDependencies {
	app: App;
	registry: TemplateRegistry;
	specialVariables: ObsidianSpecialVariableRegistry;
	getSettings(): PluginSettings;
}

/** Coordinates template metadata selection, validation, and editing. */
export class TemplateManagementController {
	private readonly frontmatter = new FrontmatterHelper();
	private readonly paths = new VaultPathHelper();
	private readonly folders: VaultFolderService;

	constructor(private readonly dependencies: TemplateManagementDependencies) {
		this.folders = new VaultFolderService(dependencies.app.vault);
	}

	async create(): Promise<void> {
		let request = await new TemplateCreationModal(this.dependencies.app).collect();
		if (!request) {
			return;
		}

		try {
			await this.dependencies.registry.refresh();
			let duplicate = this.dependencies.registry.getValidationResults().find(result => result.template?.id === request.id);
			if (duplicate) {
				new Notice(`Template ID "${request.id}" is already used by "${duplicate.path}".`);
				return;
			}
			let folder = this.paths.normalizeFolder(this.dependencies.getSettings().templateFolderPath);
			await this.folders.ensureExists(folder);
			let path = normalizePath(folder ? `${folder}/${request.filename}` : request.filename);
			if (this.dependencies.app.vault.getAbstractFileByPath(path)) {
				new Notice(`A file already exists at "${path}".`);
				return;
			}

			let content = this.frontmatter.mergeTemplate('', {
				template: { id: request.id, name: request.name },
				variables: {},
				output: {},
			});
			let file = await this.dependencies.app.vault.create(path, `${content}\n`);
			await this.dependencies.registry.refreshFile(file);
			await this.dependencies.app.workspace.getLeaf(false).openFile(file);
			await this.openEditor(file);
		} catch (error) {
			console.error('Simple Templates: template creation failed', error);
			new Notice(errorMessage(error));
		}
	}

	async editCurrent(): Promise<void> {
		let file = this.dependencies.app.workspace.getActiveFile();
		if (file?.extension !== 'md' || !this.isInsideTemplateFolder(file.path)) {
			new Notice('Open a Markdown file inside the configured template folder first.');
			return;
		}
		await this.openEditor(file);
	}

	async pick(): Promise<void> {
		let validPaths = new Set(this.dependencies.registry.getAll().map(template => template.sourcePath));
		let file = await new FilePickerModal(this.dependencies.app, this.dependencies.registry.getMarkdownFiles(), validPaths).choose();
		if (file) {
			await this.openEditor(file);
		}
	}

	showValidationSummary(): void {
		let invalid = this.dependencies.registry
			.getValidationResults()
			.filter(result => result.issues.some(issue => issue.severity === 'error'));
		if (invalid.length === 0) {
			new Notice(`All ${this.dependencies.registry.getAll().length} template(s) are valid.`);
			return;
		}
		new TemplateValidationModal(this.dependencies.app, invalid).open();
	}

	private isInsideTemplateFolder(path: string): boolean {
		try {
			let folder = this.paths.normalizeFolder(this.dependencies.getSettings().templateFolderPath);
			return this.paths.isInFolder(path, folder);
		} catch {
			return false;
		}
	}

	private async openEditor(file: TFile): Promise<void> {
		let content = await this.dependencies.app.vault.read(file);
		try {
			this.frontmatter.parse(content);
		} catch (error) {
			let open = await new ConfirmModal(
				this.dependencies.app,
				'Invalid YAML frontmatter',
				`${errorMessage(error)} Open the file for manual repair?`,
				'Open file',
			).confirm();
			if (open) {
				await this.dependencies.app.workspace.getLeaf(false).openFile(file);
			}
			return;
		}

		let otherIds = new Map(
			this.dependencies.registry
				.getValidationResults()
				.filter(result => result.path !== file.path && result.template?.id)
				.map(result => [result.template?.id ?? '', result.path]),
		);
		new TemplateMetadataEditorModal(
			this.dependencies.app,
			file,
			content,
			otherIds,
			this.dependencies.specialVariables,
			async () => this.dependencies.registry.refresh(),
			async changedFile => this.openEditor(changedFile),
		).open();
	}
}
