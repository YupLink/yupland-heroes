-- Ломбард: скупка ГЕРОЕВ по редкости (владелец, 22.10.2026): «дать админу
-- возможность делать скупки как и на артефакты по редкости — также по редкости
-- и героев — за золото. При этом та же механика и с наценкой на героев. По
-- умолчанию на них наценка ×5 — но админ выставляет сам для лавки локально».
--
-- Позиция скупки «Любой … герой» (kind='hero', ref_id='hero_any_<редкость>')
-- принимает свободного героя этой редкости; сданный встаёт на витрину покупки
-- той же лавки по цене выплата × наценка героев (код — beta-raid/market-pawn.ts,
-- hero-pawn-take.ts).
--
-- Добавляет колонку наценки героев и таблицу снимков сданных героев; наценки
-- (артефактов и героев) — не ниже ×1. Идемпотентно. Накатывать ДО кода. Готово,
-- когда есть raid_market_shop.pawn_hero_markup, оба CHECK «>= 1» и таблица
-- pawn_hero_take с колонкой paid_at.
SET lock_timeout = '5s';

-- 1. Наценка героев — своя у каждой лавки, по умолчанию ×5 (у артефактов —
--    pawn_markup, migrations/pawn-01). Существующие строки получают 5 сразу.
ALTER TABLE yuplink.raid_market_shop
  ADD COLUMN IF NOT EXISTS pawn_hero_markup numeric NOT NULL DEFAULT 5;

-- 1а. Наценка не ниже ×1 — у обеих: ниже лавка продавала бы сданное дешевле,
--     чем платит за него. Прежний CHECK артефактов был «> 0» (pawn-01) — меняем
--     на «>= 1» под тем же именем. На проде 22.10 все pawn_markup — 5…10, так
--     что проверка строк пройдёт. Сначала DROP, потом ADD — повтор не падает.
ALTER TABLE yuplink.raid_market_shop
  DROP CONSTRAINT IF EXISTS raid_market_shop_pawn_markup_check;
ALTER TABLE yuplink.raid_market_shop
  ADD CONSTRAINT raid_market_shop_pawn_markup_check CHECK (pawn_markup >= 1);
ALTER TABLE yuplink.raid_market_shop
  DROP CONSTRAINT IF EXISTS raid_market_shop_pawn_hero_markup_check;
ALTER TABLE yuplink.raid_market_shop
  ADD CONSTRAINT raid_market_shop_pawn_hero_markup_check CHECK (pawn_hero_markup >= 1);

-- 2. Снимок сданного героя. Герой — это копия предмета (user_game_item) и, если
--    его будили, экземпляр (hero_instance: уровень, навыки, экипировка) с книгой
--    заклинаний (hero_spellbook, hero_spell_cd — уходят каскадом). Снятие пишет
--    снимок ТЕМ ЖЕ оператором, что и удаляет; сорвалась выплата — герой
--    возвращается из снимка целиком, под прежними id (restored_at — когда).
--    op — ключ сделки (payRef): слепой повтор моста находит тот же снимок.
--    paid_at — выплата за героя прошла: снимок закрыт, откат его не вернёт.
--    Ни paid_at, ни restored_at спустя минуты — сделка оборвалась посередине.
CREATE TABLE IF NOT EXISTS yuplink.pawn_hero_take (
  op          text        PRIMARY KEY,
  account_id  text        NOT NULL,
  item_id     text        NOT NULL,
  template_id text        NOT NULL,
  item        jsonb       NOT NULL,
  instance    jsonb,
  spells      jsonb,
  spell_cd    jsonb,
  taken_at    timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  paid_at     timestamptz
);
ALTER TABLE yuplink.pawn_hero_take ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE INDEX IF NOT EXISTS pawn_hero_take_account
  ON yuplink.pawn_hero_take (account_id, taken_at DESC);
