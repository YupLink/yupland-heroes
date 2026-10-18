export type MapView = { x: number; y: number; zoom: number };
export type Point = { x: number; y: number };
export const INITIAL_VIEW: MapView = { x: 0, y: 0, zoom: 1 };
export function clampView(view: MapView): MapView {
  const zoom = Math.max(1, Math.min(6, view.zoom));
  const limit = 160 * (zoom - 1) + 100;
  return { zoom, x: Math.max(-limit, Math.min(limit, view.x)), y: Math.max(-limit, Math.min(limit, view.y)) };
}
export function zoomAt(view: MapView, factor: number, from: Point, to = from): MapView {
  const zoom = Math.max(1, Math.min(6, view.zoom)), next = Math.max(1, Math.min(6, zoom * factor));
  return clampView({ zoom: next, x: to.x - 160 - (from.x - 160 - view.x) * next / zoom, y: to.y - 160 - (from.y - 160 - view.y) * next / zoom });
}
export function project(point: Point, view: MapView): Point {
  return { x: (point.x - 160) * view.zoom + 160 + view.x, y: (point.y - 160) * view.zoom + 160 + view.y };
}
export function unproject(point: Point, view: MapView): Point {
  return { x: (point.x - 160 - view.x) / view.zoom + 160, y: (point.y - 160 - view.y) / view.zoom + 160 };
}
