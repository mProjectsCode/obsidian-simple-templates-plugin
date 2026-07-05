import type { TemplateDefinition } from 'packages/core/src/index';
import type { App } from 'obsidian';
import { PromiseSuggestModal } from 'packages/obsidian/src/modals/PromiseSuggestModal';

/**
 * A fuzzy-suggest modal for selecting a template to execute, showing its
 * description alongside the name when available.
 */
export class TemplatePickerModal extends PromiseSuggestModal<TemplateDefinition> {
	constructor(
		app: App,
		private readonly templates: TemplateDefinition[],
	) {
		super(app, 'Choose a template…');
	}

	getItems(): TemplateDefinition[] {
		return this.templates;
	}

	getItemText(template: TemplateDefinition): string {
		return template.description ? `${template.name}: ${template.description}` : template.name;
	}
}
