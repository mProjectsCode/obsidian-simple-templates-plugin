import { FILE_CONFLICT_STRATEGIES, OUTPUT_FOLDER_MODES, splitAndTrim } from 'packages/core/src/index';
import type { FileConflictStrategy, OutputFolderMode, VariableDefinition } from 'packages/core/src/index';
import { VariableEditorModal } from 'packages/obsidian/src/modals/VariableEditorModal';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { EditableTemplateMetadata } from 'packages/obsidian/src/templates/TemplateMetadataHelper';
import type { App } from 'obsidian';
import { SettingGroup } from 'obsidian';

export interface TemplateMetadataFormCallbacks {
	render(): void;
	updatePreview(): void;
}

const OUTPUT_FOLDER_LABELS: Record<OutputFolderMode, string> = {
	default: 'Default output folder',
	'same-as-active-file': 'Same folder as active file',
	path: 'Explicit path',
};

const FILE_CONFLICT_LABELS: Record<FileConflictStrategy, string> = {
	prompt: 'Prompt',
	'append-number': 'Append number',
	cancel: 'Cancel',
};

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
					if (value) {
						this.state.template.description = value;
					} else {
						delete this.state.template.description;
					}
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
						let tags = splitAndTrim(value, ',');
						if (tags.length) {
							this.state.template.tags = tags;
						} else {
							delete this.state.template.tags;
						}
						this.callbacks.updatePreview();
					}),
				);
		});
	}

	renderVariables(containerEl: HTMLElement): void {
		let group = new SettingGroup(containerEl).setHeading('Variables');
		let variableEntries = Object.entries(this.state.variables);

		for (let [index, variableEntry] of variableEntries.entries()) {
			let variableName = variableEntry[0];
			let definition = variableEntry[1];

			group.addSetting(setting => {
				let typeDescription: string = definition.type;
				if (definition.type === 'input') {
					typeDescription = `input · ${definition.inputType}`;
				}

				let description = typeDescription;
				if (definition.label) {
					description = `${definition.label} · ${typeDescription}`;
				}

				setting.setName(variableName).setDesc(description);
				setting
					.addButton(button =>
						button
							.setIcon('arrow-up')
							.setTooltip(`Move ${variableName} up`)
							.setDisabled(index === 0)
							.onClick(() => this.moveVariable(index, index - 1)),
					)
					.addButton(button =>
						button
							.setIcon('arrow-down')
							.setTooltip(`Move ${variableName} down`)
							.setDisabled(index === variableEntries.length - 1)
							.onClick(() => this.moveVariable(index, index + 1)),
					)
					.addButton(button =>
						button
							.setIcon('pencil')
							.setTooltip(`Edit ${variableName}`)
							.onClick(() => this.openVariableEditor(variableName, definition)),
					)
					.addButton(button =>
						button
							.setIcon('trash-2')
							.setTooltip(`Delete ${variableName}`)
							.setDestructive()
							.onClick(() => {
								delete this.state.variables[variableName];
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
			setting.setName('Folder mode').addDropdown(dropdown => {
				for (let option of OUTPUT_FOLDER_MODES) {
					dropdown.addOption(option, OUTPUT_FOLDER_LABELS[option]);
				}

				dropdown.setValue(mode).onChange(value => {
					let selectedMode = value as OutputFolderMode;
					if (selectedMode === 'path') {
						this.state.output.folder = { mode: 'path', path: '' };
					} else {
						this.state.output.folder = { mode: selectedMode };
					}
					this.callbacks.render();
				});
			});
		});

		if (this.state.output.folder?.mode === 'path') {
			let explicitFolder = this.state.output.folder;
			group.addSetting(setting => {
				setting.setName('Folder path').addText(text =>
					text.setValue(explicitFolder.path).onChange(value => {
						explicitFolder.path = value;
						this.callbacks.updatePreview();
					}),
				);
			});
		}

		group.addSetting(setting => {
			setting.setName('Filename template').addText(text =>
				text.setValue(this.state.output.filename ?? '').onChange(value => {
					if (value) {
						this.state.output.filename = value;
					} else {
						delete this.state.output.filename;
					}
					this.callbacks.updatePreview();
				}),
			);
		});
		group.addSetting(setting => {
			setting.setName('Conflict strategy').addDropdown(dropdown => {
				for (let option of FILE_CONFLICT_STRATEGIES) {
					dropdown.addOption(option, FILE_CONFLICT_LABELS[option]);
				}

				dropdown.setValue(this.state.output.conflict ?? 'prompt').onChange(value => {
					this.state.output.conflict = value as FileConflictStrategy;
					this.callbacks.updatePreview();
				});
			});
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
				let variableEntries = Object.entries(this.state.variables);
				let variableIndex = variableEntries.findIndex(entry => entry[0] === name);

				if (variableIndex === -1) {
					return;
				}

				variableEntries[variableIndex] = [updatedName, updatedDefinition];
				this.state.variables = Object.fromEntries(variableEntries);

				this.callbacks.render();
			},
		).open();
	}

	private openNewVariableEditor(): void {
		let index = 1;
		while (`variable${index}` in this.state.variables) {
			index += 1;
		}

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
		let variableEntries = Object.entries(this.state.variables);
		let variableEntry = variableEntries.splice(fromIndex, 1)[0];

		if (!variableEntry) {
			return;
		}

		variableEntries.splice(toIndex, 0, variableEntry);
		this.state.variables = Object.fromEntries(variableEntries);

		this.callbacks.render();
	}
}
