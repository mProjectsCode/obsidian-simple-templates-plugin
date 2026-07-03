/** Result of resolving a configured output folder. */
export interface ResolvedOutputFolder {
	folder: string;
	usedFolderFallback: boolean;
}

/**
 * Supplies the host-specific value for every output folder mode.
 *
 * Returning `null` from `getActiveFileFolder` asks core to use the default
 * folder and report that a fallback occurred.
 */
export interface OutputFolderProvider {
	getDefaultFolder(): string;
	getActiveFileFolder(): string | null;
	getExplicitFolder(path: string): string;
}
