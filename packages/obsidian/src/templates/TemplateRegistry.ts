import type { TemplateDefinition, ValidationIssue } from 'packages/core/src/index';
import { normalizeVaultFolder, parseTemplate } from 'packages/core/src/index';
import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';

export interface TemplateValidationResult {
	path: string;
	issues: ValidationIssue[];
	template: TemplateDefinition | null;
}

export class TemplateRegistry {
	private results: TemplateValidationResult[] = [];
	private refreshTail: Promise<void> = Promise.resolve();

	constructor(
		private readonly vault: Vault,
		private readonly getFolder: () => string,
	) {}

	refresh(): Promise<void> {
		let refresh = this.refreshTail.catch(() => undefined).then(() => this.refreshNow());
		this.refreshTail = refresh;
		return refresh;
	}

	private async refreshNow(): Promise<void> {
		let folder: string;
		try {
			folder = normalizeVaultFolder(this.getFolder());
		} catch (error) {
			this.results = [
				{ path: this.getFolder(), template: null, issues: [{ severity: 'error', message: error instanceof Error ? error.message : String(error) }] },
			];
			return;
		}
		let prefix = folder ? `${folder}/` : '';
		let files = this.vault.getMarkdownFiles().filter(file => file.path.startsWith(prefix));
		this.results = await Promise.all(
			files.map(async file => {
				try {
					let parsed = parseTemplate(file.path, await this.vault.cachedRead(file));
					return { path: file.path, template: parsed.template, issues: parsed.issues };
				} catch (error) {
					return {
						path: file.path,
						template: null,
						issues: [{ severity: 'error' as const, message: `Could not read template: ${error instanceof Error ? error.message : String(error)}` }],
					};
				}
			}),
		);
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
			for (let duplicate of duplicates) duplicate.issues.push({ severity: 'error', message: `Template ID "${id}" is duplicated in: ${paths}.` });
		}
	}

	getAll(): TemplateDefinition[] {
		return this.results.flatMap(result => (result.template && !result.issues.some(issue => issue.severity === 'error') ? [result.template] : []));
	}

	getById(id: string): TemplateDefinition | null {
		return this.getAll().find(template => template.id === id) ?? null;
	}

	getValidationResults(): TemplateValidationResult[] {
		return this.results;
	}

	getMarkdownFiles(): TFile[] {
		return this.results.map(result => this.vault.getAbstractFileByPath(result.path)).filter((file): file is TFile => file instanceof TFile);
	}
}
