import { inputTypeUsesOptions, VARIABLE_INPUT_TYPES } from 'packages/core/src/domain/Types';
import type { VariableDefinition } from 'packages/core/src/domain/Types';
import { z } from 'zod';

const BaseVariableShape = {
	label: z.string().optional(),
	description: z.string().optional(),
};

const InputVariableSchema = z
	.strictObject({
		...BaseVariableShape,
		type: z.literal('input'),
		inputType: z.enum(VARIABLE_INPUT_TYPES),
		required: z.boolean().optional(),
		default: z.unknown().optional(),
		options: z.array(z.string()).optional(),
	})
	.superRefine((definition, context) => {
		let usesOptions = inputTypeUsesOptions(definition.inputType);
		if (usesOptions && (!definition.options || definition.options.length === 0)) {
			context.addIssue({ code: 'custom', path: ['options'], message: 'requires-options' });
		}
		if (!usesOptions && definition.options !== undefined) {
			context.addIssue({ code: 'custom', path: ['options'], message: 'options-not-allowed' });
		}
	});

const SpecialVariableSchema = z.strictObject({
	...BaseVariableShape,
	type: z.literal('special'),
	source: z.string().min(1),
});

const FormulaVariableSchema = z.strictObject({
	...BaseVariableShape,
	type: z.literal('formula'),
	formula: z.string().trim().min(1),
});

export const VariableDefinitionSchema = z.discriminatedUnion('type', [
	InputVariableSchema,
	SpecialVariableSchema,
	FormulaVariableSchema,
]) satisfies z.ZodType<VariableDefinition>;

const TemplateIdentitySchema = z.looseObject({
	id: z.string().optional(),
	name: z.string().optional(),
	description: z.string().optional(),
	tags: z.array(z.string()).optional(),
});

const OutputFolderSchema = z.looseObject({
	mode: z.string().optional(),
	path: z.string().optional(),
});

const NoteOutputSchema = z.looseObject({
	folder: OutputFolderSchema.optional(),
	filename: z.string().optional(),
	conflict: z.string().optional(),
	openAfterCreate: z.boolean().optional(),
});

export const TemplateMetadataSchema = z.looseObject({
	template: TemplateIdentitySchema,
	variables: z.record(z.string(), VariableDefinitionSchema).optional(),
	output: NoteOutputSchema.optional(),
});
