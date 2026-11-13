// «Корона гречневого королевства» на сцене замка: дано, а не куплено — встаёт на своё
// место сразу (autoPlace), положение редактируется и сохраняется в раскладке.
// Кому видно — решает сессия (admin или право «buckwheat»), лишнего запроса нет. Игрокам
// в замке не ставим (владелец 08.11): им — только постройка на карте с поведением игры.
import {useMemo} from 'react';
import {withOwnedLayout} from './modularOwnedLayout';
import {BUCKWHEAT_GAME_BUILDING_ID,buckwheatGameBuilding,relocateLegacyBuckwheatGame} from './modularBuckwheatGame';
import type {SceneBuilding} from './modularCastleLayout';

export function useWithBuckwheatGame(list:SceneBuilding[],allowed:boolean):SceneBuilding[]{
 return useMemo(()=>relocateLegacyBuckwheatGame(withOwnedLayout(list,BUCKWHEAT_GAME_BUILDING_ID,buckwheatGameBuilding(allowed),true)),[list,allowed]);
}
