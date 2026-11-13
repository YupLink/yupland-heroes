-- Жизни мобов после дуэли (владелец, 09.11.2026, ПРАВИЛА §8.105 п. 9): «мобы живые
-- сохраняются; регистрировать по всем мобам, что были в бою, их жизни — чтобы в следующем
-- бою их жизни соответствовали выставляемому». Строка — копия моба у аккаунта (шаблон и
-- номер копии: одинаковых можно несколько). Нет строки — моб полный. Пал — строка уходит
-- (в песочнице моб из казармы снова полный; в настоящем бою павший исчезает).
-- Пишет только песочница админов (duel-api saveDuelMobs). Идемпотентно.
CREATE TABLE IF NOT EXISTS yuplink.duel_mob_hp (
  account_id text NOT NULL,
  template_id text NOT NULL,
  copy integer NOT NULL CHECK (copy >= 0 AND copy < 4),
  hp numeric NOT NULL CHECK (hp > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, template_id, copy)
);
