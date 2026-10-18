-- Журнал сделок и суточный агрегат причин трат энергии — под панель
-- «$ Экономика» (владелец, 22.09.2026: «видеть движения и лазейки как на ладони»).
--
-- Зачем отдельные таблицы, если есть леджеры. У движения денег в acc_ledger /
-- res_ledger / ticket_ledger нет ни количества товара, ни цены за единицу, ни
-- контрагента: по ref видно «маркет mkt_…», но не «12 × Молоко по 40 золота у
-- магазина (28,45)». Цепочку «купил дёшево тут — продал дорого там» из
-- леджеров не восстановить. Журнал пишут сами торговые пути ПОСЛЕ успешной
-- сделки, best-effort (сбой записи сделку не ломает), с момента выката —
-- задним числом ничего не восстанавливаем.
--
-- Энергия: в currency_ledger ВСЕ траты — один вид energy_spend без ref, и «на
-- что ушла энергия» (шаги, бои, порталы, вышки…) по нему не видно. Суточный
-- агрегат по (аккаунт, день, причина) маленький и достаточный: точки списания
-- докладывают причину сами, строк — по числу причин на игрока в день, а не
-- по числу шагов (1,4 млн строк energy_spend в неделю в леджере).
BEGIN;

CREATE TABLE IF NOT EXISTS yuplink.trade_journal (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  account_id   text NOT NULL,
  -- Вторая сторона: account_id игрока (рынок фишек), 'shop' | 'town' | 'sink',
  -- либо NULL (общая полка склада — контрагента нет).
  counterparty text,
  map_id       text,
  q            integer,
  r            integer,
  -- market | market_sell | town | chip_market | wh_take | wh_put | gate | portal | field
  source       text NOT NULL,
  -- buy | sell | take | put | pay
  side         text NOT NULL,
  -- Ключ товара как в admin-economy-keys: resource:gold, resource:token:USDT,
  -- custom:name:<slug>, pack:<id>, chip:<id>… — по нему сделки склеиваются в цепочки.
  item_key     text NOT NULL,
  item_name    text,
  qty          numeric NOT NULL,
  price_unit   numeric,
  -- Валюта цены: токен счёта, gold/wood/stone/diamonds, tickets, likes, Energy.
  price_cur    text,
  total        numeric,
  -- Ключ операции из леджера (payRef): по нему сделка идемпотентна при ретраях моста.
  ref          text
);

-- Идемпотентность: мост ретраит запрос вслепую, и без уникальности повтор дал
-- бы вторую строку той же сделки. Строки без ref в проверке не участвуют.
CREATE UNIQUE INDEX IF NOT EXISTS trade_journal_source_ref_uidx
  ON yuplink.trade_journal (source, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS trade_journal_at_idx
  ON yuplink.trade_journal (at);
CREATE INDEX IF NOT EXISTS trade_journal_account_at_idx
  ON yuplink.trade_journal (account_id, at);
CREATE INDEX IF NOT EXISTS trade_journal_item_at_idx
  ON yuplink.trade_journal (item_key, at);
CREATE INDEX IF NOT EXISTS trade_journal_place_idx
  ON yuplink.trade_journal (map_id, q, r);

CREATE TABLE IF NOT EXISTS yuplink.energy_spend_daily (
  account_id text NOT NULL,
  -- Сутки по UTC — как created_at в леджерах.
  day        date NOT NULL,
  -- step | fight | boss | portal | gate | ship | tower | mine_capture | market
  -- | build | spell | stake | pickup | other (EnergySpendReason в src/lib/econ/types.ts)
  reason     text NOT NULL,
  amount     numeric NOT NULL DEFAULT 0,
  -- Сколько списаний сложилось в amount — чтобы отличать «100 шагов по 1» от «один бой за 100».
  n          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day, reason)
);

COMMIT;
