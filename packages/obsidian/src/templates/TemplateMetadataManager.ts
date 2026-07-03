import { FrontmatterService, VaultPathService } from 'packages/core/src/index';
import type SimpleTemplatesPlugin from 'packages/obsidian/src/main';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { FilePickerModal } from 'packages/obsidian/src/modals/FilePickerModal';
import { TemplateMetadataEditorModal } from 'packages/obsidian/src/modals/TemplateMetadataEditorModal';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';

/** Coordinates template metadata selection, validation, and editing. */
export class TemplateMetadataManager {
	private readonly frontmatter = new FrontmatterService();
	private readonly paths = new VaultPathService();

	constructor(private readonly plugin: SimpleTemplatesPlugin) {}

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
}
