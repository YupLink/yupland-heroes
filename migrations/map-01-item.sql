-- Карта мира по предмету «Карта» (владелец, 05.10.2026; ПРАВИЛА §8.32,
-- src/lib/raid/worldMapAccess.ts, сервер — src/server/api/beta-raid/world-map*.ts).
--
-- «Карту — чтобы доступна была для всех, но ни у кого не было возможности её
-- посмотреть (нужно будет покупать карту — чтобы ею воспользоваться)». Карта —
-- свой товар с галочкой «Карта» (is_map; видов может быть несколько). Целая штука
-- такого товара в рюкзаке ВЫБРАННОГО героя открывает карту мира: «Разведанное»,
-- а админу ещё и «Вся карта». Предмет не тратится и не изнашивается; продал,
-- выбросил, сменил героя — карты нет. Обхода без предмета нет ни у кого.
--
-- Только добавляет: колонку-флаг с ограничением. Идемпотентно.
--
-- Накатывать ДО кода. Без колонки is_map падают список своих товаров (админка
-- маркета), рюкзак героя (getMyBackpack читает ci.is_map — рюкзак показался бы
-- пустым) и сама карта мира (проверка предмета).
--
-- ALTER берёт ACCESS EXCLUSIVE на справочник своих товаров: чужой лок ждём не
-- дольше 5 с (как bag-01, pchest-01, fish-01) — отказ, просто прогнать ещё раз.
-- Готово, когда есть raid_custom_item.is_map и ограничение raid_custom_item_map_ok.
SET lock_timeout = '5s';

-- Карта — галочка у своего товара. Не зелье, не сундук (обычный и магический),
-- не лопата и не удочка: карту не пьют, не ставят на карту и ею не бьют.
-- Ограничение «одна галочка» (raid_custom_item_kind_ok, pchest-01) не трогаем —
-- у карты своё, как у удочки (raid_custom_item_rod_ok, fish-01).
ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS is_map boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'raid_custom_item_map_ok'
       AND conrelid = 'yuplink.raid_custom_item'::regclass
  ) THEN
    ALTER TABLE yuplink.raid_custom_item
      ADD CONSTRAINT raid_custom_item_map_ok CHECK (
        NOT is_map OR NOT (is_potion OR magic_chest OR plain_chest OR is_shovel OR is_rod)
      ) NOT VALID;
  END IF;
END $$;
