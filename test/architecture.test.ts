import { describe, expect, test } from 'bun:test';

describe('core architecture', () => {
	test('keeps the templating engine independent of Obsidian', async () => {
		let glob = new Bun.Glob('packages/core/src/**/*.ts');
		for await (let path of glob.scan('.')) {
			let source = await Bun.file(path).text();
			expect(source, path).not.toMatch(/from\s+['"]obsidian['"]/);
		}
	});
});
