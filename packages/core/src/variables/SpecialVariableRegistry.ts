import type { FormulaRuntime } from 'packages/core/src/formulas/FormulaEvaluator';
import type { ExecutionContext } from 'packages/core/src/domain/Types';

export interface SpecialVariableDefinition<Metadata = undefined> {
	label: string;
	metadata?: Metadata;
	resolve(context: ExecutionContext, runtime?: FormulaRuntime): unknown;
}

/** Host-populated registry of context-backed template variables. */
export class SpecialVariableRegistry<Metadata = undefined> {
	private readonly definitions = new Map<string, SpecialVariableDefinition<Metadata>>();

	register(source: string, definition: SpecialVariableDefinition<Metadata>): this {
		if (this.definitions.has(source)) throw new Error(`Special variable source "${source}" is already registered.`);
		this.definitions.set(source, definition);
		return this;
	}

	has(source: string): boolean {
		return this.definitions.has(source);
	}

	get(source: string): SpecialVariableDefinition<Metadata> | undefined {
		return this.definitions.get(source);
	}

	entries(): IterableIterator<[string, SpecialVariableDefinition<Metadata>]> {
		return this.definitions.entries();
	}

	[Symbol.iterator](): IterableIterator<[string, SpecialVariableDefinition<Metadata>]> {
		return this.entries();
	}

	resolve(source: string, context: ExecutionContext, runtime?: FormulaRuntime): unknown {
		let definition = this.definitions.get(source);
		if (!definition) throw new Error(`Special variable source "${source}" is not registered.`);
		return definition.resolve(context, runtime);
	}
}
