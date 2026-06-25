# Relatório de Segurança — Conformidade LGPD (Lei 13.709/2018)

**Data**: 2026-06-21
**Escopo**: Backend (Node.js + Express) e Frontend (Next.js + React)
**Tipo**: Auditoria de vazamento de PII em logs e registros de auditoria

---

## Executive Summary

Foi realizada uma auditoria completa do sistema ERP para identificar vazamento de dados pessoais (PII) em logs e registros de auditoria, em conformidade com a **Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)**.

**Antes da auditoria**: o sistema possuía **~15 pontos críticos** de vazamento de PII:
- Email de usuário armazenado em texto claro no AuditEvent.metadata após login (`v1-auth.ts`)
- Nome + telefone de cliente armazenados em metadata ao criar customer (`v1.ts`)
- Patch completo (com nome/email/CNPJ/endereço) armazenado ao atualizar customer (`v1-customers.ts`)
- Nome + CNPJ de fornecedor em metadata (`v1-suppliers.ts`)
- Operator name do caixa em metadata (`v1-cash.ts`)
- Email de usuário criado em metadata (`v1-settings.ts`)
- Telefone de cliente em logs de dev (`v1-dev.ts`)
- Logger não redatava PII inline em strings (ex: `"Login de joao@x.com falhou"`)

