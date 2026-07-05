import type { TemplateAst } from 'packages/core/src/domain/TemplateAst';

/** All valid variable types in one array (used for runtime validation). */
export const VARIABLE_TYPES = ['input', 'special', 'formula'] as const;

/** Determines how a template variable receives its value. */
export type VariableType = (typeof VARIABLE_TYPES)[number];

/** All supported input controls in one array (used for runtime validation). */
export const VARIABLE_INPUT_TYPES = ['text', 'textarea', 'number', 'boolean', 'date', 'datetime', 'select', 'multiselect', 'list'] as const;

/** Controls the editor and coercion used for an input variable. */
export type VariableInputType = (typeof VARIABLE_INPUT_TYPES)[number];

export function inputTypeUsesOptions(inputType: VariableInputType): boolean {
	return inputType === 'select' || inputType === 'multiselect';
}

interface BaseVariableDefinition {
	label?: string;
	description?: string;
}

/** A value collected from the user. */
export interface InputVariableDefinition extends BaseVariableDefinition {
	type: 'input';
	inputType: VariableInputType;
	required?: boolean;
	default?: unknown;
	options?: string[];
}

/** A value supplied by a host-registered source. */
export interface SpecialValueVariableDefinition extends BaseVariableDefinition {
	type: 'special';
	source: string;
}

/** A value computed from variables declared above it. */
export interface FormulaVariableDefinition extends BaseVariableDefinition {
	type: 'formula';
	formula: string;
}

/** Declaration of a single template variable. */
export type VariableDefinition = InputVariableDefinition | SpecialValueVariableDefinition | FormulaVariableDefinition;

export const OUTPUT_FOLDER_MODES = ['default', 'same-as-active-file', 'path'] as const;

export type OutputFolderMode = (typeof OUTPUT_FOLDER_MODES)[number];

/** Controls where the rendered note is placed. */
export type OutputFolderDefinition = { mode: Exclude<OutputFolderMode, 'path'> } | { mode: 'path'; path: string };

export const FILE_CONFLICT_STRATEGIES = ['prompt', 'append-number', 'cancel'] as const;

/** Behaviour when the destination path already exists. */
export type FileConflictStrategy = (typeof FILE_CONFLICT_STRATEGIES)[number];

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

/** Final output of the render pipeline, a ready-to-write note. */
export interface RenderedNote {
	content: string;
	folder: string;
	filename: string;
	conflict: FileConflictStrategy;
	openAfterCreate: boolean;
	values: ResolvedVariables;
	usedFolderFallback: boolean;
}
