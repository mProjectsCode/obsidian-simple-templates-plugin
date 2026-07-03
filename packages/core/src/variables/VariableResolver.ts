import { FormulaError, MissingRequiredVariableError, VariableResolutionError } from 'packages/core/src/domain/Errors';
import type { ExecutionContext, ResolvedVariables, VariableDefinition } from 'packages/core/src/domain/Types';
import type { ExpressionEvaluator } from 'packages/core/src/expressions/ExpressionEvaluator';
import type { SpecialVariableRegistry } from 'packages/core/src/variables/SpecialVariableRegistry';
import { InputValueService } from 'packages/core/src/variables/InputValueService';

/**
 * Resolves template variables through special sources, user input, Safe JS expressions,
 * defaults, type coercion, and required-value checks.
 */
export class VariableResolver {
	private readonly inputValues = new InputValueService();
	constructor(
		private readonly specialVariables: SpecialVariableRegistry<unknown>,
		private readonly expressions: ExpressionEvaluator,
	) {}

	static needingInput(definitions: Record<string, VariableDefinition>): string[] {
		return Object.entries(definitions)
			.filter(([, definition]) => definition.type === 'input')
			.map(([name]) => name);
	}

	async resolve(
		definitions: Record<string, VariableDefinition>,
		context: ExecutionContext,
		userValues: ResolvedVariables,
		sourcePath?: string,
	): Promise<ResolvedVariables> {
		let values: ResolvedVariables = {};

		// ---- 1. Populate from special sources ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type === 'special') values[name] = this.specialVariables.resolve(definition.source, context);
		}

		// ---- 2. Apply user-provided input values ----
		for (let [name, value] of Object.entries(userValues)) {
			let definition = definitions[name];
			if (!definition) throw new VariableResolutionError(`Unknown variable "${name}".`);
			if (definition.type !== 'input') throw new VariableResolutionError(`Variable "${name}" does not accept user input.`);
			values[name] = value;
		}

		// ---- 3. Inputs without a user value are undefined ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type === 'input' && !(name in values)) values[name] = undefined;
		}

		// ---- 4. Apply defaults so expressions can consume them ----
		for (let [name, definition] of Object.entries(definitions))
			if (definition.type === 'input' && values[name] === undefined && definition.default !== undefined)
				values[name] = structuredClone(definition.default);

		// ---- 5. Coerce and check inputs before expressions consume them ----
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type === 'input') values[name] = this.inputValues.coerce(name, definition, values[name]);
			if (definition.type === 'input' && definition.required && this.inputValues.isEmpty(values[name])) {
				throw new MissingRequiredVariableError(`Required variable "${name}" has no value.`);
			}
		}

		// ---- 6. Resolve Safe JS expressions in declaration order ----
		await this.resolveFormulas(definitions, values, sourcePath);

		return values;
	}

	private async resolveFormulas(
		definitions: Record<string, VariableDefinition>,
		values: ResolvedVariables,
		sourcePath?: string,
	): Promise<void> {
		for (let [name, definition] of Object.entries(definitions)) {
			if (definition.type !== 'formula') continue;
			try {
				let directDependency = definitions[definition.formula];
				if (directDependency?.type === 'formula' && !Object.hasOwn(values, definition.formula))
					throw new Error(`Formula "${definition.formula}" has not been evaluated yet.`);
				values[name] = await this.expressions.evaluateTemplateExpression(definition.formula, values, sourcePath);
			} catch (error) {
				throw new FormulaError(
					`Expression for "${name}" failed: ${error instanceof Error ? error.message : String(error)} ` +
						'Formula variables can only use variables declared above them.',
				);
			}
		}
	}
}
