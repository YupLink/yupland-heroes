-- Турниры, этап 3 (владелец, 04.10.2026): цена записи — у каждого турнира своя.
--
-- «В каждом турнире сделать цену записи — на выбор что угодно ставит админ;
-- текущие — 5 золота, по умолчанию тоже 5 золота». Цена — строки как у портала
-- (PortalPrice: ресурс/токен/товар + сколько), берутся ВСЕ разом; пустой
-- список — запись бесплатная.
--
-- Запись теперь в два шага (tour-entry.ts): строка tournament_entry с
-- paid=false → плата (resource-pay, вид res_ledger 'tour_fee') → paid=true.
-- Очки и число участников считаются только по оплаченным (paid). Уже
-- записанные строки оплачены 5 золотом одним оператором — по умолчанию paid=true.
--
-- price — что взяли при записи (снимок цены турнира); pay_ref — ключ платежа
-- попытки (у каждой свой: откаченный ключ повторно не списывается — запись
-- вышла бы бесплатной); pay_wallet — кто платил. Зависшую неоплаченную строку
-- (попытка оборвалась между платой и отметкой) разбирают по журналам этого
-- ключа и возвращают списанное этому кошельку (tour-entry-settle.ts) — без
-- кошелька часам турниров вернуть плату некому.
ALTER TABLE yuplink.tournament
  ADD COLUMN IF NOT EXISTS entry_price jsonb NOT NULL DEFAULT '[{"resource":"gold","amount":5}]'::jsonb;

ALTER TABLE yuplink.tournament_entry
  ADD COLUMN IF NOT EXISTS paid    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price   jsonb,
  ADD COLUMN IF NOT EXISTS pay_ref text,
  ADD COLUMN IF NOT EXISTS pay_wallet text;
