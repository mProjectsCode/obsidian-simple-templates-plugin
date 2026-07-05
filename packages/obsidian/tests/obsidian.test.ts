import { describe, expect, test } from 'bun:test';
import { MockTFile } from 'packages/obsidian/tests/ObsidianMock';
import { FileConflictError, FormulaError } from 'packages/core/src/index';
import { SafeJsExpressionEvaluator } from 'packages/obsidian/src/expressions/SafeJsExpressionEvaluator';
import {
	applyEditableTemplateMetadata,
	createEditableTemplateMetadata,
	mergeEditableTemplateMetadata,
	validateEditableTemplateMetadata,
} from 'packages/obsidian/src/modals/TemplateMetadataState';
import { FilePickerModal } from 'packages/obsidian/src/modals/FilePickerModal';
import { TemplatePickerModal } from 'packages/obsidian/src/modals/TemplatePickerModal';
import { VariableInputModal } from 'packages/obsidian/src/modals/VariableInputModal';
import { NoteDestinationResolver } from 'packages/obsidian/src/notes/NoteDestinationResolver';
import { ObsidianOutputFolderProvider } from 'packages/obsidian/src/notes/ObsidianOutputFolderProvider';
import { pathAffectsTemplateRegistry } from 'packages/obsidian/src/templates/RegistryPaths';
import { TemplateRegistry } from 'packages/obsidian/src/templates/TemplateRegistry';
import { createObsidianSpecialVariableRegistry, ObsidianVariableEnvironment } from 'packages/obsidian/src/notes/ObsidianSpecialVariables';
import type { SafeJsExecutionResult, SafeJsExpressionOptions } from '@lemons_dev/obsidian-safe-js-api';
import { DEFAULT_SETTINGS, loadPluginSettings } from 'packages/obsidian/src/settings/PluginSettings';
import { TemplateCreationService } from 'packages/obsidian/src/templates/TemplateCreationService';

class MockSafeJsExpressionApi {
	readonly calls: { expression: string; options: SafeJsExpressionOptions }[] = [];
	result: SafeJsExecutionResult = {
		status: 'success',
		codeHash: 'test-hash',
		value: 'evaluated',
		permissions: [],
		elapsedMs: 0,
	};

	async executeExpression(expression: string, options: SafeJsExpressionOptions = {}): Promise<SafeJsExecutionResult> {
		this.calls.push({ expression, options });
		return this.result;
	}
}

