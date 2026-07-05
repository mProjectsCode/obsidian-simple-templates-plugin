import type { TemplateValidationResult } from 'packages/obsidian/src/templates/TemplateRegistry';
import type { App } from 'obsidian';
import { Modal, SettingGroup, TFile } from 'obsidian';

/** Displays actionable template validation errors without requiring a developer console. */
export class TemplateValidationModal extends Modal {
	constructor(
		app: App,
		private readonly results: TemplateValidationResult[],
	) {
		super(app);
		this.modalEl.addClass('simple-templates-modal');
	}

	override onOpen(): void {
		this.setTitle('Template validation');
		let group = new SettingGroup(this.contentEl);
		for (let result of this.results) {
			let errors = result.issues.filter(issue => issue.severity === 'error');
			group.addSetting(setting => {
				setting.setName(result.path).setDesc(errors.map(issue => issue.message).join(' '));
				let file = this.app.vault.getAbstractFileByPath(result.path);
				if (file instanceof TFile) {
					setting.addButton(button =>
						button.setButtonText('Open').onClick(async () => {
							await this.app.workspace.getLeaf(false).openFile(file);
							this.close();
						}),
					);
				}
			});
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}
