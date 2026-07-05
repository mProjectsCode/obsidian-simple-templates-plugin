import type { App } from 'obsidian';
import { SettingGroup } from 'obsidian';
import { addModalActions } from 'packages/obsidian/src/modals/ModalActions';
import { errorMessage } from 'packages/core/src/index';
import { PromiseModal } from 'packages/obsidian/src/modals/PromiseModal';
import { TemplateCreationService } from 'packages/obsidian/src/templates/TemplateCreationService';
import type { TemplateCreationRequest } from 'packages/obsidian/src/templates/TemplateCreationService';

/** Collects the identity and filename for a new template file. */
export class TemplateCreationModal extends PromiseModal<TemplateCreationRequest | null> {
	private name = '';
	private id = '';
	private filename = '';
	private idEdited = false;
	private filenameEdited = false;
	private errorEl: HTMLElement | null = null;
	private readonly creation = new TemplateCreationService();

	constructor(app: App) {
		super(app, null);
	}

	collect(): Promise<TemplateCreationRequest | null> {
		return this.awaitResult();
	}

	override onOpen(): void {
		this.setTitle('Create template');
		let identityGroup = new SettingGroup(this.contentEl);

		let idInput: { setValue(value: string): unknown } | null = null;
		let filenameInput: { setValue(value: string): unknown } | null = null;
		identityGroup.addSetting(setting => {
			setting
				.setName('Name')
				.setDesc('Shown when choosing a template.')
				.addText(text =>
					text.setPlaceholder('Project note').onChange(value => {
						this.name = value;
						let defaults = this.creation.defaultsForName(value);
						if (!this.idEdited) {
							this.id = defaults.id;
							idInput?.setValue(defaults.id);
						}
						if (!this.filenameEdited) {
							this.filename = defaults.filename;
							filenameInput?.setValue(this.filename);
						}
					}),
				);
		});

		identityGroup.addSetting(setting => {
			setting
				.setName('Template ID')
				.setDesc('A stable, unique identifier.')
				.addText(text => {
					idInput = text;
					text.setPlaceholder('Template-id').onChange(value => {
						this.idEdited = true;
						this.id = value;
					});
				});
		});

		identityGroup.addSetting(setting => {
			setting
				.setName('File name')
				.setDesc('Created inside the configured template folder.')
				.addText(text => {
					filenameInput = text;
					text.setPlaceholder('project-note.md').onChange(value => {
						this.filenameEdited = true;
						this.filename = value;
					});
				});
		});

		this.errorEl = this.contentEl.createDiv({ cls: 'mod-warning' });
		addModalActions(
			this.contentEl,
			'Create template',
			() => this.close(),
			() => this.submit(),
		);
	}

	private submit(): void {
		let request: TemplateCreationRequest;
		try {
			request = this.creation.normalize({ name: this.name, id: this.id, filename: this.filename });
		} catch (error) {
			this.errorEl?.setText(errorMessage(error));
			return;
		}

		this.submitResult(request);
	}
}
