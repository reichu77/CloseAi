# CloseAI — API

Agente de vendas com IA para PMEs. WhatsApp + Instagram + Widget.

## Stack
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express + Zod
- **Base de dados**: MySQL 8 (persistência) + Redis 7 (sessões)
- **IA**: Anthropic Claude
- **Canais**: Meta Cloud API (WhatsApp + Instagram)

## Arrancar em dev

```bash
# 1. Copia o .env
cp .env.example .env
# Edita o .env com as tuas chaves (ANTHROPIC_API_KEY obrigatório)

# 2. Sobe os containers (MySQL + Redis + API)
cd infra
docker compose up --build

# Ou sem Docker, correndo a API localmente:
cd apps/api
npm install
npm run dev
```

A API fica disponível em `http://localhost:3000`.

## Endpoints principais

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/health` | Health check |
| GET | `/webhook/whatsapp` | Verificação Meta |
| POST | `/webhook/whatsapp` | Recebe mensagens WhatsApp |

## Estrutura do projeto

```
apps/api/src/
├── config/           # Env vars (Zod) + DB pool
├── modules/
│   ├── channels/     # Adapters por canal (WhatsApp, Instagram)
│   ├── conversation/ # Session (Redis) + conversation service
│   ├── ai/           # Orchestrator, RAG, prompt builder, guardrails
│   ├── clients/      # Gestão de empresas clientes
│   └── leads/        # Gestão de leads
├── api/
│   ├── routes/       # Express routes
│   └── middleware/   # Auth, validation
└── shared/           # Types, errors, utils
```

## Adicionar um novo canal

1. Cria `src/modules/channels/<canal>/<canal>.adapter.ts` implementando `ChannelAdapter`
2. Cria `src/modules/channels/<canal>/webhook.handler.ts`
3. Regista as rotas em `src/api/routes/webhook.routes.ts`

O `conversationService` não precisa de alterações — é agnóstico ao canal.

## Base de dados

O schema corre automaticamente via `infra/mysql/init.sql` na primeira vez que o container MySQL sobe.

Tabelas principais:
- `clients` — empresas que usam o CloseAI
- `catalog_items` — produtos/serviços de cada cliente (alimenta o RAG)
- `contacts` — leads dos clientes finais
- `conversations` + `messages` — histórico persistente
- `unanswered_questions` — perguntas que o agente não soube responder (dashboard)

## Variáveis de ambiente

Ver `.env.example` para a lista completa.
