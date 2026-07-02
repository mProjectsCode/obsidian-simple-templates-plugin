import { describe, expect, test } from 'bun:test';
import {
	FileConflictError,
	ExpressionEvaluator,
	FormulaError,
	FrontmatterService,
	MissingRequiredVariableError,
	OutputPathResolver,
	TemplateEngine,
	TemplateParser,
	TemplateProgramParser,
	TemplateRenderer,
	TemplateValidationError,
	VariableResolver,
	SpecialVariableRegistry,
} from 'packages/core/src/index';
import type { ExecutionContext, ResolvedVariables, TemplateDefinition, VariableDefinition } from 'packages/core/src/index';

const CONTEXT: ExecutionContext = {
	activeFilePath: 'Projects/Source.md',
	activeFileBasename: 'Source',
	activeFileFolder: 'Projects',
	activeFileFrontmatter: { status: 'active' },
	cursor: { line: 3, ch: 4 },
};
const SPECIAL_VARIABLES = new SpecialVariableRegistry()
	.register('host.basename', {
		label: 'Host basename',
		resolve: context => context.activeFileBasename,
	})
	.register('test.value', {
		label: 'Test value',
		resolve: context => context.activeFileContent ?? null,
	});
const TEMPLATE_PARSER = new TemplateParser(SPECIAL_VARIABLES);
const PROGRAM_PARSER = new TemplateProgramParser();
const FRONTMATTER = new FrontmatterService();

class MockExpressionEvaluator extends ExpressionEvaluator {
	readonly calls: { expression: string; values: ResolvedVariables; sourcePath?: string }[] = [];

	override async evaluate(expression: string, values: ResolvedVariables, sourcePath?: string): Promise<unknown> {
		this.calls.push({ expression, values: structuredClone(values), ...(sourcePath ? { sourcePath } : {}) });
		switch (expression) {
			case 'date == today() && status == "done"':
				return values.date === 'today' && values.status === 'done';
			case 'tasks.filter(x => x.status == "done").map(x => x.name).join(", ")':
				return (values.tasks as { name: string; status: string }[])
					.filter(item => item.status === 'done')
					.map(item => item.name)
					.join(', ');
			case '({ done: true }).done':
				return true;
			case 'title.toLowerCase().replaceAll(" ", "-")':
				return this.stringInput(values, 'title').toLowerCase().replaceAll(' ', '-');
			case 'slug.toUpperCase()':
				return this.stringInput(values, 'slug').toUpperCase();
			case 'base?.toUpperCase() ?? ""':
				return values.base === undefined ? '' : this.stringInput(values, 'base').toUpperCase();
			default:
				if (/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(expression)) {
					let value: unknown = values;
					for (let part of expression.split('.'))
						value = value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
					return value;
				}
				throw new FormulaError(`Unknown test expression: ${expression}`);
		}
	}

	private stringInput(inputs: ResolvedVariables, name: string): string {
		let value = inputs[name];
		if (typeof value !== 'string') throw new Error(`Expected string input: ${name}`);
		return value;
	}
}

const EXPRESSIONS = new MockExpressionEvaluator();
const TEMPLATE_RENDERER = new TemplateRenderer(EXPRESSIONS, PROGRAM_PARSER);
const PATHS = new OutputPathResolver();

