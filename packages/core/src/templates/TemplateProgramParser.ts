import { P, P_HELPERS, P_UTILS } from '@lemons_dev/parsinom';
import type { Parser, ParsingRange } from '@lemons_dev/parsinom';
import { TemplateParseError } from 'packages/core/src/domain/Errors';
import type {
	ExpressionNode,
	ForNode,
	IfBranch,
	IfNode,
	TemplateNode,
	TemplateProgram,
	TextNode,
} from 'packages/core/src/domain/TemplateAst';

interface OpenExpression {
	expression: string;
	range: ParsingRange;
}

interface OpenFor extends OpenExpression {
	variable: string;
}

interface TemplateGrammar {
	program: TemplateNode[];
	nodes: TemplateNode[];
	node: TemplateNode;
	ifNode: IfNode;
	forNode: ForNode;
	expressionNode: ExpressionNode;
	textNode: TextNode;
}

const OPTIONAL_WHITESPACE = P_UTILS.optionalWhitespace();
const IDENTIFIER_START = P.or(P_UTILS.letter(), P.oneOf('_$'));
const IDENTIFIER_PART = P.or(IDENTIFIER_START, P_UTILS.digit());
const IDENTIFIER = P.sequenceMap((first, rest) => first + rest.join(''), IDENTIFIER_START, IDENTIFIER_PART.many()).describe(
	'an identifier',
);
const SIMPLE_PATH = P.sequenceMap(
	(root, _properties) => root,
	IDENTIFIER,
	P.or(P.string('?.'), P.string('.')).then(IDENTIFIER).many(),
).thenEof();
const ESCAPED_BRACE = P.or(P.string('\\{').result('{'), P.string('\\}').result('}'));
const ORDINARY_BACKSLASH = P.string('\\').notFollowedBy(P.oneOf('{}'));
const EXPRESSION_CHARACTER = P.or(ESCAPED_BRACE, ORDINARY_BACKSLASH, P.noneOf('{}\\'));
const TEXT_CHARACTER = P_HELPERS.notFollowedBy(P.string('{{')).then(P_UTILS.any());

/**
 * Parses a Safe JS expression up to a tag's closing braces.
 *
 * Braces belonging to JavaScript must be written as `\{` and `\}`. The
 * escapes are removed before the expression is sent to Safe JS.
 */
function expression(): Parser<string> {
	return EXPRESSION_CHARACTER.many()
		.map(characters => characters.join('').trim())
		.chain(value => {
			if (value) {
				return P.succeed(value);
			}
			return P.fail('a non-empty Safe JS expression');
		});
}

function tagEnd(): Parser<string> {
	return P.string('}}');
}

function ifOpening(): Parser<OpenExpression> {
	return P.string('{{')
		.then(OPTIONAL_WHITESPACE)
		.then(P.string('#if'))
		.skip(P_UTILS.whitespace())
		.then(expression())
		.skip(tagEnd())
		.node((value, range) => ({ expression: value, range }));
}

function elseIfOpening(): Parser<OpenExpression> {
	return P.string('else')
		.skip(P_UTILS.whitespace())
		.skip(P.string('if'))
		.skip(P_UTILS.whitespace())
		.then(expression())
		.wrap(P.string('{{').then(OPTIONAL_WHITESPACE), tagEnd())
		.node((value, range) => ({ expression: value, range }));
}

function forOpening(): Parser<OpenFor> {
	return P.sequenceMap(
		(variable, value) => ({ variable, expression: value }),
		IDENTIFIER,
		P_UTILS.whitespace().then(P.string('in')).then(P_UTILS.whitespace()).then(expression()),
	)
		.wrap(P.string('{{').then(OPTIONAL_WHITESPACE).then(P.string('#for')).then(P_UTILS.whitespace()), tagEnd())
		.node((value, range) => ({ ...value, range }));
}

function keywordTag(keyword: string): Parser<ParsingRange> {
	return P.string(keyword)
		.wrap(P.string('{{').then(OPTIONAL_WHITESPACE), OPTIONAL_WHITESPACE.then(tagEnd()))
		.node((_value, range) => range);
}

