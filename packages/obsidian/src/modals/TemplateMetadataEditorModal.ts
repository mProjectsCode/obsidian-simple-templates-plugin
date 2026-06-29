import { parseFrontmatter, serializeFrontmatter, SPECIAL_VARIABLE_SOURCES, VARIABLE_TYPES } from 'packages/core/src/index';
import type { SpecialVariableSource, ValidationIssue, VariableDefinition, VariableType } from 'packages/core/src/index';
import {
	createEditableTemplateMetadata,
	mergeEditableTemplateMetadata,
	validateEditableTemplateMetadata,
} from 'packages/obsidian/src/modals/TemplateMetadataState';
import type { EditableTemplateMetadata } from 'packages/obsidian/src/modals/TemplateMetadataState';
import type { App, TFile } from 'obsidian';
import { Modal, Notice, Setting } from 'obsidian';
import { parse } from 'yaml';
import { ConfirmModal } from 'packages/obsidian/src/modals/ConfirmModal';

export class TemplateMetadataEditorModal extends Modal {
	private state: EditableTemplateMetadata;
	private previewEl: HTMLTextAreaElement | null = null;
	private validationEl: HTMLElement | null = null;

	constructor(
		app: App,
		private readonly file: TFile,
		private originalContent: string,
		private readonly otherIds: Map<string, string>,
		private readonly onSaved: () => Promise<void>,
		private readonly onReload: (file: TFile) => Promise<void>,
	) {
		super(app);
		this.state = createEditableTemplateMetadata(originalContent);
	}

