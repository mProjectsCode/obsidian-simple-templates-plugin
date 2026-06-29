export function pathAffectsTemplateRegistry(folder: string, paths: string[], markdownFile: boolean): boolean {
	if (markdownFile) return paths.some(path => path.toLowerCase().endsWith('.md') && (!folder || path.startsWith(`${folder}/`)));
	return paths.some(path => !folder || path === folder || path.startsWith(`${folder}/`) || folder.startsWith(`${path}/`));
}
