import { TemplateValidationError } from 'packages/core/src/domain/Errors';
import type { OutputFolderDefinition } from 'packages/core/src/domain/Types';
import type { OutputFolderProvider, ResolvedOutputFolder } from 'packages/core/src/output/OutputFolderProvider';
import { VaultPathService } from 'packages/core/src/output/VaultPathService';

/** Resolves rendered output configuration into a safe folder and filename. */
export class OutputPathResolver {
	constructor(private readonly pathService = new VaultPathService()) {}

	resolveFolder(
		definition: OutputFolderDefinition | undefined,
		provider: OutputFolderProvider,
		renderedPath?: string,
	): ResolvedOutputFolder {
		let folderDefinition = definition ?? { mode: 'default' as const };
		if (folderDefinition.mode === 'same-as-active-file') {
			let activeFileFolder = provider.getActiveFileFolder();

			if (activeFileFolder === null) {
				return {
					folder: this.pathService.normalizeFolder(provider.getDefaultFolder()),
					usedFolderFallback: true,
				};
			}

			return { folder: this.pathService.normalizeFolder(activeFileFolder), usedFolderFallback: false };
		}

		let folder = provider.getDefaultFolder();
		if (folderDefinition.mode === 'path') {
			folder = provider.getExplicitFolder(renderedPath ?? folderDefinition.path);
		}

		return { folder: this.pathService.normalizeFolder(folder), usedFolderFallback: false };
	}

	resolveFilename(renderedTemplate: string): string {
		let normalizedFilename = renderedTemplate.trim().replace(/\s+/g, ' ');
		if (this.pathService.hasPathSeparator(normalizedFilename)) {
			throw new TemplateValidationError('Output filename cannot contain path separators.');
		}

		let cleanedFilename = [...normalizedFilename]
			.map(character => (this.pathService.hasUnsupportedFilenameCharacters(character) ? '-' : character))
			.join('')
			.replace(/[. ]+$/g, '')
			.trim();

		if (!cleanedFilename) {
			throw new TemplateValidationError('Output filename is empty.');
		}

		return this.pathService.ensureMarkdownExtension(cleanedFilename);
	}
}