async function rejected(promise: Promise<unknown>): Promise<Error> {
	try {
		await promise;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
	throw new Error('Expected the promise to reject.');
}

function parseTemplate(sourcePath: string, content: string) {
	return TEMPLATE_PARSER.parse(sourcePath, content);
}

function resolveVariables(definitions: Record<string, VariableDefinition>, context: ExecutionContext, userValues: ResolvedVariables) {
	return new VariableResolver(SPECIAL_VARIABLES, EXPRESSIONS).resolve(definitions, context, userValues);
}

function renderNote(
	template: TemplateDefinition,
	context: ExecutionContext,
	userValues: ResolvedVariables,
	defaultOutputFolderPath: string,
) {
	return new TemplateEngine(SPECIAL_VARIABLES, EXPRESSIONS).render(template, context, userValues, defaultOutputFolderPath);
}

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
    formula: title.toLowerCase().replaceAll(" ", "-")
output:
  filename: "{{ slug }}"
custom: keep
---
This content is above the output frontmatter and must be discarded.

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
		expect(result.template?.ast?.noteFrontmatter?.references).toEqual(['title']);
		expect(result.template?.ast?.filename?.references).toEqual(['slug']);
		expect(result.template?.body).toBe('\n# {{ title }}\n');
		expect(result.template?.body).not.toContain('must be discarded');
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
		expect(empty.template?.body).toBe('Body');
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

	test('reports an unclosed output frontmatter fence', () => {
		let result = parseTemplate('bad.md', '---\ntemplate: { id: bad, name: Bad }\n---\n```note-frontmatter\ntitle: value');
		expect(result.template).toBeNull();
		expect(result.issues[0]?.message).toBe('The note-frontmatter block is not closed.');
	});

	test('does not treat a thematic break later in the document as frontmatter', () => {
		let content = 'Introduction\n---\ntemplate: { id: not-frontmatter, name: Not frontmatter }\n---\nBody';
		let document = FRONTMATTER.parse(content);
		expect(document).toEqual({ raw: null, data: {}, body: content, hasFrontmatter: false });
		expect(parseTemplate('plain.md', content).issues.some(issue => issue.message.includes('frontmatter is missing'))).toBeTrue();
	});

	test('validates metadata shapes while deferring expressions to Safe JS', () => {
		let result = parseTemplate(
			'bad.md',
			`---
template: { id: bad, name: 12, tags: nope }
variables:
  broken: nope
  a: { type: text, formula: b.toLowerCase() }
  b: { type: text, formula: a.toLowerCase() }
output: { openAfterCreate: yes }
---
body`,
		);
		let messages = result.issues.map(issue => issue.message);
		expect(messages).toContain('Template name must be a string.');
		expect(messages).toContain('Template tags must be a list of strings.');
		expect(messages).toContain('Variable "broken" must be a mapping.');
		expect(messages.some(message => message.includes('circular dependency'))).toBeFalse();
		expect(messages).toContain('Open after create must be true or false.');
	});

	test('reports malformed output templates without aborting parsing', () => {
		let result = parseTemplate(
			'bad-output.md',
			'---\ntemplate: { id: bad-output, name: Bad output }\noutput:\n  filename: 12\n  folder: { mode: path, path: 34 }\n---\nBody',
		);
		expect(result.template).not.toBeNull();
		expect(result.issues.map(issue => issue.message)).toContain('Output filename must be a string.');
		expect(result.issues.map(issue => issue.message)).toContain('Explicit output folder requires a path.');
	});
});

