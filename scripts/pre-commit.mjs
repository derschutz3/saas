#!/usr/bin/env node
/**
 * Pre-commit Hook - ERP Universal
 * Executa validações antes de cada commit
 */

import { execSync } from 'child_process';
import { exit } from 'process';

const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function log(message, color = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function run(command) {
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  log('\n🔍 Executando pré-commit hooks...\n', YELLOW);

  log('📝 Verificando TypeScript...');
  if (!run('npx tsc --noEmit')) {
    log('❌ TypeScript falhou. Corrija os erros antes de commitar.\n', RED);
    exit(1);
  }
  log('✅ TypeScript OK\n', GREEN);

  log('🔍 Executando ESLint...');
  if (!run('npm run lint')) {
    log('❌ ESLint falhou. Corrija os problemas antes de commitar.\n', RED);
    exit(1);
  }
  log('✅ ESLint OK\n', GREEN);

  log('📱 Validando Next.js Frontend...');
  process.chdir('apps/erp-web');
  if (!run('npx tsc --noEmit')) {
    log('❌ TypeScript do Next.js falhou.\n', RED);
    exit(1);
  }
  log('✅ Next.js TypeScript OK\n', GREEN);

  process.chdir('../..');

  log('✅ Todas as validações passaram!\n', GREEN);
  log('Pronto para commitar! 🚀\n', GREEN);
}

main().catch(error => {
  log(`\n❌ Erro fatal: ${error.message}`, RED);
  exit(1);
});
