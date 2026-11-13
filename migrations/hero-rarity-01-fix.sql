-- Редкость героя — по ярусу шаблона (владелец, 22.10.2026: «обычные герои всегда обычные»).
--
-- ПРИМЕНЯТЬ ПОСЛЕ выката кода (heroes-read / heroes-convert больше не пишут чужую редкость).
--
-- Ошибка: первая прокачка спящего героя (heroes-read.levelUpHeroTemplate) писала
-- hero_instance.rarity = 'rare' любому шаблону ниже 4-го яруса — в том числе обычным
-- (ярус 1–2). Прод 22.10: 56 героев на 54 аккаунтах, шаблоны «Fedr - Stubborn Mage» (36)
-- и «An — Sad Face» (20), созданы 15.09–25.09, все source = 'inventory_item';
-- уровни 1–22, из них 10 выше 10-го (на эти ступени ушло 43 800 лайков); у 17 героев
-- (15 из них основные) надето 49 артефактов на места, которых у обычного нет.
--
-- Законного пути поднять редкость экземпляра выше шаблона НЕТ: §8.25 «Повышенные уровни»
-- поднимает уровень, а не редкость; превращение фишки берёт шаблон яруса фишки (550 строк
-- chip_convert — все совпадают с ярусом); HOV-шаблон заводится с ярусом выпавшей
-- редкости; после создания rarity не меняет ни один путь. Поэтому правим ВСЕ строки, где
-- rarity ≠ ярус шаблона. Экземпляр без шаблона (1 шт.) не трогаем — яруса у него нет.
--
-- Одна транзакция. Повтор безвреден: правит только расхождения (второй прогон — 0 строк);
-- копия дописывается только новыми id — первый снимок строки не перезаписывается.
--   a) замок затронутых строк и их копия целиком → yuplink.hero_instance_bak_20261022;
--   b) rarity := ярус шаблона (1–2 common, 3 rare, 4 epic, 5+ legendary) — то же, что
--      rarityOfTemplateLevel (heroes-list-dormant.ts) и heroRaritySql (hero-pawn-sql.ts);
--   c) кто стал common — артефакты с мест, которых у обычного нет, снимаются (у common
--      только «Голова», «Тело», «Правая рука», «Ноги» — heroSlots.ts COMMON_SLOTS).
--      Иначе вещь висела бы невидимкой: экран снаряжения её не рисует и снять не даёт,
--      бой её считает (hero-load берёт все значения equipped), маркет считает надетой и
--      не продаёт. Артефакт — строка инвентаря игрока, он просто становится свободным;
--   d) проверочные SELECT — до COMMIT, чтобы проба с ROLLBACK вместо COMMIT их тоже показала.
-- НЕ трогает (решение владельца — см. отчёт): уровень выше 10-го (статы и так считаются
-- от 10-го — growthLevel; следующий уровень закрыт — nextLevelCost = null), потраченные
-- лайки, вложенные очки навыков (2 героя), рюкзак/книгу/сумку сверх ёмкости common
-- (лежащее остаётся, нового не примут — как после конца баффа), сытость выше 1000
-- (режется до потолка при чтении и при первом шаге).
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';

-- Ярус шаблона → редкость (живёт до конца сессии).
CREATE OR REPLACE FUNCTION pg_temp.tier_rarity(lvl numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE WHEN COALESCE(lvl, 0) >= 5 THEN 'legendary'
              WHEN COALESCE(lvl, 0) >= 4 THEN 'epic'
              WHEN COALESCE(lvl, 0) >= 3 THEN 'rare'
              ELSE 'common' END
$f$;

-- ───────────── 0) что поменяется (смотреть на пробе с откатом) ─────────────
SELECT t.level AS tpl_level, h.rarity AS was, pg_temp.tier_rarity(t.level) AS becomes,
       h.source, count(*) AS heroes, max(h.level) AS max_level,
       count(*) FILTER (WHERE h.level > 10) AS above_10
  FROM yuplink.hero_instance h
  JOIN yuplink.mystic_item_template t ON t.id = h.template_id
 WHERE h.rarity IS DISTINCT FROM pg_temp.tier_rarity(t.level)
 GROUP BY 1, 2, 3, 4
 ORDER BY 1, 2;

-- ───────────── a) замок и копия ─────────────
-- Надевание артефакта на затронутого героя в эту секунду подождёт конца транзакции.
SELECT h.id
  FROM yuplink.hero_instance h
  JOIN yuplink.mystic_item_template t ON t.id = h.template_id
 WHERE h.rarity IS DISTINCT FROM pg_temp.tier_rarity(t.level)
   FOR UPDATE OF h;

CREATE TABLE IF NOT EXISTS yuplink.hero_instance_bak_20261022 AS
  SELECT h.*, now() AS bak_at FROM yuplink.hero_instance h WHERE false;

INSERT INTO yuplink.hero_instance_bak_20261022
SELECT h.*, now()
  FROM yuplink.hero_instance h
  JOIN yuplink.mystic_item_template t ON t.id = h.template_id
 WHERE h.rarity IS DISTINCT FROM pg_temp.tier_rarity(t.level)
   AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance_bak_20261022 b WHERE b.id = h.id);

-- ───────────── b) + c) редкость по ярусу, лишние места common ─────────────
UPDATE yuplink.hero_instance h
   SET rarity = pg_temp.tier_rarity(t.level),
       equipped = CASE
         WHEN pg_temp.tier_rarity(t.level) = 'common' AND jsonb_typeof(h.equipped) = 'object'
         THEN COALESCE((SELECT jsonb_object_agg(e.key, e.value)
                          FROM jsonb_each(h.equipped) e
                         WHERE e.key IN ('Голова', 'Тело', 'Правая рука', 'Ноги')), '{}'::jsonb)
         ELSE h.equipped END,
       updated_at = now()
  FROM yuplink.mystic_item_template t
 WHERE t.id = h.template_id
   AND h.rarity IS DISTINCT FROM pg_temp.tier_rarity(t.level);

-- ───────────── d) проверка ─────────────
-- Расхождений не осталось (ожидается 0).
SELECT count(*) AS still_wrong
  FROM yuplink.hero_instance h
  JOIN yuplink.mystic_item_template t ON t.id = h.template_id
 WHERE h.rarity IS DISTINCT FROM pg_temp.tier_rarity(t.level);

-- У исправленных common нет артефактов вне четырёх мест (ожидается 0).
SELECT count(*) AS common_extra_slots
  FROM yuplink.hero_instance h
  JOIN yuplink.hero_instance_bak_20261022 b ON b.id = h.id,
       jsonb_each_text(h.equipped) e
 WHERE h.rarity = 'common' AND e.key NOT IN ('Голова', 'Тело', 'Правая рука', 'Ноги');

-- Сколько в копии (первый прогон 22.10 — 56) и сколько артефактов сняли (первый — 49).
SELECT count(*) AS in_backup,
       (SELECT count(*)
          FROM yuplink.hero_instance_bak_20261022 b2
          JOIN yuplink.hero_instance h2 ON h2.id = b2.id,
               jsonb_each_text(b2.equipped) e
         WHERE NOT (h2.equipped ? e.key)) AS artifacts_unequipped
  FROM yuplink.hero_instance_bak_20261022;

COMMIT;
