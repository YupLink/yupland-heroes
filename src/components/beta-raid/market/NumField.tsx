// Поле суммы в админке маркета: принимает и «0.1», и «0,1».
//
// Почему не <input type="number">: на андроид-клавиатуре десятичный разделитель
// — запятая, а браузер считает «0,1» невалидным и отдаёт в value ПУСТУЮ строку.
// Владелец вводил цену 0,1, видел её в поле, а в базу уходил ноль (кнопка
// «Сохранить» гасла) или прежняя единица — «в настройках новая, а по факту
// старая». Поэтому поле текстовое с цифровой клавиатурой (inputMode), а разбор
// — свой (parseNum).
import { useRef, useState } from "react";
import { cleanNumText, numTextRu, parseNum } from "./num";

export function NumField({
  value,
  onChange,
  integer,
  signed,
  placeholder,
  className,
}: {
  /** Начальное значение. null — поле пустое (у запаса это «без лимита»). */
  value: number | null;
  onChange: (v: number | null) => void;
  /** Штуки, а не доли: количество в сделке считается целым. */
  integer?: boolean;
  /** Пускать минус: у поля «пополнить» им же запас и убавляют. */
  signed?: boolean;
  placeholder?: string;
  className?: string;
}) {
  // Текст поля живёт здесь, а не приходит сверху: недопечатанное «0,» не число,
  // и прогонять его через родителя значило бы схлопывать запятую на каждом
  // нажатии. Значение сверху берётся только на старте — правок извне у этих
  // полей не бывает: форма товара пересоздаётся при открытии другой позиции.
  const [text, setText] = useState(() => (value == null ? "" : numTextRu(value)));
  /** Последнее отданное наверх число — им же переписываем поле на выходе. */
  const sent = useRef<number | null>(value);

  const commit = (raw: string) => {
    // Буквы с той же клавиатуры прилетают легко, а «1e5» в цене не нужно никому.
    const clean = cleanNumText(raw, { integer, signed });
    setText(clean);
    const parsed = parseNum(clean);
    // Три знака — общий предел точности маркета (столько же режет cartCost).
    // Целое режем trunc, а не floor: у знакового поля floor(−1,5) уехал бы в −2,
    // то есть «убавь на полторы» превратилось бы в «убавь на две».
    const rounded =
      parsed == null ? null : integer ? Math.trunc(parsed) : Math.round(parsed * 1000) / 1000;
    const next = rounded == null ? null : signed ? rounded : Math.max(0, rounded);
    sent.current = next;
    onChange(next);
  };

  return (
    <input
      type="text"
      // На знаковом поле клавиатура ОБЫЧНАЯ: у iOS-раскладки inputMode="decimal"
      // нет минуса вовсе, и «Убавить» с телефона было просто не набрать —
      // кнопка есть, а знак поставить нечем. Цифровую оставляем там, где минус
      // и не нужен (цена, количество, запас).
      inputMode={signed ? "text" : "decimal"}
      value={text}
      placeholder={placeholder}
      onChange={(e) => commit(e.target.value)}
      // На выходе показываем ровно то, что сохранится: «1,5» в целочисленном
      // поле осталось бы висеть полуторой, хотя ушла единица.
      onBlur={() => setText(sent.current == null ? "" : numTextRu(sent.current))}
      className={className}
    />
  );
}
