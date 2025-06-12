//-- NPM Packages
import eslint from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['*.js', '*.cjs', '*.mjs']
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            globals: {
                Deno: 'readonly',
                ...globals.es2022
            },
            parserOptions: {
                projectService: true
            }
        }
    },
    {
        files: ['**/test/*.ts', '**/test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unused-expressions': 'off'
        }
    },
    prettierConfig
);
