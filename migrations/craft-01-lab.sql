-- Лаборатория артефактов (§8.81, 25.10.2026, пока только админам): задание =
-- выпавшие характеристики (бросает сервер, не меняются) + картинка от
-- бесплатного генератора. Готовое задание — новый шаблон артефакта
-- (meta.crafted = 'ai', в случайные выдачи не попадает) и один экземпляр у
-- того, кто его создал.
CREATE TABLE IF NOT EXISTS yuplink.artifact_craft (
  id          text PRIMARY KEY,
  account_id  text NOT NULL,
  wallet      text NOT NULL,
  -- ключ клиента: двойное нажатие не создаёт второе задание
  nonce       text NOT NULL,
  rarity      text NOT NULL,
  slot        text NOT NULL,
  form        text NOT NULL,
  boost       jsonb NOT NULL DEFAULT '{}'::jsonb,
  roll        jsonb NOT NULL,
  name        text NOT NULL,
  prompt      text NOT NULL,
  -- queued → done | failed
  status      text NOT NULL DEFAULT 'queued',
  -- попытки картинки (ожидание квоты генератора не считается)
  tries       int NOT NULL DEFAULT 0,
  next_at     timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  -- метка аренды: закрыть задание может только тот, кто его взял
  lease_token text,
  last_error  text,
  template_id text,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- когда встало в очередь (создание или «Повторить»): сутки без картинки — «не вышло»
  queued_at   timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz,
  UNIQUE (account_id, nonce)
);

-- таблица уже создана первой версией файла — колонки добавляем отдельно
ALTER TABLE yuplink.artifact_craft ADD COLUMN IF NOT EXISTS lease_token text;
-- заказ в AI Horde, который ещё рисуется: {provider, id, model, at, seed}
ALTER TABLE yuplink.artifact_craft ADD COLUMN IF NOT EXISTS ext jsonb;

CREATE INDEX IF NOT EXISTS artifact_craft_account_idx
  ON yuplink.artifact_craft (account_id, created_at DESC);
