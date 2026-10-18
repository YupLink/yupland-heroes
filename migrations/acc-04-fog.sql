-- Волна 2: разведанная карта принадлежит аккаунту.
-- Три строки остались с ключом-адресом: их владельцы получили аккаунт позже,
-- и без переноса весь их туман стал бы сиротой — карта «зарастает» заново.
BEGIN;

-- Если у аккаунта уже есть своя строка на этой карте — сливаем множества
-- клеток, иначе просто переклеиваем ключ.
UPDATE yuplink.beta_raid_fog f
   SET seen = (SELECT COALESCE(jsonb_agg(DISTINCT c), '[]'::jsonb)
                 FROM jsonb_array_elements(f.seen || o.seen) AS c),
       updated_at = now()
  FROM yuplink.beta_raid_fog o
 WHERE o.owner NOT LIKE 'acc\_%'
   AND f.owner = yuplink.acc_of(o.owner)
   AND f.map_id = o.map_id;

DELETE FROM yuplink.beta_raid_fog o
 WHERE o.owner NOT LIKE 'acc\_%'
   AND EXISTS (SELECT 1 FROM yuplink.beta_raid_fog f
                WHERE f.owner = yuplink.acc_of(o.owner) AND f.map_id = o.map_id);

UPDATE yuplink.beta_raid_fog o
   SET owner = yuplink.acc_of(o.owner)
 WHERE o.owner NOT LIKE 'acc\_%' AND yuplink.acc_of(o.owner) IS NOT NULL;

COMMIT;
