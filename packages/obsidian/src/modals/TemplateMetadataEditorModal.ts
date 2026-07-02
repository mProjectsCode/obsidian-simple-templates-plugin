import { FrontmatterService } from 'packages/core/src/index';
import type { ValidationIssue, VariableDefinition } from 'packages/core/src/index';
import {
	createEditableTemplateMetadata,
	mergeEditableTemplateMetadata,
	validateEditableTemplateMetadata,
} from 'packages/obsidian/src/modals/TemplateMetadataState';
import type { EditableTemplateMetadata } from 'packages/obsidian/src/modals/TemplateMetadataState';
import type { App, TFile } from 'obsidian';
import { Modal, Notice, SettingGroup } from 'obsidian';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';
import { VariableEditorModal } from 'packages/obsidian/src/modals/VariableEditorModal';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';

/**
 * Modal for editing a template's frontmatter metadata (identity, variables,
 * output settings) through structured form fields rather than raw YAML.
 */
export class TemplateMetadataEditorModal extends Modal {
	private state: EditableTemplateMetadata;
	private previewEl: HTMLElement | null = null;
	private validationEl: HTMLElement | null = null;
	private readonly frontmatter = new FrontmatterService();

	constructor(
		app: App,
		private readonly file: TFile,
		private originalContent: string,
		private readonly otherIds: Map<string, string>,
		private readonly specialVariables: ObsidianSpecialVariableRegistry,
		private readonly onSaved: () => Promise<void>,
		private readonly onReload: (file: TFile) => Promise<void>,
	) {
		super(app);
		this.modalEl.addClass('simple-templates-modal');
		this.state = createEditableTemplateMetadata(originalContent);
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

		this.setTitle(`Edit template metadata — ${this.file.basename}`);

		let identityGroup = new SettingGroup(this.contentEl);
		identityGroup.setHeading('Identity');
		this.renderIdentityFields(identityGroup);

		this.renderVariables();

		let outputGroup = new SettingGroup(this.contentEl);
		outputGroup.setHeading('Output');
		this.renderOutput(outputGroup);

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
		new SettingGroup(this.contentEl).addSetting(setting => {
			setting
				.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
				.addButton(button =>
					button
						.setCta()
						.setButtonText('Save')
						.onClick(() => this.save()),
				);
		});
	}

	/** Renders the three identity text fields (id, name, description) and the
	 *  tags input. */
	private renderIdentityFields(group: SettingGroup): void {
		group.addSetting(setting => {
			setting.setName('Template ID').addText(text =>
				text.setValue(this.state.template.id).onChange(value => {
					this.state.template.id = value;
					this.updatePreview();
				}),
			);
		});

		group.addSetting(setting => {
			setting.setName('Name').addText(text =>
				text.setValue(this.state.template.name).onChange(value => {
					this.state.template.name = value;
					this.updatePreview();
				}),
			);
		});

		group.addSetting(setting => {
			setting.setName('Description').addText(text =>
				text.setValue(this.state.template.description ?? '').onChange(value => {
					if (value) this.state.template.description = value;
					else delete this.state.template.description;
					this.updatePreview();
				}),
			);
		});

		group.addSetting(setting => {
			setting
				.setName('Tags')
				.setDesc('Comma-separated')
				.addText(text =>
					text.setValue(this.state.template.tags?.join(', ') ?? '').onChange(value => {
						let tags = value
							.split(',')
							.map(tag => tag.trim())
							.filter(Boolean);
						if (tags.length) this.state.template.tags = tags;
						else delete this.state.template.tags;
						this.updatePreview();
					}),
				);
		});
	}

	/** Renders variables as an ordered summary list with focused actions. */
	private renderVariables(): void {
		let group = new SettingGroup(this.contentEl);
		group.setHeading('Variables');
		let entries = Object.entries(this.state.variables);

		for (let [index, [name, definition]] of entries.entries()) {
			group.addSetting(setting => {
				let detail = definition.type === 'input' ? `input · ${definition.inputType}` : definition.type;
				setting.setName(name).setDesc(definition.label ? `${definition.label} · ${detail}` : detail);
				setting
					.addButton(button =>
						button
							.setIcon('arrow-up')
							.setTooltip(`Move ${name} up`)
							.setDisabled(index === 0)
							.onClick(() => this.moveVariable(index, index - 1)),
					)
					.addButton(button =>
						button
							.setIcon('arrow-down')
							.setTooltip(`Move ${name} down`)
							.setDisabled(index === entries.length - 1)
							.onClick(() => this.moveVariable(index, index + 1)),
					)
					.addButton(button =>
						button
							.setIcon('pencil')
							.setTooltip(`Edit ${name}`)
							.onClick(() => this.openVariableEditor(name, definition)),
					)
					.addButton(button =>
						button
							.setIcon('trash-2')
							.setTooltip(`Delete ${name}`)
							.setDestructive()
							.onClick(() => {
								delete this.state.variables[name];
								this.render();
							}),
					);
			});
		}

		group.addSetting(setting => {
			setting.addButton(button => button.setButtonText('Add variable').onClick(() => this.openNewVariableEditor()));
		});
	}

