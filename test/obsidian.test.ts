import { describe, expect, mock, test } from 'bun:test';
import { createEditableTemplateMetadata, mergeEditableTemplateMetadata } from 'packages/obsidian/src/modals/TemplateMetadataState';
import { pathAffectsTemplateRegistry } from 'packages/obsidian/src/templates/RegistryPaths';

class MockTFile {
	constructor(readonly path: string) {}
}

class MockFuzzySuggestModal {
	setPlaceholder(_placeholder: string): void {}
	open(): void {}
	onClose(): void {}
}

mock.module('obsidian', () => ({ FuzzySuggestModal: MockFuzzySuggestModal, TFile: MockTFile }));

const { TemplateRegistry } = await import('packages/obsidian/src/templates/TemplateRegistry');
const { FilePickerModal } = await import('packages/obsidian/src/modals/FilePickerModal');
const { TemplatePickerModal } = await import('packages/obsidian/src/modals/TemplatePickerModal');

describe('picker modals', () => {
	test('returns a template when Obsidian closes before reporting the selection', async () => {
		let template = { id: 'template', name: 'Template' };
		let modal = new TemplatePickerModal({} as never, [template as never]);
		let choice = modal.choose();
		modal.onClose();
		modal.onChooseItem(template as never, {} as KeyboardEvent);
		expect(await choice).toBe(template as never);
	});

	test('returns a file when Obsidian closes before reporting the selection', async () => {
		let file = new MockTFile('Templates/template.md');
		let modal = new FilePickerModal({} as never, [file] as never, new Set([file.path]));
		let choice = modal.choose();
		modal.onClose();
		modal.onChooseItem(file as never, {} as KeyboardEvent);
		expect(await choice).toBe(file as never);
	});

	test('returns null when a picker closes without a selection', async () => {
		let modal = new TemplatePickerModal({} as never, []);
		let choice = modal.choose();
		modal.onClose();
		expect(await choice).toBeNull();
	});
});

describe('template registry adapters', () => {
	test('filters vault changes to relevant Markdown files and folder moves', () => {
		expect(pathAffectsTemplateRegistry('Templates', ['Notes/note.md'], true)).toBeFalse();
		expect(pathAffectsTemplateRegistry('Templates', ['Templates/note.md'], true)).toBeTrue();
		expect(pathAffectsTemplateRegistry('Templates', ['Templates/image.png'], true)).toBeFalse();
		expect(pathAffectsTemplateRegistry('Templates', ['Archive', 'Templates'], false)).toBeTrue();
		expect(pathAffectsTemplateRegistry('Templates/Nested', ['Templates'], false)).toBeTrue();
	});

	test('serializes refreshes and publishes the newest scan', async () => {
		let file = new MockTFile('Templates/template.md');
		let reads = 0;
		let activeReads = 0;
		let maximumActiveReads = 0;
		let vault = {
			getMarkdownFiles: () => [file],
			cachedRead: async () => {
				reads += 1;
				activeReads += 1;
				maximumActiveReads = Math.max(maximumActiveReads, activeReads);
				await Bun.sleep(5);
				activeReads -= 1;
				return `---\ntemplate: { id: template-${reads}, name: Template ${reads} }\n---\n`;
			},
			getAbstractFileByPath: () => file,
		};
		let registry = new TemplateRegistry(vault as never, () => 'Templates');
		await Promise.all([registry.refresh(), registry.refresh()]);
		expect(maximumActiveReads).toBe(1);
		expect(registry.getAll().map(template => template.id)).toEqual(['template-2']);
	});

	test('records per-file read failures without rejecting the refresh', async () => {
		let file = new MockTFile('Templates/broken.md');
		let vault = {
			getMarkdownFiles: () => [file],
			cachedRead: () => Promise.reject(new Error('gone')),
			getAbstractFileByPath: () => file,
		};
		let registry = new TemplateRegistry(vault as never, () => 'Templates');
		await registry.refresh();
		expect(registry.getValidationResults()[0]?.issues[0]?.message).toContain('Could not read template: gone');
	});
});

describe('metadata editor state', () => {
	test('keeps state conversion and frontmatter merging independent from the modal', () => {
		let content = '---\ntemplate: { id: old, name: Old }\ncustom: keep\n---\nBody';
		let state = createEditableTemplateMetadata(content);
		state.template.name = 'New';
		let merged = mergeEditableTemplateMetadata(content, state);
		expect(merged).toContain('name: New');
		expect(merged).toContain('custom: keep');
		expect(merged.endsWith('Body')).toBeTrue();
	});
});
