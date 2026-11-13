-- Короткое обучение острова (история Кай, PR #406/#416: 13 шагов — сундук, продажа
-- слитка, топор, дуб, бой, лодка, переправа, заклинание у столба) — всем новым
-- островам. Владелец, 11.11.2026: «да, давай сделаем».
-- Выключатель как island_newbies: {"on": true}; выключить — {"on": false}, без выката.
-- Острова, созданные до включения, идут прежним маршрутом (порядок — по places.lesson).
BEGIN;
INSERT INTO yuplink.settings (key, value)
VALUES ('island_short', '{"on": true}')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
COMMIT;
