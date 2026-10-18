-- Подписка на энергию (владелец, 29.09.2026).
--
-- Тариф задаётся в $; DARAI и Stars считаются от $ по курсу (lib/energySub.ts).
-- Игрок платит со счёта (acc_ledger: USDT / Darai / STARS) и 30 дней получает
-- в «Подарки» энергию и боксы, настроенные у тарифа.
--
-- Деньги подписок раскладываются по КОРЗИНАМ (money_bucket_move) — отдельный
-- журнал, чтобы не путаться с пулом карты, счетами игроков и казной. Корзины
-- рассылаются ПАЧКАМИ (money_batch) по порогу или кнопке.
--
-- Имена с префиксом energy_sub: public.user_subscriptions — это другая
-- подписка (скидка на билеты), путать нельзя.
BEGIN;
SET lock_timeout = '5s';

-- Тарифы: цена в $, что получает игрок. Скидка DARAI и наценка Stars — в коде.
CREATE TABLE IF NOT EXISTS yuplink.energy_sub_tier (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  name_en        text NOT NULL DEFAULT '',
  price_usd      numeric(12,2) NOT NULL CHECK (price_usd > 0),
  energy_per_day numeric(14,2) NOT NULL DEFAULT 0 CHECK (energy_per_day >= 0),
  box_pack_id    text,
  boxes_per_day  int NOT NULL DEFAULT 0 CHECK (boxes_per_day >= 0),
  days           int NOT NULL DEFAULT 30 CHECK (days BETWEEN 1 AND 366),
  active         boolean NOT NULL DEFAULT true,
  sort           int NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

INSERT INTO yuplink.energy_sub_tier (id, name, name_en, price_usd, energy_per_day, boxes_per_day, sort)
VALUES ('esub_novice',   'Новичок',     'Beginner',  7, 500,  1, 1),
       ('esub_advanced', 'Продвинутый', 'Advanced', 25, 1800, 4, 2),
       ('esub_expert',   'Эксперт',     'Expert',   45, 5000, 10, 3)
ON CONFLICT (id) DO NOTHING;

-- Купленная подписка. Условия — СНИМОК на момент покупки: правка тарифа потом
-- не меняет того, что игрок уже оплатил.
CREATE TABLE IF NOT EXISTS yuplink.energy_sub (
  id             text PRIMARY KEY,
  account_id     text NOT NULL,
  wallet         text NOT NULL,
  tier_id        text NOT NULL,
  tier_name      text NOT NULL,
  token          text NOT NULL,
  amount         numeric(38,8) NOT NULL CHECK (amount > 0),
  price_usd      numeric(12,2) NOT NULL,
  darai_per_usd  numeric(38,8),
  energy_per_day numeric(14,2) NOT NULL,
  box_pack_id    text,
  boxes_per_day  int NOT NULL,
  days           int NOT NULL,
  starts_at      timestamptz NOT NULL DEFAULT now(),
  ends_at        timestamptz NOT NULL,
  pay_ref        text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS energy_sub_account_idx ON yuplink.energy_sub (account_id, ends_at);

-- Выданные дни. Своя таблица, а не source_ref подарка: сгоревший подарок
-- переименовывает свой ключ, и день выдался бы второй раз.
CREATE TABLE IF NOT EXISTS yuplink.energy_sub_day (
  sub_id     text NOT NULL REFERENCES yuplink.energy_sub(id),
  day_no     int NOT NULL,
  energy     numeric(14,2) NOT NULL,
  boxes      int NOT NULL,
  missed     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sub_id, day_no)
);

-- Журнал корзин: приход от подписок, уход пачками, ручные списания звёзд.
CREATE TABLE IF NOT EXISTS yuplink.money_bucket_move (
  id         text PRIMARY KEY,
  bucket     text NOT NULL CHECK (bucket IN
               ('sub_usd', 'sub_usd_stars', 'sub_burn', 'sub_dev', 'sub_stars_game', 'sub_stars_dev')),
  token      text NOT NULL,
  amount     numeric(38,8) NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('income', 'batch', 'stars_out', 'adjust')),
  ref        text NOT NULL UNIQUE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS money_bucket_move_bucket_idx ON yuplink.money_bucket_move (bucket, created_at);

-- Пачки рассылки. Шаги (обмен, переводы) с хэшами — в steps.
CREATE TABLE IF NOT EXISTS yuplink.money_batch (
  id         text PRIMARY KEY,
  bucket     text NOT NULL,
  token      text NOT NULL,
  amount     numeric(38,8) NOT NULL CHECK (amount > 0),
  status     text NOT NULL CHECK (status IN ('running', 'done', 'failed', 'closed')),
  steps      jsonb NOT NULL DEFAULT '[]'::jsonb,
  error      text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Одна незакрытая пачка на корзину: вторая не уйдёт, пока первая не done/closed.
CREATE UNIQUE INDEX IF NOT EXISTS money_batch_one_open
  ON yuplink.money_batch (bucket) WHERE status IN ('running', 'failed');

-- Владелец — как у всей схемы: приложение ходит под supabase_admin.
ALTER TABLE yuplink.energy_sub_tier   OWNER TO supabase_admin;
ALTER TABLE yuplink.energy_sub        OWNER TO supabase_admin;
ALTER TABLE yuplink.energy_sub_day    OWNER TO supabase_admin;
ALTER TABLE yuplink.money_bucket_move OWNER TO supabase_admin;
ALTER TABLE yuplink.money_batch       OWNER TO supabase_admin;

COMMIT;
