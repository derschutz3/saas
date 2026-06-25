# React + TypeScript + Vite

## ERP SaaS Bebidas (MVP demo)
Demo full-stack (React + Express) com multi-tenant simplificado e módulos básicos:
- Login
- Pedido rápido
- Fila de pedidos (kanban por status)
- Estoque (saldo + ajustes)
- Caixa do dia (abrir/fechar + baixar contas a receber)
- Monitor fiscal (emissão simulada em background)

### Acesso (demo)
- E-mail: admin@demo.com
- Senha: admin123

### Rodar localmente
1. Instale Node.js + npm (recomendado: Node LTS).
2. Instale dependências:

```bash
npm install
```

3. Inicie frontend + backend (modo demo in-memory):

```bash
npm run dev
```

4. Acesse:
- Web: http://localhost:5173
- API: http://localhost:3001/api/health

### Persistência com PostgreSQL (sem Docker)
1. Crie um banco PostgreSQL (recomendado para dev sem Docker: Neon, Supabase ou um Postgres local instalado).
2. Copie `.env.example` para `.env` e preencha `DATABASE_URL`.
3. Rode migrations + seed:

```bash
npm run db:seed
```

4. Suba a aplicação:

```bash
npm run dev
```

### Seleção de storage
- `STORE_BACKEND=auto` (padrão): usa Postgres quando `DATABASE_URL` existe, senão roda in-memory.
- `STORE_BACKEND=postgres`: exige Postgres (falha se `DATABASE_URL` não estiver configurada).
- `STORE_BACKEND=memory`: força modo demo in-memory.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
