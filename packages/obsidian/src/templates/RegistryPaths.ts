import { VaultPathService } from 'packages/core/src/index';

const PATHS = new VaultPathService();

/**
 * Determines whether a set of vault paths could affect the template registry.
 *
 * - A Markdown file affects the registry when it lives inside the template
 *   folder.
 * - A directory (or non-Markdown file) affects the registry when its path is
 *   the template folder itself, is a child of it, or when the template folder
 *   is a child of it (i.e. a parent directory was renamed).
 */
export function pathAffectsTemplateRegistry(folder: string, paths: string[], markdownFile: boolean): boolean {
	if (markdownFile) {
		return paths.some(path => path.toLowerCase().endsWith('.md') && PATHS.isInFolder(path, folder));
	}
	return paths.some(
		path => !folder || path === folder || PATHS.isInFolder(path, folder) || (path !== '' && PATHS.isInFolder(folder, path)),
	);
}
