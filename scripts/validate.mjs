#!/usr/bin/env node
/**
 * Script de Validação - ERP Universal
 * Executa todas as validações antes de commit ou deploy
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, cwd = process.cwd()) {
  try {
    log(`\n▶ Executando: ${command}`, 'blue');
    execSync(command, { cwd, stdio: 'inherit' });
    return true;
  } catch (error) {
    log(`✗ Comando falhou: ${command}`, 'red');
    return false;
  }
}

function checkFile(filePath, description) {
  const exists = existsSync(filePath);
  if (exists) {
    log(`✓ ${description} encontrado`, 'green');
  } else {
    log(`✗ ${description} NÃO encontrado`, 'red');
  }
  return exists;
}

async function main() {
  log('\n═══════════════════════════════════════════', 'bright');
  log('  ERP UNIVERSAL - SCRIPT DE VALIDAÇÃO', 'bright');
  log('═══════════════════════════════════════════\n', 'bright');

  let allPassed = true;
  const results = [];

  // 1. Verificar estrutura do projeto
  log('📁 Verificando estrutura do projeto...', 'blue');
  results.push(['Estrutura base', checkFile('package.json', 'package.json')]);
  results.push(['Config TypeScript', checkFile('tsconfig.json', 'tsconfig.json')]);
  results.push(['Config ESLint', checkFile('eslint.config.js', 'eslint.config.js')]);
  results.push(['Regras do Projeto', checkFile('.trae/rules/project_rules.md', 'project_rules.md')]);

  // 2. Validar TypeScript (projeto raiz - Vite)
  log('\n📝 Validando TypeScript (projeto Vite)...', 'blue');
  if (!runCommand('npx tsc --noEmit --project tsconfig.json')) {
    log('⚠ TypeScript encontrou erros!', 'yellow');
    allPassed = false;
  }

  // 3. Validar ESLint (projeto raiz)
  log('\n🔍 Executando ESLint (projeto raiz)...', 'blue');
  if (!runCommand('npm run lint')) {
    log('⚠ ESLint encontrou problemas!', 'yellow');
    allPassed = false;
  }

  // 4. Validar Frontend Next.js
  const nextJsPath = 'apps/erp-web';
  if (existsSync(nextJsPath)) {
    log('\n📱 Validando Frontend Next.js...', 'blue');
    
    if (!runCommand('npx tsc --noEmit', nextJsPath)) {
      log('⚠ TypeScript do Next.js encontrou erros!', 'yellow');
      allPassed = false;
    }

    if (!runCommand('npx next lint', nextJsPath)) {
      log('⚠ Next.js lint encontrou problemas!', 'yellow');
      allPassed = false;
    }
  }

  // 5. Validar Backend API
  const apiPath = 'api';
  if (existsSync(apiPath)) {
    log('\n⚙ Validando Backend API...', 'blue');
    
    // Verificar arquivos críticos
    checkFile(`${apiPath}/app.ts`, 'Backend app.ts');
    checkFile(`${apiPath}/routes/modules.ts`, 'API de módulos');
    checkFile(`${apiPath}/infra/store.ts`, 'Store do backend');
  }

  // Resumo
  log('\n═══════════════════════════════════════════', 'bright');
  log('  RESUMO DA VALIDAÇÃO', 'bright');
  log('═══════════════════════════════════════════', 'bright');

  results.forEach(([name, passed]) => {
    log(`${passed ? '✓' : '✗'} ${name}`, passed ? 'green' : 'red');
  });

  log('\n' + (allPassed ? '✅ TODAS AS VALIDAÇÕES PASSARAM!' : '❌ ALGUMAS VALIDAÇÕES FALHARAM!'), allPassed ? 'green' : 'red');
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  log(`\n❌ Erro fatal: ${error.message}`, 'red');
  process.exit(1);
});
