import { errorMessage, TemplateParseError } from 'packages/core/src/domain/Errors';
import { asRecord } from 'packages/core/src/domain/UnknownValue';
import { readSourceLines, withoutTrailingLineBreak } from 'packages/core/src/domain/SourceText';
import type {
	NoteOutputDefinition,
	ParseResult,
	TemplateDefinition,
	TemplateIdentity,
	ValidationIssue,
	VariableDefinition,
} from 'packages/core/src/domain/Types';
import { FrontmatterHelper } from 'packages/core/src/frontmatter/FrontmatterHelper';
import { TemplateCompiler } from 'packages/core/src/templates/TemplateCompiler';
import { TemplateValidator } from 'packages/core/src/templates/TemplateValidator';
import type { SpecialVariableCatalog } from 'packages/core/src/variables/SpecialVariableRegistry';

interface Fence {
	character: '`' | '~';
	length: number;
	info: string;
}

/** Parses metadata and compiles every templated section of a source file. */
export class TemplateParser {
	private readonly validator: TemplateValidator;

	constructor(
		specialVariables: SpecialVariableCatalog,
		private readonly frontmatter = new FrontmatterHelper(),
		private readonly compiler = new TemplateCompiler(),
		validator?: TemplateValidator,
	) {
		this.validator = validator ?? new TemplateValidator(specialVariables);
	}

	parse(sourcePath: string, content: string): ParseResult {
		try {
			let parsedDocument = this.frontmatter.parse(content);
			let templateIdentity = this.readIdentity(parsedDocument.data.template);
			let variableDefinitions: Record<string, VariableDefinition> = {};
			let rawVariableDefinitions = this.asObject(parsedDocument.data.variables) ?? {};
			for (let [variableName, value] of Object.entries(rawVariableDefinitions)) {
				variableDefinitions[variableName] = (this.asObject(value) ?? { type: '' }) as unknown as VariableDefinition;
			}

			let outputDefinition = this.asObject(parsedDocument.data.output) as NoteOutputDefinition | null;
			let extractedFrontmatter = this.extractOutputFrontmatter(parsedDocument.body);
			let outputFrontmatterTemplate = extractedFrontmatter.blocks[0];
			let template: TemplateDefinition = {
				...templateIdentity,
				sourcePath,
				variables: variableDefinitions,
				body: extractedFrontmatter.body,
				rawFrontmatter: parsedDocument.raw,
				parsedFrontmatter: parsedDocument.data,
				ast: this.compiler.compile(extractedFrontmatter.body, outputFrontmatterTemplate, outputDefinition ?? undefined),
			};
			if (outputDefinition) {
				template.output = outputDefinition;
			}
			if (outputFrontmatterTemplate !== undefined) {
				template.outputFrontmatterTemplate = outputFrontmatterTemplate;
			}

			let metadataIssues = this.validator.validateMetadata(parsedDocument.data);
			let templateIssues = this.validator.validate(template);
			let issues = this.uniqueIssues([...metadataIssues, ...templateIssues]);
			if (extractedFrontmatter.blocks.length > 1) {
				issues.push({ severity: 'error', message: 'A template may contain at most one note-frontmatter block.' });
			}

			if (!parsedDocument.hasFrontmatter) {
				issues.unshift({ severity: 'error', message: 'Template metadata frontmatter is missing.' });
			}

			return { template, issues };
		} catch (error) {
			return { template: null, issues: [{ severity: 'error', message: errorMessage(error) }] };
		}
	}

	private uniqueIssues(issues: ValidationIssue[]): ValidationIssue[] {
		let seen = new Set<string>();
		return issues.filter(issue => {
			let key = `${issue.severity}\0${issue.path ?? ''}\0${issue.message}`;
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	}

	private extractOutputFrontmatter(source: string): { body: string; blocks: string[] } {
		let lines = readSourceLines(source);
		let blocks: string[] = [];
		let removals: { start: number; end: number }[] = [];
		for (let index = 0; index < lines.length; index += 1) {
			let line = lines[index];
			if (!line) {
				continue;
			}

			let fence = this.openingFence(line.text);
			if (!fence) {
				continue;
			}

			let closingIndex = index + 1;
			while (closingIndex < lines.length && !this.closesFence(lines[closingIndex]?.text ?? '', fence)) {
				closingIndex += 1;
			}
			if (closingIndex >= lines.length) {
				if (fence.info === 'note-frontmatter') {
					throw new TemplateParseError('The note-frontmatter block is not closed.');
				}
				break;
			}

			if (fence.info === 'note-frontmatter') {
				let closing = lines[closingIndex];
				if (!closing) {
					break;
				}
				blocks.push(withoutTrailingLineBreak(source.slice(line.end, closing.start)));
				removals.push({ start: line.start, end: closing.end });
			}

			index = closingIndex;
		}

		if (removals.length === 0) {
			return { body: source, blocks };
		}

		let body = source;
		// Remove later ranges first so earlier source offsets remain valid.
		for (let index = removals.length - 1; index >= 0; index -= 1) {
			let removal = removals[index];
			if (removal) {
				body = body.slice(0, removal.start) + body.slice(removal.end);
			}
		}

		return { body, blocks };
	}

	private openingFence(line: string): Fence | null {
		let index = 0;
		while (index < 3 && line[index] === ' ') {
			index += 1;
		}

		let character = line[index];
		if (character !== '`' && character !== '~') {
			return null;
		}

		let markerStart = index;
		while (line[index] === character) {
			index += 1;
		}

		if (index - markerStart < 3) {
			return null;
		}
		return { character, length: index - markerStart, info: line.slice(index).trim() };
	}

	private closesFence(line: string, fence: Fence): boolean {
		let index = 0;
		while (index < 3 && line[index] === ' ') {
			index += 1;
		}

		let markerStart = index;
		while (line[index] === fence.character) {
			index += 1;
		}

		if (index - markerStart < fence.length) {
			return false;
		}

		for (; index < line.length; index += 1) {
			if (line[index] !== ' ' && line[index] !== '\t') {
				return false;
			}
		}

		return true;
	}

	private asObject(value: unknown): Record<string, unknown> | null {
		return asRecord(value);
	}

	private readIdentity(value: unknown): TemplateIdentity {
		let fields = this.asObject(value) ?? {};
		let identity: TemplateIdentity = { id: '', name: '' };
		if (typeof fields.id === 'string') {
			identity.id = fields.id;
		}
		if (typeof fields.name === 'string') {
			identity.name = fields.name;
		}
		if (typeof fields.description === 'string') {
			identity.description = fields.description;
		}
		if (Array.isArray(fields.tags) && fields.tags.every(tag => typeof tag === 'string')) {
			identity.tags = fields.tags;
		}
		return identity;
	}
}
