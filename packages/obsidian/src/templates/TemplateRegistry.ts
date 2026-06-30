import { OutputPathResolver, TemplateParser } from 'packages/core/src/index';
import type { SpecialVariableRegistry, TemplateDefinition, ValidationIssue } from 'packages/core/src/index';
import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';

/** Stores the result of parsing a single template file. */
export interface TemplateValidationResult {
	path: string;
	issues: ValidationIssue[];
	template: TemplateDefinition | null;
}

/**
 * Manages the in-memory cache of all parsed templates within the configured
 * template folder.  Supports deduplication error detection and provides a
 * simple query API.
 */
export class TemplateRegistry {
	private results: TemplateValidationResult[] = [];
	private refreshTail: Promise<void> = Promise.resolve();
	private readonly parser: TemplateParser;
	private readonly paths = new OutputPathResolver();

	constructor(
		private readonly vault: Vault,
		private readonly getFolder: () => string,
		specialVariables: SpecialVariableRegistry<unknown>,
	) {
		this.parser = new TemplateParser(specialVariables);
	}

	/**
	 * Queues a full refresh. Promise chaining ensures concurrent calls run
	 * serially.
	 */
	refresh(): Promise<void> {
		let queuedRefresh = this.refreshTail.catch(() => undefined).then(() => this.refreshNow());
		this.refreshTail = queuedRefresh;
		return queuedRefresh;
	}

	/** Parses every Markdown file in the template folder and runs validation. */
	private async refreshNow(): Promise<void> {
		let configuredFolder = this.getFolder();
		let folder: string;
		try {
			folder = this.paths.normalizeFolder(configuredFolder);
		} catch (error) {
			this.results = [
				{
					path: configuredFolder,
					template: null,
					issues: [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }],
				},
			];
			return;
		}

		let prefix = folder ? `${folder}/` : '';
		let files = this.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix));

		this.results = await Promise.all(files.map(file => this.parseFile(file)));
		this.addDuplicateIdIssues();
	}

	private async parseFile(file: TFile): Promise<TemplateValidationResult> {
		try {
			let parsed = this.parser.parse(file.path, await this.vault.cachedRead(file));
			return { path: file.path, template: parsed.template, issues: parsed.issues };
		} catch (error) {
			return {
				path: file.path,
				template: null,
				issues: [
					{
						severity: 'error',
						message: `Could not read template: ${error instanceof Error ? error.message : String(error)}`,
					},
				],
			};
		}
	}

	/** Adds validation errors to every template that shares an ID. */
	private addDuplicateIdIssues(): void {
		let byId = new Map<string, TemplateValidationResult[]>();
		for (let result of this.results) {
			if (!result.template?.id) continue;
			let group = byId.get(result.template.id) ?? [];
			group.push(result);
			byId.set(result.template.id, group);
		}

		for (let [id, duplicates] of byId) {
			if (duplicates.length < 2) continue;
			let paths = duplicates.map(result => result.path).join(', ');
			for (let duplicate of duplicates) {
				duplicate.issues.push({ severity: 'error', message: `Template ID "${id}" is duplicated in: ${paths}.` });
			}
		}
	}

	/** Returns all templates that parsed without errors. */
	getAll(): TemplateDefinition[] {
		return this.results.flatMap(result =>
			result.template && !result.issues.some(issue => issue.severity === 'error') ? [result.template] : [],
		);
	}

	/** Looks up a template by its unique ID. */
	getById(id: string): TemplateDefinition | null {
		return this.getAll().find(template => template.id === id) ?? null;
	}

	/** Returns the raw validation results (including invalid templates). */
	getValidationResults(): TemplateValidationResult[] {
		return this.results;
	}

	/** Returns the underlying Obsidian TFile objects for all processed files. */
	getMarkdownFiles(): TFile[] {
		return this.results
			.map(result => this.vault.getAbstractFileByPath(result.path))
			.filter((file): file is TFile => file instanceof TFile);
	}
}
