import { FileConflictError, TemplateValidationError } from 'packages/core/src/domain/Errors';
import type { ExecutionContext, FileConflictStrategy, OutputFolderDefinition } from 'packages/core/src/domain/Types';

/** Centralizes vault-relative output folder, filename, and conflict handling. */
export class OutputPathResolver {
	normalizeFolder(path: string): string {
		let normalized = path.replaceAll('\\', '/').trim();
		if (/^(?:\/|[a-zA-Z]:\/)/.test(normalized)) throw new TemplateValidationError('Output folder must be vault-relative.');
		let segments = normalized.split('/');
		if (segments.includes('..')) throw new TemplateValidationError('Output folder cannot contain path traversal segments.');
		return segments.filter(segment => segment && segment !== '.').join('/');
	}

	resolveFolder(
		definition: OutputFolderDefinition | undefined,
		context: ExecutionContext,
		defaultOutputFolderPath: string,
		renderedPath?: string,
	): { folder: string; usedFallback: boolean } {
		let selected = definition ?? { mode: 'default' as const };
		if (selected.mode === 'same-as-active-file') {
			return context.activeFileFolder === null
				? { folder: this.normalizeFolder(defaultOutputFolderPath), usedFallback: true }
				: { folder: this.normalizeFolder(context.activeFileFolder), usedFallback: false };
		}
		let path = selected.mode === 'path' ? (renderedPath ?? selected.path) : defaultOutputFolderPath;
		return { folder: this.normalizeFolder(path), usedFallback: false };
	}

	resolveFilename(renderedTemplate: string): string {
		let rendered = renderedTemplate.trim().replace(/\s+/g, ' ');
		if (rendered.includes('/') || rendered.includes('\\'))
			throw new TemplateValidationError('Output filename cannot contain path separators.');
		let cleaned = [...rendered]
			.map(character => (character.charCodeAt(0) < 32 || '<>:"|?*'.includes(character) ? '-' : character))
			.join('')
			.replace(/[. ]+$/g, '')
			.trim();
		if (!cleaned) throw new TemplateValidationError('Output filename is empty.');
		return /\.md$/i.test(cleaned) ? cleaned : `${cleaned}.md`;
	}

	findAvailable(desiredPath: string, strategy: Exclude<FileConflictStrategy, 'prompt'>, exists: (path: string) => boolean): string {
		if (!exists(desiredPath)) return desiredPath;
		if (strategy === 'cancel') throw new FileConflictError(`A note already exists at "${desiredPath}".`);
		let extensionIndex = desiredPath.toLowerCase().endsWith('.md') ? desiredPath.length - 3 : desiredPath.length;
		let stem = desiredPath.slice(0, extensionIndex);
		let extension = desiredPath.slice(extensionIndex);
		for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
			let candidate = `${stem} ${index}${extension}`;
			if (!exists(candidate)) return candidate;
		}
		throw new FileConflictError(`Could not find an available filename for "${desiredPath}".`);
	}

	join(folder: string, filename: string): string {
		return folder ? `${folder}/${filename}` : filename;
	}
}
