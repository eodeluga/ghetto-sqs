import eslint from '@eslint/js'
import type { Linter } from 'eslint'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

const config: Linter.Config[] = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
        typescript: {
          project: ['./tsconfig.json'],
        },
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-loop-func': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowAny: true,
        allowBoolean: false,
        allowNullish: false,
        allowNumber: true,
        allowRegExp: false,
      }],
      '@typescript-eslint/strict-boolean-expressions': 'off',
      'array-bracket-spacing': ['error', 'never'],
      'comma-dangle': ['error', {
        arrays: 'always-multiline',
        exports: 'always-multiline',
        functions: 'never',
        imports: 'always-multiline',
        objects: 'always-multiline',
      }],
      'eol-last': ['error', 'always'],
      'id-length': ['error', {
        exceptions: ['_'],
        min: 2,
      }],
      'max-len': ['error', { code: 130 }],
      'no-loop-func': 'off',
      'no-param-reassign': 'off',
      'no-restricted-syntax': [
        'error',
        {
          message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
          selector: 'LabeledStatement',
        },
        {
          message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimise.',
          selector: 'WithStatement',
        },
      ],
      'object-curly-newline': ['error', { consistent: true, multiline: true }],
      'object-curly-spacing': ['warn', 'always'],
      'operator-linebreak': ['error', 'before'],
      'prefer-const': ['error', {
        destructuring: 'any',
        ignoreReadBeforeAssign: false,
      }],
      'prefer-destructuring': ['error', {
        array: false,
        object: false,
      }, {
        enforceForRenamedProperties: false,
      }],
      'quotes': ['error', 'single', {
        allowTemplateLiterals: true,
        avoidEscape: true,
      }],
      'semi': ['error', 'never'],
      'space-before-function-paren': ['error', {
        anonymous: 'never',
        asyncArrow: 'always',
        named: 'never',
      }],
    },
  },
]

export default config
