-- Сумка зелий: признак «зелье» у товара (галочка в настройке товара).
-- Товар с галочкой кладётся в сумку зелий, без неё — в рюкзак.
-- Всем уже существующим товарам с бустом галочка проставляется сразу.
BEGIN;
SET lock_timeout = '5s';

ALTER TABLE yuplink.raid_custom_item
  ADD COLUMN IF NOT EXISTS is_potion boolean NOT NULL DEFAULT false;

UPDATE yuplink.raid_custom_item
   SET is_potion = true
 WHERE boost IS NOT NULL
   AND jsonb_typeof(boost) = 'array'
   AND jsonb_array_length(boost) > 0;

COMMIT;