	private openVariableEditor(name: string, definition: VariableDefinition): void {
		new VariableEditorModal(
			this.app,
			name,
			name,
			definition,
			new Set(Object.keys(this.state.variables)),
			this.specialVariables,
			(updatedName, updatedDefinition) => {
				let entries = Object.entries(this.state.variables).map(([entryName, entryDefinition]) =>
					entryName === name ? ([updatedName, updatedDefinition] as const) : ([entryName, entryDefinition] as const),
				);
				this.state.variables = Object.fromEntries(entries);
				this.render();
			},
		).open();
	}

	private openNewVariableEditor(): void {
		let index = 1;
		while (`variable${index}` in this.state.variables) index += 1;
		new VariableEditorModal(
			this.app,
			null,
			`variable${index}`,
			{ type: 'input', inputType: 'text' },
			new Set(Object.keys(this.state.variables)),
			this.specialVariables,
			(name, definition) => {
				this.state.variables[name] = definition;
				this.render();
			},
		).open();
	}

	private moveVariable(fromIndex: number, toIndex: number): void {
		let entries = Object.entries(this.state.variables);
		let [entry] = entries.splice(fromIndex, 1);
		if (!entry) return;
		entries.splice(toIndex, 0, entry);
		this.state.variables = Object.fromEntries(entries);
		this.render();
	}

	/** Renders the output configuration fields. */
	private renderOutput(group: SettingGroup): void {
		let mode = this.state.output.folder?.mode ?? 'default';

		// Folder mode selector
		group.addSetting(setting => {
			setting.setName('Folder mode').addDropdown(dropdown =>
				dropdown
					.addOption('default', 'Default output folder')
					.addOption('same-as-active-file', 'Same folder as active file')
					.addOption('path', 'Explicit path')
					.setValue(mode)
					.onChange(value => {
						this.state.output.folder =
							value === 'path' ? { mode: 'path', path: '' } : { mode: value as 'default' | 'same-as-active-file' };
						this.render();
					}),
			);
		});

		// Path input (only shown in "Explicit path" mode)
		if (this.state.output.folder?.mode === 'path') {
			group.addSetting(setting => {
				setting.setName('Folder path').addText(text =>
					text.setValue(this.state.output.folder?.mode === 'path' ? this.state.output.folder.path : '').onChange(value => {
						if (this.state.output.folder?.mode === 'path') this.state.output.folder.path = value;
						this.updatePreview();
					}),
				);
			});
		}

		// Filename template
		group.addSetting(setting => {
			setting.setName('Filename template').addText(text =>
				text.setValue(this.state.output.filename ?? '').onChange(value => {
					if (value) this.state.output.filename = value;
					else delete this.state.output.filename;
					this.updatePreview();
				}),
			);
		});

		// Conflict strategy
		group.addSetting(setting => {
			setting.setName('Conflict strategy').addDropdown(dropdown =>
				dropdown
					.addOption('prompt', 'Prompt')
					.addOption('append-number', 'Append number')
					.addOption('cancel', 'Cancel')
					.setValue(this.state.output.conflict ?? 'prompt')
					.onChange(value => {
						this.state.output.conflict = value as 'prompt' | 'append-number' | 'cancel';
						this.updatePreview();
					}),
			);
		});

		// Open after create toggle
		group.addSetting(setting => {
			setting.setName('Open after create').addToggle(toggle =>
				toggle.setValue(this.state.output.openAfterCreate ?? true).onChange(value => {
					this.state.output.openAfterCreate = value;
					this.updatePreview();
				}),
			);
		});
	}

	private mergedContent(): string {
		return mergeEditableTemplateMetadata(this.originalContent, this.state);
	}

	private getIssues(): ValidationIssue[] {
		return validateEditableTemplateMetadata(this.file.path, this.originalContent, this.state, this.otherIds, this.specialVariables);
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
						this.validationEl.createEl('div', {
							text: `${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}`,
						});
					}
				}
			}
		} catch (error) {
			this.validationEl?.setText(error instanceof Error ? error.message : String(error));
		}
	}

	/** Validates, checks for external changes, and writes the merged content
	 *  back to the vault. */
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

		let mergedContent = this.mergedContent();
		await this.app.vault.modify(this.file, mergedContent);
		this.originalContent = mergedContent;
		await this.onSaved();
		new Notice(`Saved template metadata for “${this.file.basename}”.`);
		this.close();
	}
}