describe('renderer and expressions', () => {
	test('builds a source-located AST and renders nested conditional branches', async () => {
		let program = PROGRAM_PARSER.parse('Hi {{ user.name }}{{#if enabled}}!{{#if extra}}+{{ extra }}{{else}}?{{/if}}{{else}} no{{/if}}');
		expect(program.references).toEqual(['user', 'enabled', 'extra']);
		expect(program.nodes.map(node => node.type)).toEqual(['text', 'expression', 'if']);
		expect(program.nodes[1]).toMatchObject({ type: 'expression', expression: 'user.name', start: 3, end: 18 });
		expect(await TEMPLATE_RENDERER.renderProgram(program, { user: { name: 'Ada' }, enabled: true, extra: 'yes' })).toBe('Hi Ada!+yes');
		expect(await TEMPLATE_RENDERER.renderProgram(program, { user: { name: 'Ada' }, enabled: true, extra: '' })).toBe('Hi Ada!?');
		expect(await TEMPLATE_RENDERER.renderProgram(program, { user: { name: 'Ada' }, enabled: false, extra: 'yes' })).toBe('Hi Ada no');
	});

	test('supports arbitrary else-if branches and stops after the first match', async () => {
		let evaluator = new MockExpressionEvaluator();
		let renderer = new TemplateRenderer(evaluator, PROGRAM_PARSER);
		let template = '{{#if first}}1{{else if second}}2{{else if third}}3{{else if fourth}}4{{else}}fallback{{/if}}';
		let program = PROGRAM_PARSER.parse(template);
		expect(program.references).toEqual(['first', 'second', 'third', 'fourth']);
		expect(await renderer.renderProgram(program, { first: false, second: false, third: true, fourth: true })).toBe('3');
		expect(evaluator.calls.map(call => call.expression)).toEqual(['first', 'second', 'third']);
	});

	test('reports malformed template syntax with an exact source offset', () => {
		expect(() => PROGRAM_PARSER.parse('{{ value { nope }}')).toThrow('offset');
		expect(() => PROGRAM_PARSER.parse('{{#if show}}missing close')).toThrow('offset');
		expect(() => PROGRAM_PARSER.parse('{{/if}}')).toThrow('offset 2');
	});

	test('distinguishes tag boundaries, keywords, identifiers, and ordinary backslashes', () => {
		let program = PROGRAM_PARSER.parse('single { brace } \\ path {{ elsewhere }} {{ user?.name }}');
		expect(program.nodes).toMatchObject([
			{ type: 'text', value: 'single { brace } \\ path ' },
			{ type: 'expression', expression: 'elsewhere' },
			{ type: 'text', value: ' ' },
			{ type: 'expression', expression: 'user?.name' },
		]);
		expect(program.references).toEqual(['elsewhere', 'user']);

		let loop = PROGRAM_PARSER.parse('{{#for $item in items}}{{ $item }}{{empty}}none{{/for}}');
		expect(loop.references).toEqual(['items']);
		expect(() => PROGRAM_PARSER.parse('{{else}}')).toThrow('offset');
		expect(() => PROGRAM_PARSER.parse('{{else if condition}}')).toThrow('offset');
		expect(() => PROGRAM_PARSER.parse('{{empty}}')).toThrow('offset');
	});

	test('renders expressions through Safe JS and unescapes expression braces', async () => {
		let example = PROGRAM_PARSER.parse('Completed Tasks: {{ tasks.filter(x => x.status == "done").join(", ") }}');
		expect(example.nodes[1]).toMatchObject({
			type: 'expression',
			expression: 'tasks.filter(x => x.status == "done").join(", ")',
		});
		let rendered = await TEMPLATE_RENDERER.render('{{ user.name }}\n{{ tags }}\n{{ absent }}{{#if show}}yes{{/if}}', {
			user: { name: 'Ada' },
			tags: ['one', 'two'],
			show: true,
		});
		expect(rendered).toBe('Ada\none\ntwo\nyes');
		expect(await TEMPLATE_RENDERER.render('{{ (\\{ done: true \\}).done }}', {})).toBe('true');
		expect(
			await TEMPLATE_RENDERER.render('{{#if date == today() && status == "done"}}yes{{else}}no{{/if}}', {
				date: 'today',
				status: 'done',
			}),
		).toBe('yes');
		expect(
			await TEMPLATE_RENDERER.render('Completed tasks: {{ tasks.filter(x => x.status == "done").map(x => x.name).join(", ") }}', {
				tasks: [
					{ name: 'A', status: 'done' },
					{ name: 'B', status: 'open' },
				],
			}),
		).toBe('Completed tasks: A');
	});

	test('coerces loop values and supports else and empty fallbacks', async () => {
		let withEmpty = '{{#for task in tasks}}[{{ task.name }}]{{empty}}none{{/for}}';
		expect(await TEMPLATE_RENDERER.render(withEmpty, { tasks: [{ name: 'A' }, { name: 'B' }] })).toBe('[A][B]');
		expect(await TEMPLATE_RENDERER.render(withEmpty, { tasks: [] })).toBe('none');
		expect(await TEMPLATE_RENDERER.render('{{#for item in value}}{{ item }}{{else}}empty{{/for}}', { value: 'one' })).toBe('one');
		expect(await TEMPLATE_RENDERER.render('{{#for item in value}}{{ item }}{{else}}empty{{/for}}', { value: '' })).toBe('empty');
	});

	test('delegates expressions and source context through the core abstraction', async () => {
		let evaluator = new MockExpressionEvaluator();
		let values = await new VariableResolver(SPECIAL_VARIABLES, evaluator).resolve(
			{
				title: { type: 'text' },
				slug: { type: 'text', formula: 'title.toLowerCase().replaceAll(" ", "-")' },
			},
			CONTEXT,
			{ title: 'My Note' },
			'x.md',
		);
		expect(values.slug).toBe('my-note');
		expect(evaluator.calls[0]).toEqual({
			expression: 'title.toLowerCase().replaceAll(" ", "-")',
			values: { title: 'My Note' },
			sourcePath: 'x.md',
		});
		expect(await rejected(evaluator.evaluate('unknown()', {}))).toBeInstanceOf(FormulaError);
	});
});

