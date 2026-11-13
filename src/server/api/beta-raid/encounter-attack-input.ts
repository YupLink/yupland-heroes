// Что клиент присылает в удар энкаунтера (encounter-attack): цель, клетка и
// состав отряда. Только схема zod — модуль едет и в клиентскую сборку вместе
// с валидатором server fn, поэтому серверных импортов здесь быть не должно.
import { z } from "zod";

const lineupSchema = z
  .array(
    z.object({
      templateId: z.string().min(1),
      // Уровни дробные (1.5/2.5/…) — .int() тут ломал бы отряд.
      level: z.number(),
      training: z.boolean().optional(),
      // chipId сознательно НЕ принимаем: экземпляр подбирает сервер. Иначе
      // «тренировочной» фишкой с чужим id можно было повесить оглушение на
      // фишку другого игрока — они видны в маркете.
      //
      // trainingId — другое дело: это id из hallway_training_chips, отдельной
      // коллекции прихожей, и без него триал-фишку нечем проверить. Раньше
      // флаг training верили на слово, и в бой выходили десять пятизвёзд у
      // кошелька с пустым инвентарём.
      trainingId: z.string().min(1).max(64).optional(),
      serialNo: z.number().nullable().optional(),
    }),
  )
  .max(10);

export const attackInputSchema = z.object({
  objectId: z.string().min(1),
  q: z.number().int(),
  r: z.number().int(),
  lineup: lineupSchema.optional(),
});

export type AttackInput = z.infer<typeof attackInputSchema>;
