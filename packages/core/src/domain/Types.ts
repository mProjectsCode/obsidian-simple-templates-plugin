import type { TemplateAst } from 'packages/core/src/domain/TemplateAst';

/** Primitive types a template variable can hold. */
export type VariableType = 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'datetime' | 'select' | 'multiselect' | 'list' | 'special';

/** All valid variable types in one array (used for runtime validation). */
export const VARIABLE_TYPES = [
	'text',
	'textarea',
	'number',
	'boolean',
	'date',
	'datetime',
	'select',
	'multiselect',
	'list',
	'special',
] as const satisfies readonly VariableType[];

/** Declaration of a single template variable. */
export interface VariableDefinition {
	label?: string;
	description?: string;
	type: VariableType;
	required?: boolean;
	default?: unknown;
	formula?: string;
	source?: string;
	options?: string[];
	ask?: boolean;
}

/** Controls where the rendered note is placed. */
export type OutputFolderDefinition = { mode: 'default' } | { mode: 'same-as-active-file' } | { mode: 'path'; path: string };

/** Behaviour when the destination path already exists. */
export type FileConflictStrategy = 'prompt' | 'append-number' | 'cancel';

/** Output-related configuration for a rendered note. */
export interface NoteOutputDefinition {
	folder?: OutputFolderDefinition;
	filename?: string;
	conflict?: FileConflictStrategy;
	openAfterCreate?: boolean;
}

/** Identity metadata stored in a template's frontmatter. */
export interface TemplateIdentity {
	id: string;
	name: string;
	description?: string;
	tags?: string[];
}

/** Shape of the metadata-only section of a template frontmatter. */
export interface TemplateMetadata {
	template: TemplateIdentity;
	variables?: Record<string, VariableDefinition>;
	output?: NoteOutputDefinition;
}

/** Fully parsed template ready for execution. */
export interface TemplateDefinition extends TemplateIdentity {
	sourcePath: string;
	variables: Record<string, VariableDefinition>;
	output?: NoteOutputDefinition;
	body: string;
	outputFrontmatterTemplate?: string;
	rawFrontmatter: string | null;
	parsedFrontmatter: Record<string, unknown>;
	/** Precompiled templating sections. Optional for hand-built definitions. */
	ast?: TemplateAst;
}

/**
 * Snapshot of the editor / vault state at the moment a template is about to be
 * rendered.  Populated by the Obsidian host layer and consumed by the core
 * variable-resolution logic.
 */
export interface ExecutionContext {
	activeFileFolder: string | null;
	[key: string]: unknown;
}

/** A single problem found during parsing or validation. */
export interface ValidationIssue {
	severity: 'error' | 'warning';
	message: string;
	path?: string;
}

/** Result of parsing a single template source file. */
export interface ParseResult {
	template: TemplateDefinition | null;
	issues: ValidationIssue[];
}

/** Map of variable names to their resolved (and coerced) values. */
export type ResolvedVariables = Record<string, unknown>;

/** Final output of the render pipeline – a ready-to-write note. */
export interface RenderedNote {
	content: string;
	folder: string;
	filename: string;
	conflict: FileConflictStrategy;
	openAfterCreate: boolean;
}