describe('variable resolution', () => {
	test('resolves host-registered special variables', async () => {
		let values = await resolveVariables(
			{ value: { type: 'special', source: 'test.value' } },
			{ ...CONTEXT, activeFileContent: 'content' },
			{},
		);
		expect(values.value).toBe('content');
		expect(SPECIAL_VARIABLES.get('test.value')?.label).toBe('Test value');
		expect(() => SPECIAL_VARIABLES.resolve('missing', CONTEXT)).toThrow('is not registered');
		expect(() => SPECIAL_VARIABLES.register('test.value', { label: 'Duplicate', resolve: () => null })).toThrow('already registered');
	});

	test('resolves context, user input, ordered expressions, defaults, and types', async () => {
		let definitions = {
			file: { type: 'special' as const, source: 'host.basename' as const },
			title: { type: 'text' as const, required: true },
			slug: { type: 'text' as const, formula: 'title.toLowerCase().replaceAll(" ", "-")' },
			loud: { type: 'text' as const, formula: 'slug.toUpperCase()' },
			count: { type: 'number' as const, default: '2' },
		};
		expect(VariableResolver.needingInput(definitions)).toEqual(['title', 'count']);
		expect(await resolveVariables(definitions, CONTEXT, { title: 'My Note' })).toEqual({
			file: 'Source',
			title: 'My Note',
			slug: 'my-note',
			loud: 'MY-NOTE',
			count: 2,
		});
	});

	test('lets expressions handle omitted optional inputs', async () => {
		expect(
			(
				await resolveVariables(
					{ base: { type: 'text' }, derived: { type: 'text', formula: 'base?.toUpperCase() ?? ""' } },
					CONTEXT,
					{},
				)
			).derived,
		).toBe('');
	});

	test('detects missing required values and expression failures', async () => {
		expect(await rejected(resolveVariables({ title: { type: 'text', required: true } }, CONTEXT, {}))).toBeInstanceOf(
			MissingRequiredVariableError,
		);
		expect(await rejected(resolveVariables({ a: { type: 'text', formula: 'unknown()' } }, CONTEXT, {}))).toBeInstanceOf(FormulaError);
	});

	test('rejects multiselect values outside configured options', async () => {
		expect(
			(await rejected(resolveVariables({ tags: { type: 'multiselect', options: ['one', 'two'] } }, CONTEXT, { tags: 'one\nthree' })))
				.message,
		).toContain('outside its configured options');
	});
});

describe('paths and conflicts', () => {
	test('normalizes safe vault paths and rejects escape paths', () => {
		expect(PATHS.normalizeFolder('./Projects//./Work/')).toBe('Projects/Work');
		expect(() => PATHS.normalizeFolder('/tmp')).toThrow(TemplateValidationError);
		expect(() => PATHS.normalizeFolder('Projects/../Secrets')).toThrow(TemplateValidationError);
		expect(() => PATHS.normalizeFolder('C:\\tmp')).toThrow(TemplateValidationError);
	});

	test('appends numbers without overwriting', () => {
		let existing = new Set(['Notes/Name.md', 'Notes/Name 1.md']);
		expect(PATHS.findAvailable('Notes/Name.md', 'append-number', path => existing.has(path))).toBe('Notes/Name 2.md');
		expect(() => PATHS.findAvailable('Notes/Name.md', 'cancel', path => existing.has(path))).toThrow(FileConflictError);
	});

	test('renders explicit and fallback folder modes and sanitizes filenames', async () => {
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
		expect((await renderNote(base, CONTEXT, { slug: 'One' }, 'Default')).folder).toBe('Projects/One');
		expect((await renderNote(base, CONTEXT, { slug: 'One' }, 'Default')).filename).toBe('Bad- One.md');
		base.output = { folder: { mode: 'same-as-active-file' } };
		expect((await renderNote(base, { ...CONTEXT, activeFileFolder: null }, {}, 'Fallback')).usedFolderFallback).toBeTrue();
	});

	test('rejects invalid rendered output YAML', async () => {
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
		expect((await rejected(renderNote(template, CONTEXT, { value: 'x' }, ''))).message).toContain('Invalid rendered note frontmatter');
	});
});

describe('frontmatter editing and complete rendering', () => {
	test('recognizes and replaces empty frontmatter', () => {
		let content = '---\n---\nBody';
		expect(FRONTMATTER.parse(content).hasFrontmatter).toBeTrue();
		expect(FRONTMATTER.mergeTemplate(content, { template: { id: 'x', name: 'X' } })).toBe(
			'---\ntemplate:\n  id: x\n  name: X\n---\nBody',
		);
	});

	test('preserves unknown metadata and body exactly', () => {
		let content = '---\ntemplate:\n  id: old\ncssclasses: [wide]\n---\nBody\n```note-frontmatter\na: b\n```\n';
		let merged = FRONTMATTER.mergeTemplate(content, { template: { id: 'new', name: 'New' }, variables: {}, output: undefined });
		let parsed = FRONTMATTER.parse(merged);
		expect(parsed.data.cssclasses).toEqual(['wide']);
		expect(parsed.data.template).toEqual({ id: 'new', name: 'New' });
		expect(parsed.body).toBe('Body\n```note-frontmatter\na: b\n```\n');
	});

	test('renders a note without copying template metadata', async () => {
		let template = parseTemplate(
			'Templates/p.md',
			`---
template: { id: p, name: Project }
variables:
  title: { type: text, required: true }
  slug: { type: text, formula: 'title.toLowerCase().replaceAll(" ", "-")' }
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
		).template!;
		let rendered = await renderNote(template, CONTEXT, { title: 'Example Project' }, 'Default');
		expect(rendered.folder).toBe('Projects');
		expect(rendered.filename).toBe('example-project.md');
		expect(rendered.content).toBe('---\ntitle: "Example Project"\n---\n\n# Example Project\n');
		expect(rendered.content).not.toContain('template:');
	});
});
