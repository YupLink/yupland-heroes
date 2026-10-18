-- Взаимодействие с декором — только через «Топор» (владелец, 27.09: «1 топор =
-- 1 декор, с которым можно взаимодействовать»).
--
-- Инструмент — настройка шаблона декора (meta.interact.toolItemId, см.
-- src/lib/raid/decorInteract.ts). Ставим «Топор» (cst_g7uwp1syvmng) всем
-- шаблонам, у которых взаимодействие уже настроено и инструмент ещё не задан.
-- Включённость (on) не трогаем: включает владелец. Новые шаблоны инструмент
-- получают в админке.
--
-- Идемпотентно: уже заданный инструмент не перезаписывается.
BEGIN;

UPDATE yuplink.mystic_item_template
   SET meta = jsonb_set(meta, '{interact,toolItemId}', '"cst_g7uwp1syvmng"'::jsonb)
 WHERE meta ? 'interact'
   AND jsonb_typeof(meta->'interact') = 'object'
   AND COALESCE(meta->'interact'->>'toolItemId', '') = ''
   AND EXISTS (SELECT 1 FROM yuplink.raid_custom_item WHERE id = 'cst_g7uwp1syvmng');

COMMIT;
