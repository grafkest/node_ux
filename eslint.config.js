import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'node_modules']
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021
      }
    }
  },
  {
    files: ['server.cjs'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    }
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules
    }
  },
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules
    }
  },
  {
    rules: {
      'react/react-in-jsx-scope': 'off'
    }
  }
];
