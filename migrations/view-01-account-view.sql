-- Что игрок хочет видеть (профиль, 14.10.2026): чужие лагеря на карте и
-- юпиков, гуляющих по замку. Только вид — на игру не влияет. Хранится на
-- аккаунте, чтобы выбор ехал с телефона на ПК. Нет строки — всё показываем.

CREATE TABLE IF NOT EXISTS yuplink.account_view (
  account_id text PRIMARY KEY,
  hide_players boolean NOT NULL DEFAULT false,
  hide_residents boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
