import {
	FrontmatterService,
	inputTypeUsesOptions,
	isValidVariableName,
	splitAndTrim,
	TemplateValidator,
	VARIABLE_INPUT_TYPES,
	VARIABLE_TYPES,
} from 'packages/core/src/index';
import type { VariableDefinition, VariableInputType, VariableType } from 'packages/core/src/index';
import type { ObsidianSpecialVariableRegistry } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { App } from 'obsidian';
import { Modal, SettingGroup } from 'obsidian';
import { parse } from 'yaml';
import { addModalActions } from 'packages/obsidian/src/modals/ModalActions';

/** Edits one template variable in isolation and commits it when saved. */
export class VariableEditorModal extends Modal {
	private name: string;
	private definition: VariableDefinition;
	private readonly drafts = new Map<VariableType, VariableDefinition>();
	private detailsEl: HTMLElement | null = null;
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
		this.drafts.set(definition.type, this.definition);
	}

	override onOpen(): void {
		this.setTitle(this.originalName === null ? 'Add variable' : `Edit variable: ${this.originalName}`);
		this.renderIdentity();
		this.detailsEl = this.contentEl.createDiv();
		this.renderDetails();

		this.errorEl = this.contentEl.createDiv({ cls: 'mod-warning' });

		addModalActions(
			this.contentEl,
			'Save variable',
			() => this.close(),
			() => this.save(),
		);
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private renderIdentity(): void {
		let group = new SettingGroup(this.contentEl).setHeading('Variable');
		group.addSetting(setting => {
			setting
				.setName('Key')
				.setDesc('Identifier used in template expressions, such as {{ projectName }}.')
				.addText(text =>
					text.setValue(this.name).onChange(value => {
						this.name = value;
						this.errorEl?.empty();
					}),
				);
		});

		group.addSetting(setting => {
			setting
				.setName('Name')
				.setDesc('Optional name shown when asking for a value.')
				.addText(text =>
					text.setValue(this.definition.label ?? '').onChange(value => {
						this.setCommonField('label', value);
					}),
				);
		});

		group.addSetting(setting => {
			setting
				.setName('Description')
				.setDesc('Optional guidance shown below the variable name.')
				.addText(text =>
					text.setValue(this.definition.description ?? '').onChange(value => {
						this.setCommonField('description', value);
					}),
				);
		});

		group.addSetting(setting => {
			setting
				.setName('Type')
				.setDesc('Choose whether the value is entered, supplied by Obsidian, or calculated.')
				.addDropdown(dropdown => {
					for (let type of VARIABLE_TYPES) dropdown.addOption(type, this.typeLabel(type));
					dropdown.setValue(this.definition.type).onChange(value => this.changeType(value as VariableType));
				});
		});
	}

	private renderDetails(): void {
		if (!this.detailsEl) return;

		this.detailsEl.empty();
		let group = new SettingGroup(this.detailsEl).setHeading(this.typeLabel(this.definition.type));

		if (this.definition.type === 'input') {
			this.renderInput(group, this.definition);
		} else if (this.definition.type === 'special') {
			this.renderSpecial(group, this.definition);
		} else {
			this.renderFormula(group, this.definition);
		}
	}

	private renderInput(group: SettingGroup, definition: Extract<VariableDefinition, { type: 'input' }>): void {
		group.addSetting(setting => {
			setting
				.setName('Input type')
				.setDesc('Controls the field shown to the user and how its value is validated.')
				.addDropdown(dropdown => {
					for (let type of VARIABLE_INPUT_TYPES) {
						dropdown.addOption(type, this.inputTypeLabel(type));
					}
					dropdown.setValue(definition.inputType).onChange(value => {
						definition.inputType = value as VariableInputType;
						if (!inputTypeUsesOptions(definition.inputType)) {
							delete definition.options;
						}
						this.renderDetails();
					});
				});
		});

		group.addSetting(setting => {
			setting
				.setName('Required')
				.setDesc('Prevent note creation until the user enters a value.')
				.addToggle(toggle =>
					toggle.setValue(definition.required ?? false).onChange(value => {
						if (value) definition.required = true;
						else delete definition.required;
					}),
				);
		});

		group.addSetting(setting => {
			setting
				.setName('Default value')
				.setDesc('Optional YAML value used when no value is entered.')
				.addText(text =>
					text.setValue(this.serializeDefault(definition.default)).onChange(value => {
						if (!value.trim()) delete definition.default;
						else {
							try {
								definition.default = parse(value) as unknown;
							} catch {
								definition.default = value;
							}
						}
					}),
				);
		});

		if (inputTypeUsesOptions(definition.inputType)) {
			group.addSetting(setting => {
				setting
					.setName('Options')
					.setDesc('Enter one available choice per line.')
					.addTextArea(textarea =>
						textarea.setValue(definition.options?.join('\n') ?? '').onChange(value => {
							let options = splitAndTrim(value, /\r?\n/);
							if (options.length) definition.options = options;
							else delete definition.options;
						}),
					);
			});
		}
	}

	private renderSpecial(group: SettingGroup, definition: Extract<VariableDefinition, { type: 'special' }>): void {
		group.addSetting(setting => {
			setting
				.setName('Source')
				.setDesc('Select the Obsidian value to use when the template runs.')
				.addDropdown(dropdown => {
					dropdown.addOption('', 'Choose a source…');
					for (let [source, sourceDefinition] of this.specialVariables) {
						dropdown.addOption(source, sourceDefinition.label);
					}
					dropdown.setValue(definition.source).onChange(value => {
						definition.source = value;
					});
				});
		});
	}

	private renderFormula(group: SettingGroup, definition: Extract<VariableDefinition, { type: 'formula' }>): void {
		group.addSetting(setting => {
			setting
				.setName('Expression')
				.setDesc('Calculate a value with variables declared above this one as inputs.')
				.addTextArea(textarea =>
					textarea.setValue(definition.formula).onChange(value => {
						definition.formula = value;
					}),
				);
		});
	}

	private changeType(type: VariableType): void {
		if (type === this.definition.type) return;

		this.drafts.set(this.definition.type, this.definition);

		let common: Pick<VariableDefinition, 'label' | 'description'> = {};
		if (this.definition.label) common.label = this.definition.label;
		if (this.definition.description) common.description = this.definition.description;

		let draft = this.drafts.get(type);
		if (draft) {
			this.definition = { ...draft, ...common };
		} else if (type === 'input') {
			this.definition = { ...common, type, inputType: 'text' };
		} else if (type === 'special') {
			this.definition = { ...common, type, source: '' };
		} else {
			this.definition = { ...common, type, formula: '' };
		}

		this.drafts.set(type, this.definition);
		this.errorEl?.empty();
		this.renderDetails();
	}

	private setCommonField(field: 'label' | 'description', value: string): void {
		if (value) this.definition[field] = value;
		else delete this.definition[field];
	}

	private serializeDefault(value: unknown): string {
		if (value === undefined) return '';

		return this.frontmatter
			.serialize({ value })
			.replace(/^value:\s*/, '')
			.trim();
	}

	private typeLabel(type: VariableType): string {
		return { input: 'Input', special: 'Special', formula: 'Formula' }[type];
	}

	private inputTypeLabel(type: VariableInputType): string {
		return {
			text: 'Text',
			textarea: 'Text area',
			number: 'Number',
			boolean: 'Toggle',
			date: 'Date',
			datetime: 'Date and time',
			select: 'Select',
			multiselect: 'Multiple select',
			list: 'List',
		}[type];
	}

	private save(): void {
		let name = this.name.trim();
		if (!isValidVariableName(name)) {
			this.errorEl?.setText(
				'Enter a key that starts with a letter or underscore and contains only letters, numbers, or underscores.',
			);
			return;
		}
		if (name !== this.originalName && this.existingNames.has(name)) {
			this.errorEl?.setText(`A variable named "${name}" already exists.`);
			return;
		}
		let issue = new TemplateValidator(this.specialVariables).validateVariables({ [name]: this.definition })[0];
		if (issue) {
			this.errorEl?.setText(issue.message);
			return;
		}

		this.onSave(name, structuredClone(this.definition));
		this.close();
	}
}
