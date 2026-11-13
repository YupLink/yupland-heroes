-- Два пака выданы адресу с заглавной буквой в имени кошелька, а игрок входит тем же именем строчными:
-- регистр разошёлся, и паки повисли на несуществующем владельце — игрок их
-- не видел. Привязываем к аккаунту владельца, сопоставляя адрес без регистра.
BEGIN;
UPDATE yuplink.chip_pack_grants g
   SET account_id = u.account_id
  FROM yuplink.users u
 WHERE g.account_id IS NULL AND lower(u.wallet) = lower(g.wallet);
COMMIT;
