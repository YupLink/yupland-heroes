-- Владение NFT по своему индексатору (владелец, 02.11.2026: «у кого какая NFT — через индексатор,
-- чтобы работало»). Владелец токена = последнее событие его контракта (mint/transfer → получатель,
-- burn → никто). Старт — снимок yuplink.nfts (его каждый день в 05:00 заполняет Sendler), поверх —
-- события chain_nft; дальше индексатор двигает владельца той же записью, что и событие. Узнать
-- «что у игрока» / «у кого NFT X» — запрос к этой таблице, без сети.
SET lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS yuplink.chain_nft_owner (
  contract  text NOT NULL,
  token_id  text NOT NULL,
  owner     text,                         -- NULL — сожжена
  title     text,                         -- название (metadata.title); новые дочитывает индексатор
  height    bigint NOT NULL DEFAULT 0,    -- блок последнего события (0 — из снимка)
  at        timestamptz,
  PRIMARY KEY (contract, token_id)
);
CREATE INDEX IF NOT EXISTS chain_nft_owner_owner ON yuplink.chain_nft_owner (owner, contract);
CREATE INDEX IF NOT EXISTS chain_nft_owner_title ON yuplink.chain_nft_owner (contract, title);

-- Снимок: всё, что знает каталог.
INSERT INTO yuplink.chain_nft_owner (contract, token_id, owner, title, height)
SELECT n.contract_id, n.token_id, n.owner_wallet, NULLIF(n.name, ''), 0 FROM yuplink.nfts n
ON CONFLICT (contract, token_id) DO NOTHING;

-- Поверх — уже собранные события (последнее по каждой NFT).
INSERT INTO yuplink.chain_nft_owner (contract, token_id, owner, height, at)
SELECT DISTINCT ON (e.contract, e.token_id) e.contract, e.token_id,
       CASE WHEN e.event = 'burn' THEN NULL ELSE e.to_id END, e.block_height, e.block_at
  FROM yuplink.chain_nft e
 ORDER BY e.contract, e.token_id, e.block_height DESC, e.id DESC
ON CONFLICT (contract, token_id) DO UPDATE
   SET owner = EXCLUDED.owner, height = EXCLUDED.height, at = EXCLUDED.at
 WHERE EXCLUDED.height >= yuplink.chain_nft_owner.height;

-- Магазин NFT перечитать за неделю (снимок может быть старше суток): курсор адреса долой —
-- индексатор начнёт его заново с недели назад; разобранное не задвоится (chain_tx_seen).
DELETE FROM yuplink.chain_cursor WHERE name = 'acct:yuplandshop.mintbase1.near';
