import { errorMessage, FrontmatterService } from 'packages/core/src/index';
import type { ValidationIssue } from 'packages/core/src/index';
import { TemplateMetadataForm } from 'packages/obsidian/src/modals/TemplateMetadataForm';
import { TemplateMetadataService } from 'packages/obsidian/src/templates/TemplateMetadataService';
import type { EditableTemplateMetadata } from 'packages/obsidian/src/templates/TemplateMetadataService';
import type { App, TFile } from 'obsidian';
import { Modal, Notice, SettingGroup } from 'obsidian';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import { addModalActions } from 'packages/obsidian/src/modals/ModalActions';

/**
 * Modal for editing a template's frontmatter metadata (identity, variables,
 * output settings) through structured form fields rather than raw YAML.
 */
export class TemplateMetadataEditorModal extends Modal {
	private state: EditableTemplateMetadata;
	private previewEl: HTMLElement | null = null;
	private validationEl: HTMLElement | null = null;
	private readonly frontmatter = new FrontmatterService();
	private readonly metadata: TemplateMetadataService;
	private readonly form: TemplateMetadataForm;

	constructor(
		app: App,
		private readonly file: TFile,
		private originalContent: string,
		private readonly otherIds: Map<string, string>,
		specialVariables: ObsidianSpecialVariableRegistry,
		private readonly onSaved: () => Promise<void>,
		private readonly onReload: (file: TFile) => Promise<void>,
	) {
		super(app);
		this.modalEl.addClass('simple-templates-modal');
		this.metadata = new TemplateMetadataService(specialVariables);
		this.state = this.metadata.createEditable(originalContent);
		this.form = new TemplateMetadataForm(app, this.state, specialVariables, {
			render: () => this.render(),
			updatePreview: () => this.updatePreview(),
		});
	}

	override onOpen(): void {
		this.render();
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	/** Builds the entire modal UI from scratch.  Called after every state
	 *  mutation that changes the field count (e.g. adding/removing a variable). */
	private render(): void {
		this.contentEl.empty();

		this.setTitle(`Edit template metadata: ${this.file.basename}`);

		let identityGroup = new SettingGroup(this.contentEl);
		identityGroup.setHeading('Identity');
		this.form.renderIdentity(identityGroup);

		this.form.renderVariables(this.contentEl);

		let outputGroup = new SettingGroup(this.contentEl);
		outputGroup.setHeading('Output');
		this.form.renderOutput(outputGroup);

		this.renderPreview();
		this.renderValidation();
		this.renderActions();
		this.updatePreview();
	}

	private renderPreview(): void {
		let previewGroup = new SettingGroup(this.contentEl);
		previewGroup.setHeading('Raw YAML preview');
		let pre = this.contentEl.createEl('pre');
		this.previewEl = pre.createEl('code', { cls: 'language-yaml' });
	}

	private renderValidation(): void {
		let validationGroup = new SettingGroup(this.contentEl);
		validationGroup.setHeading('Validation');
		this.validationEl = this.contentEl.createDiv();
	}

	private renderActions(): void {
		addModalActions(
			this.contentEl,
			'Save',
			() => this.close(),
			() => this.save(),
		);
	}

	private mergedContent(): string {
		return this.metadata.merge(this.originalContent, this.state);
	}

	private getIssues(): ValidationIssue[] {
		return this.metadata.validate(this.file.path, this.originalContent, this.state, this.otherIds);
	}

	/** Re-renders the YAML preview code block and the validation status. */
	private updatePreview(): void {
		try {
			let document = this.frontmatter.parse(this.mergedContent());
			this.previewEl?.setText(this.frontmatter.serialize(document.data));

			let issues = this.getIssues();
			if (this.validationEl) {
				this.validationEl.empty();
				if (issues.length === 0) {
					this.validationEl.setText('No validation issues.');
				} else {
					for (let issue of issues) {
						this.validationEl.createDiv({
							text: `${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`,
						});
					}
				}
			}
		} catch (error) {
			this.validationEl?.setText(errorMessage(error));
		}
	}

	/** Validates, checks for external changes, and updates template frontmatter. */
	private async save(): Promise<void> {
		let issues = this.getIssues();
		if (issues.some(issue => issue.severity === 'error')) {
			new Notice('Fix metadata errors before saving.');
			return;
		}

		// Detect concurrent edits
		let current = await this.app.vault.read(this.file);
		if (current !== this.originalContent) {
			let reload = await new ConfirmModal(
				this.app,
				'Template changed',
				'The file changed while the editor was open. Reload it instead of overwriting those changes?',
				'Reload',
			).confirm();
			if (reload) {
				this.close();
				await this.onReload(this.file);
			}
			return;
		}

		await this.app.fileManager.processFrontMatter(this.file, (frontmatter: Record<string, unknown>) => {
			this.metadata.apply(frontmatter, this.state);
		});
		this.originalContent = await this.app.vault.read(this.file);
		await this.onSaved();
		new Notice(`Saved template metadata for "${this.file.basename}".`);
		this.close();
	}
}