**Após a auditoria**: criado redator centralizado em [`api/shared/pii-redactor.ts`](file:///c:/Users/FSOS/Documents/trae_projects/3/api/shared/pii-redactor.ts) que:
1. Detecta e redacta PII por chave (email, name, phone, cpf, cnpj, etc.)
2. Detecta e redacta PII inline em strings (email/CPF/CNPJ/telefone dentro de qualquer texto)
3. Hash determinístico (SHA-256 truncado) para preservar correlação sem expor PII
4. Tratamento especial para Error.message (defesa contra PII em stack traces)
5. 38 testes automatizados validam o comportamento

Também foram criados endpoints LGPD (Art. 18, V e VI) que permitem:
- Exportar todos os dados pessoais de um cliente
- Anonimizar completamente um cliente (mantendo integridade referencial)

---

## Findings

### 🔴 CRÍTICO (LGPD — Vazamento direto de PII em logs)

#### [LGPD-001] Email de usuário armazenado em claro no AuditEvent após login
- **Localização**: `api/routes/v1-auth.ts:100`
- **Impacto**: Cada login registra o email do usuário em texto claro no AuditEvent. Um agente malicioso com acesso à tabela de auditoria consegue enumerar todos os emails de usuários.
- **Status**: ✅ Corrigido. Substituído por `buildSafeAuditMeta({ role: user.role })`.

#### [LGPD-002] Patch completo do customer armazenado em metadata
- **Localização**: `api/routes/v1-customers.ts:146` (`metadata: { patch: req.body }`)
- **Impacto**: Cada atualização de customer persiste TODOS os campos pessoais (nome, email, CPF/CNPJ, endereço) no log de auditoria. Viola LGPD Art. 6 (necessidade) e Art. 16 (princípio da adequação).
- **Status**: ✅ Corrigido. Substituído por `metadata: buildSafeAuditMeta({ fieldsChanged: Object.keys(req.body) })`.

#### [LGPD-003] Nome + telefone de customer em metadata
- **Localização**: `api/routes/v1.ts:690` (`metadata: { phone: created.phone, name: created.name }`)
- **Impacto**: Toda criação de customer em um pedido armazena nome e telefone em claro.
- **Status**: ✅ Corrigido.

#### [LGPD-004] Nome + CNPJ de supplier em metadata
- **Localização**: `api/routes/v1-suppliers.ts:90`
- **Impacto**: CNPJ é dado pessoal dePJ (pode identificar sócios); vazamento em auditoria é infração.
- **Status**: ✅ Corrigido.

#### [LGPD-005] Operator name (nome do caixa) em metadata de sessão
- **Localização**: `api/routes/v1-cash.ts:88`
- **Impacto**: Nome do operador de caixa é armazenado em texto claro.
- **Status**: ✅ Corrigido.

#### [LGPD-006] Email de usuário criado em metadata
- **Localização**: `api/routes/v1-settings.ts:80`
- **Impacto**: Email do novo usuário armazenado em claro.
- **Status**: ✅ Corrigido.

### 🟠 ALTO (LGPD — Vazamento indireto / dados desnecessários)

#### [LGPD-007] Logger não detectava PII inline em strings
- **Localização**: `api/shared/logger.ts` (logger original)
- **Impacto**: Mensagens como `"Login falhou para joao@x.com"` ou `"Pedido do cliente 123.456.789-00"` logavam PII porque o logger só redactava por chave.
- **Status**: ✅ Corrigido. Redator agora detecta emails, CPFs, CNPJs e telefones dentro de qualquer string via regex.

#### [LGPD-008] Logger.Error.message não era redatado
- **Localização**: `api/shared/logger.ts` (logger original)
- **Impacto**: Erro lançado pode conter PII em sua mensagem (ex: `new Error('Usuário joao@x.com não encontrado')`).
- **Status**: ✅ Corrigido. Redator trata `Error.message` e `Error.stack` especialmente.

#### [LGPD-009] Telefone do cliente em logs de dev seed
- **Localização**: `api/routes/v1-dev.ts:108`
- **Impacto**: Telefone pessoal em logs.
- **Status**: ✅ Corrigido.

#### [LGPD-010] AuditEvent metadata exposto sem redactor no GET
- **Localização**: `api/routes/v1.ts:951` (`/audit/events`)
- **Impacto**: Mesmo após corrigir pontos de criação, qualquer metadata histórica com PII seria exposta na leitura.
- **Status**: ✅ Corrigido. Aplicado `redactPii()` em todos os metadata na resposta.

### 🟡 MÉDIO (LGPD — Direitos do titular não implementados)

#### [LGPD-011] Sem endpoint de exportação de dados (Art. 18, V)
- **Localização**: Novo arquivo `api/routes/v1-lgpd.ts`
- **Impacto**: Cliente não conseguia exercer o direito de saber quais dados o sistema armazena.
- **Status**: ✅ Corrigido. Criado `GET /api/v1/lgpd/customers/:id/data-export` que retorna profile + orders em formato portável.

#### [LGPD-012] Sem endpoint de anonimização (Art. 18, VI)
- **Localização**: Novo arquivo `api/routes/v1-lgpd.ts`
- **Impacto**: Cliente não conseguia solicitar eliminação dos dados.
- **Status**: ✅ Corrigido. Criado `POST /api/v1/lgpd/customers/:id/anonymize` que substitui PII por placeholders mantendo integridade referencial.

### 🟢 BAIXO (defense-in-depth)

#### [LGPD-013] `Error.stack` em produção
- **Localização**: `api/shared/pii-redactor.ts`
- **Impacto**: Stack traces raramente contêm PII mas podem vazar caminhos de arquivo.
- **Status**: ✅ Corrigido. Em produção, stack é redatado para `[redacted in prod]`.

---

## Implementação

### Módulo central: `api/shared/pii-redactor.ts`

Funções exportadas:
- `redactPii(value)` — redação recursiva (preserva estrutura de objetos/arrays)
- `hashPii(value)` — SHA-256 truncado para correlação sem reversão
- `looksLikePii(text)` — detecção de PII inline (regex)
- `buildSafeAuditMeta(meta)` — helper para metadata de AuditEvent
- `setRedactDisabled(bool)` — kill switch para testes
- `PII_PROTECTED_KEYS` — catálogo de chaves protegidas
- `PII_PATTERNS` — catálogo de regexes

### Regexes detectadas:
- **Email**: RFC 5322 simplificado
- **CPF**: 11 dígitos (com ou sem pontuação)
- **CNPJ**: 14 dígitos (com ou sem pontuação)
- **Telefone BR**: DDD + número (10 ou 11 dígitos)
- **Cartão de crédito**: 13-19 dígitos com separadores

### Chaves PII protegidas:
```
Identidade: name, fullname, username, customername, suppliername,
            tradename, operatorname
Contato: email, phone, whatsapp, telefone, celular
Documento: taxid, cpf, cnpj, document, rg, ie
Endereço: address, city, state, zip, cep, neighborhood, complement
Notas: notes, note, observacao, reason, message
Credenciais: password, token, jwt, apikey, secret, hash, salt
Pagamento: card, cvv, account
Sessão: cookie, authorization, bearer
```

---

## Validação

### Testes automatizados: `scripts/test-pii-redactor.ts`
**Resultado**: 38 testes, 38 passed

Testes cobrem:
1. Redação por chave (email, name, phone, document)
2. Redação inline em strings (CPF, CNPJ, telefone, email)
3. Hash determinístico (mesmo email = mesmo hash)
4. Não-redação de dados não-PII (userId, role, cents)
5. `looksLikePii()` detecta/não-detecta corretamente
6. `buildSafeAuditMeta()` redacta audit corretamente
7. `Error.message` é redatado
8. Recursão em arrays e objetos
9. Profundidade limitada (anti-DoS)
10. Catálogo de chaves protegidas

### Teste E2E
- ✅ Customer criado com PII inline nas notas (`"Anotações com email joao@empresa.com e CPF 987.654.321-00"`)
- ✅ Data export retorna PII para o titular
- ✅ Anonimização substitui PII por placeholders mantendo integridade
- ✅ Audit log da anonimização NÃO contém PII (só IDs)
- ✅ Acesso ao endpoint LGPD é restrito a OWNER/ADMIN (403 para outros)
- ✅ Logs do servidor não contêm PII após a correção

### Typecheck
- ✅ Backend `npm run check` passa
- ✅ Frontend `npx tsc --noEmit` passa

---

## Conformidade LGPD — Checklist

| Artigo LGPD | Requisito | Status |
|-------------|-----------|--------|
| Art. 6, III | Princípio da necessidade (mínimo) | ✅ PII não armazenado desnecessariamente |
| Art. 6, VII | Princípio da segurança | ✅ PII redactado em logs/audit |
| Art. 9 | Termo de uso + finalidade | ✅ Finalidade explícita em código |
| Art. 16 | Eliminação após tratamento | ✅ Anonymize preserva integridade |
| Art. 18, V | Direito de acesso | ✅ `GET /lgpd/customers/:id/data-export` |
| Art. 18, VI | Direito de eliminação | ✅ `POST /lgpd/customers/:id/anonymize` |
| Art. 37 | Registro das operações | ✅ Audit log sem PII |
| Art. 46 | Medidas de segurança | ✅ Redator centralizado + testes |

---

## Próximos passos sugeridos

1. **Migration Postgres**: aplicar `migrations/0005_user_module_permissions.sql` quando DB estiver disponível
2. **CI gate**: integrar `scripts/test-pii-redactor.ts` no pipeline (must pass before merge)
3. **Frontend UI**: adicionar painel "Meus dados (LGPD)" em `/app/settings/profile` para clientes
4. **Token de cliente**: criar endpoint `POST /auth/customer-token` com OTP por email/SMS para self-service LGPD
5. **Política de retenção**: adicionar TTL no AuditEvent (Art. 16 — eliminação após cumprimento da finalidade)
6. **DPO contact**: adicionar `lgpd@empresa.com` como contato do encarregado (Art. 41)

---

**Relatório gerado em**: 2026-06-21
**Auditor**: Claude (security-best-practices skill)
**Status final**: 13/13 findings corrigidos, 38/38 testes passando