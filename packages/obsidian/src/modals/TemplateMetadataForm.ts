import type { VariableDefinition } from 'packages/core/src/index';
import { VariableEditorModal } from 'packages/obsidian/src/modals/VariableEditorModal';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { EditableTemplateMetadata } from 'packages/obsidian/src/templates/TemplateMetadataService';
import type { App } from 'obsidian';
import { SettingGroup } from 'obsidian';

export interface TemplateMetadataFormCallbacks {
	render(): void;
	updatePreview(): void;
}

/** Renders and mutates the editable sections of the template metadata form. */
export class TemplateMetadataForm {
	constructor(
		private readonly app: App,
		private readonly state: EditableTemplateMetadata,
		private readonly specialVariables: ObsidianSpecialVariableRegistry,
		private readonly callbacks: TemplateMetadataFormCallbacks,
	) {}

	renderIdentity(group: SettingGroup): void {
		group.addSetting(setting => {
			setting.setName('Template ID').addText(text =>
				text.setValue(this.state.template.id).onChange(value => {
					this.state.template.id = value;
					this.callbacks.updatePreview();
				}),
			);
		});
		group.addSetting(setting => {
			setting.setName('Name').addText(text =>
				text.setValue(this.state.template.name).onChange(value => {
					this.state.template.name = value;
					this.callbacks.updatePreview();
				}),
			);
		});
		group.addSetting(setting => {
			setting.setName('Description').addText(text =>
				text.setValue(this.state.template.description ?? '').onChange(value => {
					if (value) this.state.template.description = value;
					else delete this.state.template.description;
					this.callbacks.updatePreview();
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
						this.callbacks.updatePreview();
					}),
				);
		});
	}

	renderVariables(containerEl: HTMLElement): void {
		let group = new SettingGroup(containerEl).setHeading('Variables');
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
								this.callbacks.render();
							}),
					);
			});
		}
		group.addSetting(setting => {
			setting.addButton(button => button.setButtonText('Add variable').onClick(() => this.openNewVariableEditor()));
		});
	}

	renderOutput(group: SettingGroup): void {
		let mode = this.state.output.folder?.mode ?? 'default';
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
						this.callbacks.render();
					}),
			);
		});
		if (this.state.output.folder?.mode === 'path') {
			group.addSetting(setting => {
				setting.setName('Folder path').addText(text =>
					text.setValue(this.state.output.folder?.mode === 'path' ? this.state.output.folder.path : '').onChange(value => {
						if (this.state.output.folder?.mode === 'path') this.state.output.folder.path = value;
						this.callbacks.updatePreview();
					}),
				);
			});
		}
		group.addSetting(setting => {
			setting.setName('Filename template').addText(text =>
				text.setValue(this.state.output.filename ?? '').onChange(value => {
					if (value) this.state.output.filename = value;
					else delete this.state.output.filename;
					this.callbacks.updatePreview();
				}),
			);
		});
		group.addSetting(setting => {
			setting.setName('Conflict strategy').addDropdown(dropdown =>
				dropdown
					.addOption('prompt', 'Prompt')
					.addOption('append-number', 'Append number')
					.addOption('cancel', 'Cancel')
					.setValue(this.state.output.conflict ?? 'prompt')
					.onChange(value => {
						this.state.output.conflict = value as 'prompt' | 'append-number' | 'cancel';
						this.callbacks.updatePreview();
					}),
			);
		});
		group.addSetting(setting => {
			setting.setName('Open after create').addToggle(toggle =>
				toggle.setValue(this.state.output.openAfterCreate ?? true).onChange(value => {
					this.state.output.openAfterCreate = value;
					this.callbacks.updatePreview();
				}),
			);
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
				this.callbacks.render();
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
				this.callbacks.render();
			},
		).open();
	}

	private moveVariable(fromIndex: number, toIndex: number): void {
		let entries = Object.entries(this.state.variables);
		let [entry] = entries.splice(fromIndex, 1);
		if (!entry) return;
		entries.splice(toIndex, 0, entry);
		this.state.variables = Object.fromEntries(entries);
		this.callbacks.render();
	}
}
