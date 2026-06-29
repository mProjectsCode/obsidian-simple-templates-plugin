import { describe, expect, test } from 'bun:test';
import {
	FileConflictError,
	FormulaError,
	MissingRequiredVariableError,
	TemplateValidationError,
	evaluateFormula,
	findAvailablePath,
	mergeTemplateFrontmatter,
	normalizeVaultFolder,
	parseFrontmatter,
	parseTemplate,
	renderNote,
	renderTemplate,
	resolveVariables,
	variablesNeedingInput,
} from 'packages/core/src/index';
import type { ExecutionContext, TemplateDefinition } from 'packages/core/src/index';

const CONTEXT: ExecutionContext = {
	activeFilePath: 'Projects/Source.md',
	activeFileBasename: 'Source',
	activeFileFolder: 'Projects',
	activeFileFrontmatter: { status: 'active' },
	cursor: { line: 3, ch: 4 },
};
const RUNTIME = { now: () => new Date('2026-06-29T12:34:56.000Z'), uuid: () => 'fixed-uuid' };

describe('template parser', () => {
	let source = `---
template:
  id: project-note
  name: Project Note
variables:
  title:
    type: text
  slug:
    type: text
    formula: slug(title)
output:
  filename: "{{ slug }}"
custom: keep
---
\`\`\`note-frontmatter
title: "{{ title }}"
\`\`\`
# {{ title }}
`;

	test('extracts metadata and removes one output frontmatter block', () => {
		let result = parseTemplate('Templates/project.md', source);
		expect(result.issues).toEqual([]);
		expect(result.template?.id).toBe('project-note');
		expect(result.template?.parsedFrontmatter.custom).toBe('keep');
		expect(result.template?.outputFrontmatterTemplate).toBe('title: "{{ title }}"');
		expect(result.template?.body).toBe('\n# {{ title }}\n');
	});

	test('ignores literal frontmatter examples inside longer fences and supports empty blocks', () => {
		let literal = parseTemplate(
			'Templates/literal.md',
			'---\ntemplate: { id: literal, name: Literal }\n---\n````markdown\n```note-frontmatter\ntitle: example\n```\n````\n',
		);
		expect(literal.template?.outputFrontmatterTemplate).toBeUndefined();
		expect(literal.template?.body).toContain('title: example');

		let empty = parseTemplate('Templates/empty.md', '---\ntemplate: { id: empty, name: Empty }\n---\n```note-frontmatter\n```\nBody');
		expect(empty.template?.outputFrontmatterTemplate).toBe('');
		expect(empty.template?.body).toBe('\nBody');
	});

	test('reports undeclared references and duplicate output blocks', () => {
		let invalid = source.replace('# {{ title }}', '# {{ missing }}\n```note-frontmatter\nx: y\n```');
		let messages = parseTemplate('bad.md', invalid).issues.map(issue => issue.message);
		expect(messages.some(message => message.includes('missing'))).toBeTrue();
		expect(messages.some(message => message.includes('at most one'))).toBeTrue();
	});

	test('reports invalid YAML without throwing', () => {
		let result = parseTemplate('bad.md', '---\ntemplate: [\n---\nbody');
		expect(result.template).toBeNull();
		expect(result.issues[0]?.message).toContain('Invalid YAML');
	});

	test('validates metadata shapes and formula graphs before execution', () => {
		let result = parseTemplate(
			'bad.md',
			`---
template: { id: bad, name: 12, tags: nope }
variables:
  broken: nope
  a: { type: text, formula: lower(b) }
  b: { type: text, formula: lower(a) }
output: { openAfterCreate: yes }
---
body`,
		);
		let messages = result.issues.map(issue => issue.message);
		expect(messages).toContain('Template name must be a string.');
		expect(messages).toContain('Template tags must be a list of strings.');
		expect(messages).toContain('Variable "broken" must be a mapping.');
		expect(messages.some(message => message.includes('circular dependency'))).toBeTrue();
		expect(messages).toContain('Open after create must be true or false.');
	});
});

