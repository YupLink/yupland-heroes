-- Герой за NFT Heroes of Valdir — из самого NFT (владелец, 17.10.2026): портрет и имя героя
-- NFT, раса — по соответствию, редкость — выпавшая, специализация и способность — случайные.
-- Портрет — картина, вырезанная из карточки NFT (без рамки), один на героя коллекции.
ALTER TABLE yuplink.eth_hov_token ADD COLUMN IF NOT EXISTS race text;
CREATE TABLE IF NOT EXISTS yuplink.eth_hov_hero (
  hero_name text PRIMARY KEY,
  portrait  text NOT NULL
);
