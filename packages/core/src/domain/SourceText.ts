/** Offsets and content for one source line, including its optional line break. */
export interface SourceLine {
	start: number;
	contentEnd: number;
	end: number;
	text: string;
}

export function readSourceLine(source: string, start: number): SourceLine {
	let contentEnd = start;
	while (contentEnd < source.length && source[contentEnd] !== '\r' && source[contentEnd] !== '\n') {
		contentEnd += 1;
	}

	let end = contentEnd;
	if (source[end] === '\r') end += 1;
	if (source[end] === '\n') end += 1;

	return { start, contentEnd, end, text: source.slice(start, contentEnd) };
}

export function readSourceLines(source: string): SourceLine[] {
	let lines: SourceLine[] = [];
	let start = 0;
	while (start < source.length) {
		let line = readSourceLine(source, start);
		lines.push(line);
		start = line.end;
	}

	return lines;
}

export function withoutTrailingLineBreak(value: string): string {
	if (value.endsWith('\r\n')) return value.slice(0, -2);
	if (value.endsWith('\r') || value.endsWith('\n')) return value.slice(0, -1);

	return value;
}

export function splitAndTrim(value: string, separator: string | RegExp): string[] {
	return value
		.split(separator)
		.map(item => item.trim())
		.filter(item => item.length > 0);
}
