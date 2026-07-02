import { FrontmatterService, VARIABLE_TYPES } from 'packages/core/src/index';
import type { VariableDefinition, VariableType } from 'packages/core/src/index';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { App } from 'obsidian';
import { Modal, SettingGroup } from 'obsidian';
import { parse } from 'yaml';

/** Edits one template variable in isolation and commits it when saved. */
export class VariableEditorModal extends Modal {
	private name: string;
	private readonly definition: VariableDefinition;
	private errorEl: HTMLElement | null = null;
	private readonly frontmatter = new FrontmatterService();

	constructor(
		app: App,
		private readonly originalName: string | null,
		name: string,
		definition: VariableDefinition,
		private readonly existingNames: ReadonlySet<string>,
		private readonly specialVariables: ObsidianSpecialVariableRegistry,
		private readonly onSave: (name: string, definition: VariableDefinition) => void,
	) {
		super(app);
		this.modalEl.addClass('simple-templates-modal');
		this.name = name;
		this.definition = structuredClone(definition);
	}

	override onOpen(): void {
		this.setTitle(this.originalName === null ? 'Add variable' : `Edit variable — ${this.originalName}`);
		let group = new SettingGroup(this.contentEl);
		this.renderFields(group);

		this.errorEl = this.contentEl.createDiv({ cls: 'mod-warning' });

		new SettingGroup(this.contentEl).addSetting(setting => {
			setting
				.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
				.addButton(button =>
					button
						.setCta()
						.setButtonText('Save variable')
						.onClick(() => this.save()),
				);
		});
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private renderFields(group: SettingGroup): void {
		group.addSetting(setting => {
			setting.setName('Key').addText(text =>
				text.setValue(this.name).onChange(value => {
					this.name = value;
					this.errorEl?.empty();
				}),
			);
		});

		group.addSetting(setting => {
			setting.setName('Label').addText(text =>
				text.setValue(this.definition.label ?? '').onChange(value => {
					if (value) this.definition.label = value;
					else delete this.definition.label;
				}),
			);
		});

		group.addSetting(setting => {
			setting.setName('Description').addText(text =>
				text.setValue(this.definition.description ?? '').onChange(value => {
					if (value) this.definition.description = value;
					else delete this.definition.description;
				}),
			);
		});

		group.addSetting(setting => {
			setting.setName('Type').addDropdown(dropdown => {
				for (let type of VARIABLE_TYPES) dropdown.addOption(type, type);
				dropdown.setValue(this.definition.type).onChange(value => {
					this.definition.type = value as VariableType;
				});
			});
		});

		group.addSetting(setting => {
			setting.setName('Required').addToggle(toggle =>
				toggle.setValue(this.definition.required ?? false).onChange(value => {
					if (value) this.definition.required = true;
					else delete this.definition.required;
				}),
			);
		});

		group.addSetting(setting => {
			setting
				.setName('Default')
				.setDesc('YAML scalar or collection')
				.addText(text =>
					text
						.setValue(
							this.definition.default === undefined
								? ''
								: this.frontmatter
										.serialize({ value: this.definition.default })
										.replace(/^value:\s*/, '')
										.trim(),
						)
						.onChange(value => {
							if (!value.trim()) delete this.definition.default;
							else {
								try {
									this.definition.default = parse(value) as unknown;
								} catch {
									this.definition.default = value;
								}
							}
						}),
				);
		});

		group.addSetting(setting => {
			setting
				.setName('Expression')
				.setDesc('Evaluated with earlier variables as inputs')
				.addText(text =>
					text.setValue(this.definition.formula ?? '').onChange(value => {
						if (value) this.definition.formula = value;
						else delete this.definition.formula;
					}),
				);
		});

		group.addSetting(setting => {
			setting.setName('Source').addDropdown(dropdown => {
				dropdown.addOption('', 'None');
				for (let [source, sourceDefinition] of this.specialVariables) {
					dropdown.addOption(source, sourceDefinition.label);
				}
				dropdown.setValue(this.definition.source ?? '').onChange(value => {
					if (value) this.definition.source = value;
					else delete this.definition.source;
				});
			});
		});

		group.addSetting(setting => {
			setting
				.setName('Options')
				.setDesc('One option per line')
				.addTextArea(textarea =>
					textarea.setValue(this.definition.options?.join('\n') ?? '').onChange(value => {
						let options = value
							.split(/\r?\n/)
							.map(option => option.trim())
							.filter(Boolean);
						if (options.length) this.definition.options = options;
						else delete this.definition.options;
					}),
				);
		});

		group.addSetting(setting => {
			setting.setName('Ask for value').addToggle(toggle =>
				toggle.setValue(this.definition.ask ?? false).onChange(value => {
					if (value) this.definition.ask = true;
					else delete this.definition.ask;
				}),
			);
		});
	}

	private save(): void {
		let name = this.name.trim();
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
			this.errorEl?.setText(
				'Enter a key that starts with a letter or underscore and contains only letters, numbers, or underscores.',
			);
			return;
		}
		if (name !== this.originalName && this.existingNames.has(name)) {
			this.errorEl?.setText(`A variable named “${name}” already exists.`);
			return;
		}

		this.onSave(name, structuredClone(this.definition));
		this.close();
	}
}
