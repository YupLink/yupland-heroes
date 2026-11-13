// Presentation-only limits shared by editor, decoder and save validation.
export const CASTLE_PLACEMENT = { left: -2600, right: 3400, back: 330, front: 1500 } as const;
export const BUILDING_SCALE_MAX = 10;
export const BUILDING_BASE_MAX = 600;
export const BUILDING_SIZE_MAX = BUILDING_BASE_MAX * BUILDING_SCALE_MAX;
export const NEW_BUILDING_SIZE = 330;