const ELSE_TAG = keywordTag('else');
const EMPTY_TAG = keywordTag('empty');
const END_IF_TAG = keywordTag('/if');
const END_FOR_TAG = keywordTag('/for');
const RESERVED_TAG = OPTIONAL_WHITESPACE.then(
	P.or(
		P.oneOf('#/'),
		P.string('else').skip(P.or(P_UTILS.whitespace(), tagEnd())),
		P.string('empty').skip(OPTIONAL_WHITESPACE).skip(tagEnd()),
	),
);

const LANGUAGE = P.createLanguage<TemplateGrammar>({
	program: (_language, ref) => ref.nodes.thenEof(),
	nodes: (_language, ref) => ref.node.many(),
	node: (_language, ref) => P.or(ref.ifNode, ref.forNode, ref.expressionNode, ref.textNode),
	ifNode: (_language, ref) =>
		P.sequenceMap(
			(open, children, additionalBranches, elseChildren, close) => ({
				type: 'if' as const,
				branches: [
					{ expression: open.expression, children },
					...additionalBranches.map(([branch, branchChildren]): IfBranch => ({
						expression: branch.expression,
						children: branchChildren,
					})),
				],
				elseChildren,
				start: open.range.from,
				end: close.to,
			}),
			ifOpening(),
			ref.nodes,
			P.sequence(elseIfOpening(), ref.nodes).many(),
			ELSE_TAG.then(ref.nodes).optional([]),
			END_IF_TAG,
		),
	forNode: (_language, ref) =>
		P.sequenceMap(
			(open, children, emptyChildren, close) => ({
				type: 'for' as const,
				variable: open.variable,
				expression: open.expression,
				children,
				emptyChildren,
				start: open.range.from,
				end: close.to,
			}),
			forOpening(),
			ref.nodes,
			P.or(ELSE_TAG, EMPTY_TAG).then(ref.nodes).optional([]),
			END_FOR_TAG,
		),
	expressionNode: () =>
		P.string('{{')
			.notFollowedBy(RESERVED_TAG)
			.then(OPTIONAL_WHITESPACE)
			.then(expression())
			.skip(tagEnd())
			.node((value, range) => ({ type: 'expression', expression: value, start: range.from, end: range.to })),
	textNode: () =>
		TEXT_CHARACTER.atLeast(1)
			.map(characters => characters.join(''))
			.node((value, range) => ({ type: 'text', value, start: range.from, end: range.to })),
});

/** Compiles source strings into reusable template programs using parsiNOM. */
export class TemplateProgramParser {
	parse(source: string): TemplateProgram {
		let result = LANGUAGE.program.tryParse(source);
		if (!result.success) {
			let expected = result.expected.join(', ');
			if (result.expected.length === 1) {
				expected = result.expected[0];
			}

			throw new TemplateParseError(`Invalid template syntax at offset ${result.furthest}; expected ${expected}.`);
		}

		let references = new Set<string>();
		this.collectReferences(result.value, new Set(), references);

		return { type: 'program', nodes: result.value, references: [...references] };
	}

	private collectReferences(nodes: readonly TemplateNode[], locals: ReadonlySet<string>, references: Set<string>): void {
		for (let node of nodes) {
			if (node.type === 'text') {
				continue;
			}

			if (node.type === 'if') {
				for (let branch of node.branches) {
					this.collectSimpleReference(branch.expression, locals, references);
					this.collectReferences(branch.children, locals, references);
				}
				this.collectReferences(node.elseChildren, locals, references);
				continue;
			}

			if (node.type === 'for') {
				this.collectSimpleReference(node.expression, locals, references);

				let loopLocals = new Set(locals).add(node.variable);
				this.collectReferences(node.children, loopLocals, references);
				this.collectReferences(node.emptyChildren, locals, references);
				continue;
			}

			this.collectSimpleReference(node.expression, locals, references);
		}
	}

	private collectSimpleReference(expressionSource: string, locals: ReadonlySet<string>, references: Set<string>): void {
		let result = SIMPLE_PATH.tryParse(expressionSource);
		if (result.success && !locals.has(result.value)) {
			references.add(result.value);
		}
	}
}
