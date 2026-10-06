import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-dupe-class-members': 'error',
      'no-unreachable': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    files: ['scripts/**', 'test/**', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // the codec falls back to Node's Buffer when there is no btoa/atob
    files: ['src/world/codec.js'],
    languageOptions: { globals: { Buffer: 'readonly' } },
  },
];
