import shared from '@lemons_dev/eslint-config-obsidian/prettier';
export default { ...shared, ...{ printWidth: 140, useTabs: true, semi: true, singleQuote: true, arrowParens: 'avoid' } };
