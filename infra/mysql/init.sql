-- CloseAI — Schema inicial
-- MySQL 8.0
-- Corre automaticamente na primeira vez que o container sobe

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ─────────────────────────────────────────
-- CLIENTS (as empresas que contratam o CloseAI)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  plan          ENUM('starter','growth','pro') NOT NULL DEFAULT 'starter',
  status        ENUM('active','suspended','trial') NOT NULL DEFAULT 'trial',

  -- Prompt personalizado. Se NULL, usa o template padrão do promptBuilder
  system_prompt TEXT          NULL,

  -- Canais activos para este cliente
  whatsapp_phone_id   VARCHAR(100) NULL,  -- phone_number_id da Meta
  instagram_page_id   VARCHAR(100) NULL,

  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_whatsapp_phone_id (whatsapp_phone_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────
-- CATALOG_ITEMS (produtos/serviços de cada cliente)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalog_items (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  client_id     VARCHAR(36)   NOT NULL,
  name          VARCHAR(255)  NOT NULL,
  description   TEXT          NULL,
  price         DECIMAL(10,2) NULL,
  currency      VARCHAR(3)    NOT NULL DEFAULT 'EUR',
  available     TINYINT(1)    NOT NULL DEFAULT 1,

  -- Atributos específicos de imóveis: tipologia, area_m2, freguesia, garagem,
  -- certificado_energetico, tipo (venda/arrendamento), referencia
  metadata      JSON          NULL,

  -- Chunk de texto normalizado para RAG (gerado na ingestão)
  embedding_text TEXT         NULL,

  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_client_id (client_id),
  -- Índices funcionais para queries dentro do JSON (MySQL 8.0+)
  INDEX idx_available (available),
  -- Necessário para o MATCH...AGAINST do rag.service.ts
  FULLTEXT INDEX idx_fulltext_catalog (name, description),
  CONSTRAINT fk_catalog_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────
-- CONTACTS (leads/clientes finais dos nossos clientes)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  client_id     VARCHAR(36)   NOT NULL,

  -- Identificador no canal (número whatsapp, instagram_id, etc.)
  channel       ENUM('whatsapp','instagram','widget') NOT NULL,
  channel_id    VARCHAR(255)  NOT NULL,  -- ex: '351912345678'

  name          VARCHAR(255)  NULL,
  phone         VARCHAR(50)   NULL,
  email         VARCHAR(255)  NULL,

  -- Qualificação do lead
  lead_status   ENUM('new','contacted','qualified','converted','lost') NOT NULL DEFAULT 'new',
  lead_score    TINYINT       NOT NULL DEFAULT 0,  -- 0-100

  -- Qualificação imobiliária
  budget_min    DECIMAL(12,2) NULL,
  budget_max    DECIMAL(12,2) NULL,
  zona_preferida VARCHAR(255) NULL,
  tipo_procura  ENUM('compra','arrendamento') NULL,

  notes         TEXT          NULL,

  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_contact_channel (client_id, channel, channel_id),
  INDEX idx_client_id (client_id),
  INDEX idx_lead_status (lead_status),
  CONSTRAINT fk_contact_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────
-- CONVERSATIONS (cada thread de conversa)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id            VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  client_id     VARCHAR(36)   NOT NULL,
  contact_id    VARCHAR(36)   NOT NULL,
  channel       ENUM('whatsapp','instagram','widget') NOT NULL,

  status        ENUM('open','human_takeover','closed') NOT NULL DEFAULT 'open',

  -- Métricas básicas
  message_count INT           NOT NULL DEFAULT 0,
  tokens_used   INT           NOT NULL DEFAULT 0,

  opened_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at     DATETIME      NULL,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_client_contact (client_id, contact_id),
  INDEX idx_status (status),
  CONSTRAINT fk_conv_client  FOREIGN KEY (client_id)  REFERENCES clients(id)  ON DELETE CASCADE,
  CONSTRAINT fk_conv_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────
-- MESSAGES (histórico persistente — Redis é só sessão activa)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  conversation_id VARCHAR(36)   NOT NULL,
  client_id       VARCHAR(36)   NOT NULL,  -- desnormalizado para queries rápidas

  role            ENUM('user','assistant') NOT NULL,
  content         TEXT          NOT NULL,
  channel_msg_id  VARCHAR(255)  NULL,      -- ID original no canal (para deduplicação)

  -- Metadados do AI
  tokens_used     INT           NULL,
  model           VARCHAR(100)  NULL,
  flagged         TINYINT(1)    NOT NULL DEFAULT 0,  -- guardrail activado?

  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_channel_msg_id (channel_msg_id),
  INDEX idx_conversation_id (conversation_id),
  INDEX idx_client_created (client_id, created_at),
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────
-- UNANSWERED_QUESTIONS (mensagens que o agente não soube responder)
-- Aparece no dashboard para o cliente melhorar o catálogo
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unanswered_questions (
  id              VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  client_id       VARCHAR(36)   NOT NULL,
  conversation_id VARCHAR(36)   NOT NULL,
  question        TEXT          NOT NULL,
  resolved        TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_client_resolved (client_id, resolved),
  CONSTRAINT fk_uq_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─────────────────────────────────────────
-- Dados de seed para dev
-- ─────────────────────────────────────────
INSERT IGNORE INTO clients (id, name, email, plan, status, whatsapp_phone_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Piloto Dev',
  'dev@closeai.local',
  'pro',
  'active',
  'DEV_PHONE_ID'
);

INSERT IGNORE INTO catalog_items (id, client_id, name, description, price, currency, available, metadata)
VALUES
(
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Apartamento T3 – Paranhos, Porto',
  'Apartamento remodelado em 2022, cozinha equipada, suite, varanda com vista para jardim. Condomínio fechado com segurança 24h.',
  285000.00,
  'EUR',
  1,
  JSON_OBJECT(
    'tipologia',             'T3',
    'area_m2',               110,
    'freguesia',             'Paranhos, Porto',
    'garagem',               true,
    'certificado_energetico','B',
    'tipo',                  'venda',
    'referencia',            'PRT-001',
    'url',                   'https://imobiliariasilva.pt/imoveis/ref-prt-001'
  )
),
(
  '10000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Apartamento T2 – Matosinhos',
  'Apartamento moderno a 5 minutos da praia. Totalmente mobilado e equipado, ideal para arrendamento de longa duração.',
  1200.00,
  'EUR',
  1,
  JSON_OBJECT(
    'tipologia',             'T2',
    'area_m2',               75,
    'freguesia',             'Matosinhos',
    'garagem',               false,
    'certificado_energetico','A',
    'tipo',                  'arrendamento',
    'referencia',            'MAT-002',
    'url',                   'https://imobiliariasilva.pt/imoveis/ref-mat-002'
  )
),
(
  '10000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'Moradia T4 – Cascais',
  'Moradia isolada com piscina, jardim privativo e garagem para 2 carros. Localização privilegiada a 10 minutos do centro de Cascais.',
  890000.00,
  'EUR',
  1,
  JSON_OBJECT(
    'tipologia',             'T4',
    'area_m2',               280,
    'freguesia',             'Cascais',
    'garagem',               true,
    'certificado_energetico','B+',
    'tipo',                  'venda',
    'referencia',            'CAS-003',
    'url',                   'https://imobiliariasilva.pt/imoveis/ref-cas-003'
  )
);