async function rejected(promise: Promise<unknown>): Promise<Error> {
	try {
		await promise;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
	throw new Error('Expected the promise to reject.');
}

describe('Safe JS expression adapter', () => {
	test('maps the core contract to JSON-safe Safe JS expression calls', async () => {
		let api = new MockSafeJsExpressionApi();
		let evaluator = new SafeJsExpressionEvaluator(() => api);
		expect(await evaluator.evaluate('title.toUpperCase()', { title: 'Note', missing: undefined }, 'Templates/note.md')).toBe(
			'evaluated',
		);
		expect(api.calls[0]).toEqual({
			expression: 'title.toUpperCase()',
			options: {
				inputs: { title: 'Note', missing: null },
				permissions: [],
				source: { path: 'Templates/note.md' },
			},
		});

		api.result = {
			status: 'runtime-error',
			codeHash: 'test-hash',
			message: 'failed',
			permissions: [],
			elapsedMs: 0,
		};
		expect(await rejected(evaluator.evaluate('broken()', {}))).toBeInstanceOf(FormulaError);
	});

	test('does not require Safe JS for a bare identifier', async () => {
		let evaluator = new SafeJsExpressionEvaluator(() => null);
		expect(await evaluator.evaluateTemplateExpression('title', { title: 'Local value' })).toBe('Local value');
		expect(await rejected(evaluator.evaluateTemplateExpression('title.toUpperCase()', { title: 'Local value' }))).toBeInstanceOf(
			FormulaError,
		);
	});
});

describe('Obsidian output folders', () => {
	test('supplies every output mode without using the special-variable context', () => {
		let activeFile: { parent: { path: string } | null } | null = { parent: { path: 'Projects' } };
		let app = {
			workspace: {
				getActiveFile(): typeof activeFile {
					return activeFile;
				},
			},
		};
		let provider = new ObsidianOutputFolderProvider(app as never, 'Notes');

		expect(provider.getDefaultFolder()).toBe('Notes');
		expect(provider.getActiveFileFolder()).toBe('Projects');
		expect(provider.getExplicitFolder('Archive/2026')).toBe('Archive/2026');

		activeFile = null;
		expect(provider.getActiveFileFolder()).toBeNull();
	});
});

describe('note destinations', () => {
	test('resolves vault conflicts without passing filesystem callbacks into core', async () => {
		let existing = new Set(['Notes/Name.md', 'Notes/Name 1.md']);
		let app = {
			vault: {
				getAbstractFileByPath(path: string): object | null {
					return existing.has(path) ? {} : null;
				},
			},
		};
		let resolver = new NoteDestinationResolver(app as never);

		expect(await resolver.resolve('Notes', 'Name.md', 'append-number')).toBe('Notes/Name 2.md');
		await expect(resolver.resolve('Notes', 'Name.md', 'cancel')).rejects.toBeInstanceOf(FileConflictError);
		expect(await resolver.resolve('', 'New.md', 'cancel')).toBe('New.md');
	});
});

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

describe('variable input modal', () => {
	test('does not submit defaults for hidden source or formula variables', async () => {
		let modal = new VariableInputModal({} as never, {
			title: { type: 'input', inputType: 'text' },
			fromContext: { type: 'special', source: 'activeFile.basename' },
			fromFormula: { type: 'formula', formula: 'title.toUpperCase()' },
		});
		let collected = modal.collect();
		(modal as unknown as { submit(): void }).submit();
		expect(await collected).toEqual({});
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
		let registry = new TemplateRegistry(vault as never, () => 'Templates', createObsidianSpecialVariableRegistry());
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
		let registry = new TemplateRegistry(vault as never, () => 'Templates', createObsidianSpecialVariableRegistry());
		await registry.refresh();
		expect(registry.getValidationResults()[0]?.issues[0]?.message).toContain('Could not read template: gone');
	});

	test('reparses only a modified template file', async () => {
		let first = new MockTFile('Templates/first.md');
		let second = new MockTFile('Templates/second.md');
		let reads: string[] = [];
		let versions = new Map([
			[first.path, 1],
			[second.path, 1],
		]);
		let vault = {
			getMarkdownFiles: () => [first, second],
			cachedRead: (file: MockTFile) => {
				reads.push(file.path);
				return Promise.resolve(
					`---\ntemplate: { id: ${file.path === first.path ? 'first' : 'second'}-${versions.get(file.path)}, name: Template }\n---\n`,
				);
			},
			getAbstractFileByPath: (path: string) => (path === first.path ? first : second),
		};
		let registry = new TemplateRegistry(vault as never, () => 'Templates', createObsidianSpecialVariableRegistry());
		await registry.refresh();
		versions.set(first.path, 2);
		await registry.refreshFile(first as never);
		expect(reads).toEqual([first.path, second.path, first.path]);
		expect(registry.getAll().map(template => template.id)).toEqual(['first-2', 'second-1']);
	});
});

describe('plugin settings', () => {
	test('loads the flat unreleased settings shape and validates stored values', () => {
		expect(loadPluginSettings({ showContextMenuItems: false })).toEqual({ ...DEFAULT_SETTINGS, showContextMenuItems: false });
		expect(loadPluginSettings({ templateFolderPath: 12, showContextMenuItems: 'yes' })).toEqual(DEFAULT_SETTINGS);
	});
});

describe('template creation', () => {
	test('derives editable defaults and validates the final identity', () => {
		let creation = new TemplateCreationService();
		expect(creation.defaultsForName(' Über Project Note ')).toEqual({ id: 'uber-project-note', filename: 'uber-project-note.md' });
		expect(creation.normalize({ name: ' Project note ', id: 'project_note', filename: 'Project note' })).toEqual({
			name: 'Project note',
			id: 'project_note',
			filename: 'Project note.md',
		});
		expect(() => creation.normalize({ name: 'Bad', id: 'not valid', filename: 'bad.md' })).toThrow('Template ID');
		expect(() => creation.normalize({ name: 'Bad', id: 'valid', filename: '../bad.md' })).toThrow('path separators');
	});
});

describe('Obsidian special variables', () => {
	test('resolves built-in sources through a lazy execution environment', async () => {
		let reads = 0;
		let activeFile = { path: 'Projects/Note.md', basename: 'Note', parent: { path: 'Projects' } };
		let app = {
			workspace: {
				getActiveFile(): typeof activeFile {
					return activeFile;
				},
				getActiveViewOfType(): null {
					return null;
				},
			},
			metadataCache: {
				getFileCache(): { frontmatter: { status: string } } {
					return { frontmatter: { status: 'active' } };
				},
			},
			vault: {
				async cachedRead(): Promise<string> {
					reads += 1;
					return 'content';
				},
			},
		};
		let registry = createObsidianSpecialVariableRegistry();
		let environment = new ObsidianVariableEnvironment(app as never);

		expect(await registry.resolve('activeFile.basename', environment)).toBe('Note');
		expect(reads).toBe(0);
		expect(await registry.resolve('activeFile.content', environment)).toBe('content');
		expect(await registry.resolve('activeFile.content', environment)).toBe('content');
		expect(reads).toBe(1);
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

	test('updates only plugin-owned frontmatter keys', () => {
		let state = createEditableTemplateMetadata('---\ntemplate: { id: old, name: Old }\n---\n');
		state.template = { id: 'new', name: 'New' };
		let frontmatter: Record<string, unknown> = { template: { id: 'old' }, custom: 'keep' };
		applyEditableTemplateMetadata(frontmatter, state);
		expect(frontmatter).toEqual({ template: { id: 'new', name: 'New' }, variables: {}, output: {}, custom: 'keep' });
	});

	test('keeps undeclared variable references as blocking errors', () => {
		let content = '---\ntemplate: { id: old, name: Old }\n---\n{{ missing }}';
		let state = createEditableTemplateMetadata(content);
		let issues = validateEditableTemplateMetadata(
			'Templates/old.md',
			content,
			state,
			new Map(),
			createObsidianSpecialVariableRegistry(),
		);
		expect(issues.some(issue => issue.severity === 'error' && issue.message.includes('missing'))).toBeTrue();
	});
});
