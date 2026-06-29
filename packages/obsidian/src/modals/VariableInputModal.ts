import type { ResolvedVariables, VariableDefinition } from 'packages/core/src/index';
import { variablesNeedingInput } from 'packages/core/src/index';
import type { App } from 'obsidian';
import { Modal, Setting } from 'obsidian';

export class VariableInputModal extends Modal {
	private readonly values: ResolvedVariables = {};
	private resolve: (values: ResolvedVariables | null) => void = () => undefined;
	private submitted = false;
	private errorEl: HTMLElement | null = null;

	private displayValue(value: unknown): string {
		if (value === undefined || value === null) return '';
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
		return JSON.stringify(value);
	}

	constructor(
		app: App,
		private readonly definitions: Record<string, VariableDefinition>,
		initialValues: ResolvedVariables = {},
	) {
		super(app);
		Object.assign(this.values, structuredClone(initialValues));
		for (let [name, definition] of Object.entries(definitions))
			if (!(name in this.values) && definition.default !== undefined) this.values[name] = structuredClone(definition.default);
	}

	collect(): Promise<ResolvedVariables | null> {
		if (variablesNeedingInput(this.definitions).length === 0) return Promise.resolve({});
		this.open();
		return new Promise(resolve => {
			this.resolve = resolve;
		});
	}

	override onOpen(): void {
		this.setTitle('Template variables');
		for (let name of variablesNeedingInput(this.definitions)) this.addVariable(name, this.definitions[name]);
		this.errorEl = this.contentEl.createDiv({ cls: 'mod-warning' });
		new Setting(this.contentEl)
			.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
			.addButton(button =>
				button
					.setCta()
					.setButtonText('Create note')
					.onClick(() => this.submit()),
			);
	}

	private addVariable(name: string, definition: VariableDefinition): void {
		let setting = new Setting(this.contentEl).setName(definition.label ?? name).setDesc(definition.description ?? '');
		let current = this.values[name];
		if (definition.type === 'boolean') {
			setting.addToggle(toggle =>
				toggle.setValue(Boolean(current)).onChange(value => {
					this.values[name] = value;
				}),
			);
		} else if (definition.type === 'select') {
			setting.addDropdown(dropdown => {
				dropdown.addOption('', 'Choose…');
				for (let option of definition.options ?? []) dropdown.addOption(option, option);
				dropdown.setValue(this.displayValue(current)).onChange(value => {
					this.values[name] = value;
				});
			});
		} else if (['textarea', 'list', 'multiselect'].includes(definition.type)) {
			setting.addTextArea(textarea =>
				textarea
					.setPlaceholder(definition.type === 'textarea' ? '' : 'One value per line')
					.setValue(Array.isArray(current) ? current.map(value => this.displayValue(value)).join('\n') : this.displayValue(current))
					.onChange(value => {
						this.values[name] = value;
					}),
			);
		} else {
			setting.addText(text =>
				text.setValue(this.displayValue(current)).onChange(value => {
					this.values[name] = value;
				}),
			);
		}
	}

	private submit(): void {
		let missing = Object.entries(this.definitions)
			.filter(
				([name, definition]) =>
					definition.required &&
					variablesNeedingInput(this.definitions).includes(name) &&
					(this.values[name] === undefined || this.values[name] === ''),
			)
			.map(([name, definition]) => definition.label ?? name);
		if (missing.length > 0) {
			this.errorEl?.setText(`Required: ${missing.join(', ')}.`);
			return;
		}
		this.submitted = true;
		this.resolve(this.values);
		this.close();
	}

	override onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.resolve(null);
	}
}
