import type { ResolvedVariables, VariableDefinition } from 'packages/core/src/index';
import { variablesNeedingInput } from 'packages/core/src/index';
import type { App } from 'obsidian';
import { Modal, SettingGroup } from 'obsidian';
import type { Setting } from 'obsidian';

/**
 * Modal that collects user-provided values for template variables.
 *
 * Only variables that need input are shown (those without a formula, without
 * a source, or explicitly marked `ask: true`).
 */
export class VariableInputModal extends Modal {
	private readonly values: ResolvedVariables = {};
	private readonly inputNames: string[];
	private resolve: (values: ResolvedVariables | null) => void = () => undefined;
	private submitted = false;
	private errorEl: HTMLElement | null = null;

	/** Converts an arbitrary value to its display string in the input fields. */
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
		this.inputNames = variablesNeedingInput(definitions);

		Object.assign(this.values, structuredClone(initialValues));
		for (let [name, definition] of Object.entries(definitions))
			if (!(name in this.values) && definition.default !== undefined) this.values[name] = structuredClone(definition.default);
	}

	/**
	 * Opens the modal and returns a promise that resolves with the collected
	 * values (or null if cancelled).  When no input is needed the promise
	 * resolves immediately with an empty object.
	 */
	collect(): Promise<ResolvedVariables | null> {
		if (this.inputNames.length === 0) return Promise.resolve({});
		return new Promise(resolve => {
			this.resolve = resolve;
			this.open();
		});
	}

	override onOpen(): void {
		this.setTitle('Template variables');

		let inputGroup = new SettingGroup(this.contentEl);

		for (let name of this.inputNames) {
			inputGroup.addSetting(setting => this.addVariable(setting, name, this.definitions[name]));
		}

		this.errorEl = this.contentEl.createDiv({ cls: 'mod-warning' });

		new SettingGroup(this.contentEl).addSetting(setting => {
			setting
				.addButton(button => button.setButtonText('Cancel').onClick(() => this.close()))
				.addButton(button =>
					button
						.setCta()
						.setButtonText('Create note')
						.onClick(() => this.submit()),
				);
		});
	}

	/** Renders the appropriate input control for a single variable based on
	 *  its type. */
	private addVariable(setting: Setting, name: string, definition: VariableDefinition): void {
		setting.setName(definition.label ?? name).setDesc(definition.description ?? '');
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
					.setValue(
						Array.isArray(current) ? current.map(value => this.displayValue(value)).join('\n') : this.displayValue(current),
					)
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

	/** Validates required fields and resolves the promise. */
	private submit(): void {
		let missing = this.inputNames.flatMap(name => {
			let definition = this.definitions[name];
			let value = this.values[name];
			return definition?.required && (value === undefined || value === '') ? [definition.label ?? name] : [];
		});

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