describe('renderer and formulas', () => {
	test('renders nested values, arrays, missing values, and conditionals', () => {
		let rendered = renderTemplate(
			'{{ user.name }}\n{{ tags }}\n{{ absent }}{{#if show}}yes{{/if}}',
			{
				user: { name: 'Ada' },
				tags: ['one', 'two'],
				show: true,
			},
			new Set(['user', 'tags', 'absent', 'show']),
		);
		expect(rendered).toBe('Ada\none\ntwo\nyes');
		expect(() => renderTemplate('{{ unknown }}', {}, new Set())).toThrow(TemplateValidationError);
	});

	test('evaluates every safe built-in', () => {
		expect(evaluateFormula('today()', {}, RUNTIME)).toBe('2026-06-29');
		expect(evaluateFormula('now()', {}, RUNTIME)).toBe('2026-06-29T12:34:56.000Z');
		expect(evaluateFormula('uuid()', {}, RUNTIME)).toBe('fixed-uuid');
		expect(evaluateFormula('slug(title)', { title: ' Héllo, World! ' }, RUNTIME)).toBe('hello-world');
		expect(evaluateFormula('lower(title)', { title: 'ABC' })).toBe('abc');
		expect(evaluateFormula('upper(title)', { title: 'abc' })).toBe('ABC');
		expect(evaluateFormula('trim(title)', { title: ' x ' })).toBe('x');
		expect(evaluateFormula(`replace(title, "a", 'b')`, { title: 'a cat' })).toBe('b cbt');
		expect(() => evaluateFormula('eval(code)', { code: 'x' })).toThrow(FormulaError);
		expect(() => evaluateFormula('slug()', {})).toThrow('expects 1 argument');
	});

	test('uses the local calendar date for today', () => {
		let localDate = {
			getFullYear: () => 2026,
			getMonth: () => 5,
			getDate: () => 30,
			toISOString: () => '2026-06-29T22:30:00.000Z',
		} as Date;
		expect(evaluateFormula('today()', {}, { now: () => localDate, uuid: () => 'unused' })).toBe('2026-06-30');
	});
});

describe('variable resolution', () => {
	test('resolves context, user input, dependent formulas, defaults, and types', () => {
		let definitions = {
			file: { type: 'special' as const, source: 'activeFile.basename' as const },
			title: { type: 'text' as const, required: true },
			slug: { type: 'text' as const, formula: 'slug(title)' },
			loud: { type: 'text' as const, formula: 'upper(slug)' },
			count: { type: 'number' as const, default: '2' },
		};
		expect(variablesNeedingInput(definitions)).toEqual(['title', 'count']);
		expect(resolveVariables(definitions, CONTEXT, { title: 'My Note' }, RUNTIME)).toEqual({
			file: 'Source',
			title: 'My Note',
			slug: 'my-note',
			loud: 'MY-NOTE',
			count: 2,
		});
	});

	test('lets formulas consume omitted optional inputs as empty values', () => {
		expect(resolveVariables({ base: { type: 'text' }, derived: { type: 'text', formula: 'upper(base)' } }, CONTEXT, {}).derived).toBe('');
	});

	test('detects missing required values and formula cycles', () => {
		expect(() => resolveVariables({ title: { type: 'text', required: true } }, CONTEXT, {})).toThrow(MissingRequiredVariableError);
		expect(() => resolveVariables({ a: { type: 'text', formula: 'lower(b)' }, b: { type: 'text', formula: 'lower(a)' } }, CONTEXT, {})).toThrow(
			FormulaError,
		);
	});

	test('rejects multiselect values outside configured options', () => {
		expect(() => resolveVariables({ tags: { type: 'multiselect', options: ['one', 'two'] } }, CONTEXT, { tags: 'one\nthree' })).toThrow(
			'outside its configured options',
		);
	});
});

