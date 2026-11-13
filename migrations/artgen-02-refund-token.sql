-- Генератор артефактов (§8.122): метка захвата возврата. Возврат берёт тот, чья
-- метка легла; повтор того же запроса мостом (тот же текст — та же метка) узнаёт
-- свой захват, а не пропускает возврат.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE yuplink.artifact_craft ADD COLUMN IF NOT EXISTS refund_token text;
COMMIT;
