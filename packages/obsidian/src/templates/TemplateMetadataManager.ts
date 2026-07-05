import { FrontmatterService, VaultPathService } from 'packages/core/src/index';
import type SimpleTemplatesPlugin from 'packages/obsidian/src/main';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { FilePickerModal } from 'packages/obsidian/src/modals/FilePickerModal';
import { TemplateCreationModal } from 'packages/obsidian/src/modals/TemplateCreationModal';
import { TemplateMetadataEditorModal } from 'packages/obsidian/src/modals/TemplateMetadataEditorModal';
import { TemplateValidationModal } from 'packages/obsidian/src/modals/TemplateValidationModal';
import type { TFile } from 'obsidian';
import { Notice, TFolder, normalizePath } from 'obsidian';

/** Coordinates template metadata selection, validation, and editing. */
export class TemplateMetadataManager {
	private readonly frontmatter = new FrontmatterService();
	private readonly paths = new VaultPathService();

	constructor(private readonly plugin: SimpleTemplatesPlugin) {}

	async create(): Promise<void> {
		let request = await new TemplateCreationModal(this.plugin.app).collect();
		if (!request) return;

		try {
			await this.plugin.registry.refresh();
			let duplicate = this.plugin.registry.getValidationResults().find(result => result.template?.id === request.id);
			if (duplicate) {
				new Notice(`Template ID "${request.id}" is already used by "${duplicate.path}".`);
				return;
			}
			let folder = this.paths.normalizeFolder(this.plugin.settings.templateFolderPath);
			await this.ensureFolder(folder);
			let path = normalizePath(folder ? `${folder}/${request.filename}` : request.filename);
			if (this.plugin.app.vault.getAbstractFileByPath(path)) {
				new Notice(`A file already exists at "${path}".`);
				return;
			}

			let content = this.frontmatter.mergeTemplate('', {
				template: { id: request.id, name: request.name },
				variables: {},
				output: {},
			});
			let file = await this.plugin.app.vault.create(path, `${content}\n`);
			await this.plugin.registry.refreshFile(file);
			await this.plugin.app.workspace.getLeaf(false).openFile(file);
			await this.openEditor(file);
		} catch (error) {
			console.error('Simple Templates: template creation failed', error);
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	async editCurrent(): Promise<void> {
		let file = this.plugin.app.workspace.getActiveFile();
		if (file?.extension !== 'md' || !this.isInsideTemplateFolder(file.path)) {
			new Notice('Open a Markdown file inside the configured template folder first.');
			return;
		}
		await this.openEditor(file);
	}

	async pick(): Promise<void> {
		let validPaths = new Set(this.plugin.registry.getAll().map(template => template.sourcePath));
		let file = await new FilePickerModal(this.plugin.app, this.plugin.registry.getMarkdownFiles(), validPaths).choose();
		if (file) await this.openEditor(file);
	}

	showValidationSummary(): void {
		let invalid = this.plugin.registry.getValidationResults().filter(result => result.issues.some(issue => issue.severity === 'error'));
		if (invalid.length === 0) {
			new Notice(`All ${this.plugin.registry.getAll().length} template(s) are valid.`);
			return;
		}
		new TemplateValidationModal(this.plugin.app, invalid).open();
	}

	private isInsideTemplateFolder(path: string): boolean {
		try {
			let folder = this.paths.normalizeFolder(this.plugin.settings.templateFolderPath);
			return !folder || path.startsWith(`${folder}/`);
		} catch {
			return false;
		}
	}

	private async openEditor(file: TFile): Promise<void> {
		let content = await this.plugin.app.vault.read(file);
		try {
			this.frontmatter.parse(content);
		} catch (error) {
			let open = await new ConfirmModal(
				this.plugin.app,
				'Invalid YAML frontmatter',
				`${error instanceof Error ? error.message : String(error)} Open the file for manual repair?`,
				'Open file',
			).confirm();
			if (open) await this.plugin.app.workspace.getLeaf(false).openFile(file);
			return;
		}

		let otherIds = new Map(
			this.plugin.registry
				.getValidationResults()
				.filter(result => result.path !== file.path && result.template?.id)
				.map(result => [result.template?.id ?? '', result.path]),
		);
		new TemplateMetadataEditorModal(
			this.plugin.app,
			file,
			content,
			otherIds,
			this.plugin.specialVariables,
			async () => this.plugin.registry.refresh(),
			async changedFile => this.openEditor(changedFile),
		).open();
	}

	private async ensureFolder(folder: string): Promise<void> {
		if (!folder) return;
		let existing = this.plugin.app.vault.getAbstractFileByPath(folder);
		if (existing instanceof TFolder) return;
		if (existing) throw new Error(`The template folder path "${folder}" is not a folder.`);

		let current = '';
		for (let segment of folder.split('/')) {
			current = current ? `${current}/${segment}` : segment;
			let item = this.plugin.app.vault.getAbstractFileByPath(current);
			if (item && !(item instanceof TFolder)) throw new Error(`The template folder path "${current}" is not a folder.`);
			if (!item) await this.plugin.app.vault.createFolder(current);
		}
	}
}
