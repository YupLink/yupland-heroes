// Витрина, которую правит админ, — лавка построек (lib/buildingSale)? Тогда в
// форме товара только вид «Постройка», а в обычной лавке его нет. Контекстом,
// а не пропом: форма товара открывается и из строки витрины, и кнопкой «+».
import { createContext, useContext } from "react";

export const BuildingShopContext = createContext(false);

export const useBuildingShop = (): boolean => useContext(BuildingShopContext);
