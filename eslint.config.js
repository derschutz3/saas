import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'migrations/**',
      'scripts/maintenance/**', // scripts Node.js sem TypeScript
      // apps/erp-web é um app Next.js legado/paralelo com toolchain própria
      // (package.json + next.config). Não faz parte do build Vite (src/) nem
      // do tsconfig deste projeto, então não é lintado por este config.
      'apps/**',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Rebaixados de error → warn: o backend Express usa `any` em pontos de
      // tipagem de middleware/handlers onde tipar corretamente exigiria um
      // refactor amplo e arriscado. Mantemos como warning para continuar
      // visível no relatório do lint sem bloquear o CI por dívida pré-existente.
      '@typescript-eslint/no-explicit-any': 'warn',
      // postgresStore e os adapters de integração usam @ts-nocheck de forma
      // deliberada (SQL dinâmico / payloads externos sem tipos). Permitimos
      // ts-nocheck mas mantemos as demais diretivas ts-* sob controle.
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