	override onOpen(): void {
		this.render();
	}
	override onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		this.contentEl.empty();
		this.setTitle(`Edit template metadata — ${this.file.basename}`);
		this.contentEl.createEl('h3', { text: 'Identity' });
		new Setting(this.contentEl).setName('Template ID').addText(text =>
			text.setValue(this.state.template.id).onChange(value => {
				this.state.template.id = value;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Name').addText(text =>
			text.setValue(this.state.template.name).onChange(value => {
				this.state.template.name = value;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Description').addText(text =>
			text.setValue(this.state.template.description ?? '').onChange(value => {
				if (value) this.state.template.description = value;
				else delete this.state.template.description;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl)
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

		this.contentEl.createEl('h3', { text: 'Variables' });
		for (let [name, definition] of Object.entries(this.state.variables)) this.renderVariable(name, definition);
		new Setting(this.contentEl).addButton(button =>
			button.setButtonText('Add variable').onClick(() => {
				let index = 1;
				while (`variable${index}` in this.state.variables) index += 1;
				this.state.variables[`variable${index}`] = { type: 'text' };
				this.render();
			}),
		);

		this.renderOutput();
		this.contentEl.createEl('h3', { text: 'Raw YAML preview' });
		new Setting(this.contentEl).addTextArea(textarea => {
			this.previewEl = textarea.inputEl;
			textarea.inputEl.readOnly = true;
			textarea.inputEl.rows = 12;
		});
		this.contentEl.createEl('h3', { text: 'Validation' });
		this.validationEl = this.contentEl.createDiv();
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(button =>
				button
					.setCta()
					.setButtonText('Save')
					.onClick(() => this.save()),
			);
		this.updatePreview();
	}

	private renderVariable(name: string, definition: VariableDefinition): void {
		let heading = this.contentEl.createEl('h4', { text: name });
		heading.addClass('setting-item-heading');
		new Setting(this.contentEl).setName('Key').addText(text =>
			text.setValue(name).onChange(value => {
				if (value === name || !value) return;
				if (!(value in this.state.variables)) {
					let entries: [string, VariableDefinition][] = Object.entries(this.state.variables).map(([key, item]) =>
						key === name ? [value, item] : [key, item],
					);
					this.state.variables = Object.fromEntries(entries);
					name = value;
				}
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Label').addText(text =>
			text.setValue(definition.label ?? '').onChange(value => {
				if (value) definition.label = value;
				else delete definition.label;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Description').addText(text =>
			text.setValue(definition.description ?? '').onChange(value => {
				if (value) definition.description = value;
				else delete definition.description;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Type').addDropdown(dropdown => {
			for (let type of VARIABLE_TYPES) dropdown.addOption(type, type);
			dropdown.setValue(definition.type).onChange(value => {
				definition.type = value as VariableType;
				this.render();
			});
		});
		new Setting(this.contentEl).setName('Required').addToggle(toggle =>
			toggle.setValue(definition.required ?? false).onChange(value => {
				if (value) definition.required = true;
				else delete definition.required;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl)
			.setName('Default')
			.setDesc('YAML scalar or collection')
			.addText(text =>
				text
					.setValue(
						definition.default === undefined
							? ''
							: serializeFrontmatter({ value: definition.default })
									.replace(/^value:\s*/, '')
									.trim(),
					)
					.onChange(value => {
						if (!value.trim()) delete definition.default;
						else {
							try {
								let parsed: unknown = parse(value);
								definition.default = parsed;
							} catch {
								definition.default = value;
							}
						}
						this.updatePreview();
					}),
			);
		new Setting(this.contentEl).setName('Formula').addText(text =>
			text.setValue(definition.formula ?? '').onChange(value => {
				if (value) definition.formula = value;
				else delete definition.formula;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Source').addDropdown(dropdown => {
			dropdown.addOption('', 'None');
			for (let source of SPECIAL_VARIABLE_SOURCES) dropdown.addOption(source, source);
			dropdown.setValue(definition.source ?? '').onChange(value => {
				if (value) definition.source = value as SpecialVariableSource;
				else delete definition.source;
				this.updatePreview();
			});
		});
		new Setting(this.contentEl)
			.setName('Options')
			.setDesc('One option per line')
			.addTextArea(textarea =>
				textarea.setValue(definition.options?.join('\n') ?? '').onChange(value => {
					let options = value
						.split(/\r?\n/)
						.map(option => option.trim())
						.filter(Boolean);
					if (options.length) definition.options = options;
					else delete definition.options;
					this.updatePreview();
				}),
			);
		new Setting(this.contentEl).setName('Ask for value').addToggle(toggle =>
			toggle.setValue(definition.ask ?? false).onChange(value => {
				if (value) definition.ask = true;
				else delete definition.ask;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).addButton(button =>
			button
				.setDestructive()
				.setButtonText('Remove variable')
				.onClick(() => {
					delete this.state.variables[name];
					this.render();
				}),
		);
	}

	private renderOutput(): void {
		this.contentEl.createEl('h3', { text: 'Output' });
		let mode = this.state.output.folder?.mode ?? 'default';
		new Setting(this.contentEl).setName('Folder mode').addDropdown(dropdown =>
			dropdown
				.addOption('default', 'Default output folder')
				.addOption('same-as-active-file', 'Same folder as active file')
				.addOption('path', 'Explicit path')
				.setValue(mode)
				.onChange(value => {
					this.state.output.folder = value === 'path' ? { mode: 'path', path: '' } : { mode: value as 'default' | 'same-as-active-file' };
					this.render();
				}),
		);
		if (this.state.output.folder?.mode === 'path')
			new Setting(this.contentEl).setName('Folder path').addText(text =>
				text.setValue(this.state.output.folder?.mode === 'path' ? this.state.output.folder.path : '').onChange(value => {
					if (this.state.output.folder?.mode === 'path') this.state.output.folder.path = value;
					this.updatePreview();
				}),
			);
		new Setting(this.contentEl).setName('Filename template').addText(text =>
			text.setValue(this.state.output.filename ?? '').onChange(value => {
				if (value) this.state.output.filename = value;
				else delete this.state.output.filename;
				this.updatePreview();
			}),
		);
		new Setting(this.contentEl).setName('Conflict strategy').addDropdown(dropdown =>
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
		new Setting(this.contentEl).setName('Open after create').addToggle(toggle =>
			toggle.setValue(this.state.output.openAfterCreate ?? true).onChange(value => {
				this.state.output.openAfterCreate = value;
				this.updatePreview();
			}),
		);
	}

	private mergedContent(): string {
		return mergeEditableTemplateMetadata(this.originalContent, this.state);
	}

	private getIssues(): ValidationIssue[] {
		return validateEditableTemplateMetadata(this.file.path, this.originalContent, this.state, this.otherIds);
	}

	private updatePreview(): void {
		try {
			let document = parseFrontmatter(this.mergedContent());
			if (this.previewEl) this.previewEl.value = serializeFrontmatter(document.data);
			let issues = this.getIssues();
			if (this.validationEl) {
				this.validationEl.empty();
				if (issues.length === 0) this.validationEl.setText('No validation issues.');
				else
					for (let issue of issues)
						this.validationEl.createEl('div', { text: `${issue.severity === 'error' ? 'Error' : 'Warning'}: ${issue.message}` });
			}
		} catch (error) {
			this.validationEl?.setText(error instanceof Error ? error.message : String(error));
		}
	}

	private async save(): Promise<void> {
		let issues = this.getIssues();
		if (issues.some(issue => issue.severity === 'error')) {
			new Notice('Fix metadata errors before saving.');
			return;
		}
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
		await this.app.vault.modify(this.file, this.mergedContent());
		this.originalContent = this.mergedContent();
		await this.onSaved();
		new Notice(`Saved template metadata for “${this.file.basename}”.`);
		this.close();
	}
}