describe('paths and conflicts', () => {
	test('normalizes safe vault paths and rejects escape paths', () => {
		expect(normalizeVaultFolder('./Projects//./Work/')).toBe('Projects/Work');
		expect(() => normalizeVaultFolder('/tmp')).toThrow(TemplateValidationError);
		expect(() => normalizeVaultFolder('Projects/../Secrets')).toThrow(TemplateValidationError);
		expect(() => normalizeVaultFolder('C:\\tmp')).toThrow(TemplateValidationError);
	});

	test('appends numbers without overwriting', () => {
		let existing = new Set(['Notes/Name.md', 'Notes/Name 1.md']);
		expect(findAvailablePath('Notes/Name.md', 'append-number', path => existing.has(path))).toBe('Notes/Name 2.md');
		expect(() => findAvailablePath('Notes/Name.md', 'cancel', path => existing.has(path))).toThrow(FileConflictError);
	});

	test('renders explicit and fallback folder modes and sanitizes filenames', () => {
		let base: TemplateDefinition = {
			id: 'x',
			name: 'Default name',
			sourcePath: 'x.md',
			variables: { slug: { type: 'text' } },
			body: '',
			rawFrontmatter: '',
			parsedFrontmatter: {},
			output: { folder: { mode: 'path', path: 'Projects/{{ slug }}' }, filename: ' Bad: {{ slug }} ' },
		};
		expect(renderNote(base, CONTEXT, { slug: 'One' }, 'Default').folder).toBe('Projects/One');
		expect(renderNote(base, CONTEXT, { slug: 'One' }, 'Default').filename).toBe('Bad- One.md');
		base.output = { folder: { mode: 'same-as-active-file' } };
		expect(renderNote(base, { ...CONTEXT, activeFileFolder: null }, {}, 'Fallback').usedFolderFallback).toBeTrue();
	});

	test('rejects invalid rendered output YAML', () => {
		let template: TemplateDefinition = {
			id: 'x',
			name: 'X',
			sourcePath: 'x',
			variables: { value: { type: 'text' } },
			body: '',
			outputFrontmatterTemplate: 'items: [{{ value }}',
			rawFrontmatter: '',
			parsedFrontmatter: {},
		};
		expect(() => renderNote(template, CONTEXT, { value: 'x' }, '')).toThrow('Invalid rendered note frontmatter');
	});
});

describe('frontmatter editing and complete rendering', () => {
	test('recognizes and replaces empty frontmatter', () => {
		let content = '---\n---\nBody';
		expect(parseFrontmatter(content).hasFrontmatter).toBeTrue();
		expect(mergeTemplateFrontmatter(content, { template: { id: 'x', name: 'X' } })).toBe('---\ntemplate:\n  id: x\n  name: X\n---\nBody');
	});
	test('preserves unknown metadata and body exactly', () => {
		let content = '---\ntemplate:\n  id: old\ncssclasses: [wide]\n---\nBody\n```note-frontmatter\na: b\n```\n';
		let merged = mergeTemplateFrontmatter(content, { template: { id: 'new', name: 'New' }, variables: {}, output: undefined });
		let parsed = parseFrontmatter(merged);
		expect(parsed.data.cssclasses).toEqual(['wide']);
		expect(parsed.data.template).toEqual({ id: 'new', name: 'New' });
		expect(parsed.body).toBe('Body\n```note-frontmatter\na: b\n```\n');
	});

	test('renders a note without copying template metadata', () => {
		let template = parseTemplate(
			'Templates/p.md',
			`---
template: { id: p, name: Project }
variables:
  title: { type: text, required: true }
  slug: { type: text, formula: slug(title) }
output:
  folder: { mode: same-as-active-file }
  filename: "{{ slug }}"
  conflict: append-number
  openAfterCreate: false
---
\`\`\`note-frontmatter
title: "{{ title }}"
\`\`\`
# {{ title }}
`,
		).template as TemplateDefinition;
		let rendered = renderNote(template, CONTEXT, { title: 'Example Project' }, 'Default', RUNTIME);
		expect(rendered.folder).toBe('Projects');
		expect(rendered.filename).toBe('example-project.md');
		expect(rendered.content).toBe('---\ntitle: "Example Project"\n---\n\n# Example Project\n');
		expect(rendered.content).not.toContain('template:');
	});
});
