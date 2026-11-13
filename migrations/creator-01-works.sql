-- Креатор (владелец, 07.11.2026: «ещё одна роль — креатор… отдельный мир, но вообще
-- без карты — голая карта… создавать шаблоны поселений… сохранение шаблона и
-- отдельный список таких работ… старые карты ей не открываются — только свои
-- шаблоны или те, которыми другой креатор поделился»).
-- Работа = своя карта isle_cw_… (raid_maps, active = false): пустое море с
-- островком под героя, режим бога там целиком, без денег. Право — admin_rights
-- «creator». places.spawn — старт героя в работе («Старт героя» режима бога).
-- Применять ДО кода.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS yuplink.raid_creator_work (
  map_id        text PRIMARY KEY REFERENCES yuplink.raid_maps(id) ON DELETE CASCADE,
  name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  owner_account text        NOT NULL,
  places        jsonb       NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raid_creator_work_owner_idx
  ON yuplink.raid_creator_work (owner_account, updated_at DESC);

-- Общая работа: кому из креаторов владелец её открыл.
CREATE TABLE IF NOT EXISTS yuplink.raid_creator_share (
  map_id     text NOT NULL REFERENCES yuplink.raid_creator_work(map_id) ON DELETE CASCADE,
  account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_id, account_id)
);
CREATE INDEX IF NOT EXISTS raid_creator_share_account_idx
  ON yuplink.raid_creator_share (account_id);

-- Откуда креатор пришёл в работы: «Выйти из шаблона» возвращает туда.
CREATE TABLE IF NOT EXISTS yuplink.raid_creator_back (
  account_id text PRIMARY KEY,
  map_id     text    NOT NULL,
  q          integer NOT NULL,
  r          integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
