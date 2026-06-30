import { FormulaError } from 'packages/core/src/domain/Errors';
import type { ResolvedVariables } from 'packages/core/src/domain/Types';

/** A successfully parsed formula expression. */
export interface FormulaCall {
	name: string;
	args: FormulaArgument[];
}

/** A formula argument is either a quoted literal or a variable reference. */
export type FormulaArgument = { type: 'literal'; value: string } | { type: 'reference'; path: string };

/** Host-provided utilities that formulas can call at render time. */
export interface FormulaRuntime {
	now(): Date;
	uuid(): string;
}

const DEFAULT_RUNTIME: FormulaRuntime = {
	now(): Date {
		return new Date();
	},
	uuid(): string {
		return crypto.randomUUID();
	},
};

const FORMULA_ARITY: Record<string, number> = {
	today: 0,
	now: 0,
	uuid: 0,
	slug: 1,
	lower: 1,
	upper: 1,
	trim: 1,
	replace: 3,
};

/** Parses and evaluates the deliberately small, safe template formula language. */
export class FormulaEvaluator {
	constructor(private readonly runtime: FormulaRuntime = DEFAULT_RUNTIME) {}

	static formatLocalDate(date: Date): string {
		let year = date.getFullYear().toString().padStart(4, '0');
		let month = (date.getMonth() + 1).toString().padStart(2, '0');
		let day = date.getDate().toString().padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	parse(source: string): FormulaCall {
		let match = /^([a-z]+)\s*\(([\s\S]*)\)$/.exec(source.trim());
		if (!match) throw new FormulaError(`Invalid formula syntax: ${source}`);

		let name = match[1] ?? '';
		let args = this.splitArguments(match[2] ?? '').map((argument): FormulaArgument => {
			if (/^(['"])([\s\S]*)\1$/.test(argument)) {
				let quote = argument[0] ?? '"';
				let inner = argument.slice(1, -1);
				return { type: 'literal', value: inner.replaceAll(`\\${quote}`, quote).replaceAll('\\\\', '\\') };
			}
			if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(argument)) return { type: 'reference', path: argument };
			throw new FormulaError(`Invalid formula argument: ${argument}`);
		});

		let expected = FORMULA_ARITY[name];
		if (expected === undefined) throw new FormulaError(`Unknown formula: ${name}()`);
		if (args.length !== expected) throw new FormulaError(`${name}() expects ${expected} argument${expected === 1 ? '' : 's'}.`);
		return { name, args };
	}

	dependencies(source: string): string[] {
		return this.parse(source)
			.args.filter(argument => argument.type === 'reference')
			.map(argument => argument.path.split('.')[0] ?? '');
	}

	evaluate(source: string, values: ResolvedVariables): unknown {
		let formula = this.parse(source);
		let args = formula.args.map(argument => (argument.type === 'literal' ? argument.value : this.lookup(values, argument.path)));

		switch (formula.name) {
			case 'today':
				return FormulaEvaluator.formatLocalDate(this.runtime.now());
			case 'now':
				return this.runtime.now().toISOString();
			case 'uuid':
				return this.runtime.uuid();
			case 'slug':
				return this.scalar(args[0])
					.normalize('NFKD')
					.replace(/[\u0300-\u036f]/g, '')
					.toLowerCase()
					.trim()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-+|-+$/g, '');
			case 'lower':
				return this.scalar(args[0]).toLowerCase();
			case 'upper':
				return this.scalar(args[0]).toUpperCase();
			case 'trim':
				return this.scalar(args[0]).trim();
			case 'replace':
				return this.scalar(args[0]).replaceAll(this.scalar(args[1]), this.scalar(args[2]));
			default:
				throw new FormulaError(`Unknown formula: ${formula.name}()`);
		}
	}

	private splitArguments(source: string): string[] {
		let args: string[] = [];
		let current = '';
		let quote: string | null = null;
		for (let index = 0; index < source.length; index += 1) {
			let character = source[index] ?? '';
			if (quote) {
				if (character === '\\') {
					current += character + (source[index + 1] ?? '');
					index += 1;
				} else if (character === quote) {
					quote = null;
					current += character;
				} else current += character;
			} else if (character === '"' || character === "'") {
				quote = character;
				current += character;
			} else if (character === ',') {
				args.push(current.trim());
				current = '';
			} else current += character;
		}
		if (quote) throw new FormulaError('Unterminated string in formula.');
		if (current.trim() || source.trim()) args.push(current.trim());
		return args;
	}

	private lookup(values: ResolvedVariables, path: string): unknown {
		let cursor: unknown = values;
		for (let part of path.split('.')) {
			if (cursor === null || typeof cursor !== 'object') return undefined;
			cursor = (cursor as Record<string, unknown>)[part];
		}
		return cursor;
	}

	private scalar(value: unknown): string {
		if (value === null || value === undefined) return '';
		if (typeof value === 'object') return JSON.stringify(value);
		if (typeof value === 'string') return value;
		if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString();
		throw new FormulaError('Formula arguments must be scalar values.');
	}
}
