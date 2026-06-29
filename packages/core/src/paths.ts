import { FileConflictError, TemplateValidationError } from 'packages/core/src/errors';
import { renderTemplate } from 'packages/core/src/renderer';
import type { ExecutionContext, FileConflictStrategy, OutputFolderDefinition, ResolvedVariables } from 'packages/core/src/types';

/**
 * Normalises a vault-relative folder path:
 *   - forward-slashes, no trailing slash
 *   - rejects absolute paths and `..` traversal
 *   - removes empty segments (consecutive slashes) and `.` segments
 */
export function normalizeVaultFolder(path: string): string {
	let normalized = path.replaceAll('\\', '/').trim();
	if (/^(?:\/|[a-zA-Z]:\/)/.test(normalized)) throw new TemplateValidationError('Output folder must be vault-relative.');
	let segments = normalized.split('/');
	if (segments.includes('..')) throw new TemplateValidationError('Output folder cannot contain path traversal segments.');
	return segments.filter(segment => segment && segment !== '.').join('/');
}

/**
 * Determines the final output folder for a rendered note.
 *
 * Three modes:
 *   - `default`              → use the plugin's default output folder
 *   - `same-as-active-file`  → mirror the active file's folder (fallback to default)
 *   - `path`                 → a template-string that is rendered against resolved values
 */
export function resolveOutputFolder(
	definition: OutputFolderDefinition | undefined,
	context: ExecutionContext,
	defaultOutputFolderPath: string,
	values: ResolvedVariables,
): { folder: string; usedFallback: boolean } {
	let selected = definition ?? { mode: 'default' as const };

	if (selected.mode === 'same-as-active-file') {
		return context.activeFileFolder === null
			? { folder: normalizeVaultFolder(defaultOutputFolderPath), usedFallback: true }
			: { folder: normalizeVaultFolder(context.activeFileFolder), usedFallback: false };
	}

	let path = selected.mode === 'path' ? renderTemplate(selected.path, values, new Set(Object.keys(values))) : defaultOutputFolderPath;
	return { folder: normalizeVaultFolder(path), usedFallback: false };
}

/**
 * Renders a filename template and sanitises the result:
 *   - collapses whitespace
 *   - replaces forbidden characters (`<>:"|?*` and control chars) with `-`
 *   - strips trailing `.` and space
 *   - appends `.md` if no extension is present
 */
export function resolveFilename(template: string, values: ResolvedVariables): string {
	let rendered = renderTemplate(template, values, new Set(Object.keys(values)))
		.trim()
		.replace(/\s+/g, ' ');
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

/**
 * Given a desired path, returns an available path according to the conflict
 * strategy.  `exists` is called by the caller (e.g. Obsidian's vault) to
 * check whether a path is already taken.
 */
export function findAvailablePath(
	desiredPath: string,
	strategy: Exclude<FileConflictStrategy, 'prompt'>,
	exists: (path: string) => boolean,
): string {
	if (!exists(desiredPath)) return desiredPath;
	if (strategy === 'cancel') throw new FileConflictError(`A note already exists at "${desiredPath}".`);

	// `append-number` – try `stem 1.ext`, `stem 2.ext`, …
	let extensionIndex = desiredPath.toLowerCase().endsWith('.md') ? desiredPath.length - 3 : desiredPath.length;
	let stem = desiredPath.slice(0, extensionIndex);
	let extension = desiredPath.slice(extensionIndex);
	for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
		let candidate = `${stem} ${index}${extension}`;
		if (!exists(candidate)) return candidate;
	}
	throw new FileConflictError(`Could not find an available filename for "${desiredPath}".`);
}

/** Joins a vault folder path and filename with a `/` separator. */
export function joinVaultPath(folder: string, filename: string): string {
	return folder ? `${folder}/${filename}` : filename;
}
