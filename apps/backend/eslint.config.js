import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
      console: 'readonly',
      process: 'readonly',
      Buffer: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      setInterval: 'readonly',
      clearInterval: 'readonly',
      __dirname: 'readonly',
      __filename: 'readonly',
      module: 'readonly',
      exports: 'readonly',
      require: 'readonly',
    },
  },
  rules: {
    // Reglas recomendadas para un proyecto Express con TypeScript
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
  ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
});
