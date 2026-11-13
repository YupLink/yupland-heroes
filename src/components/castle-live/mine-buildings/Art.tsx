import { marketResourceIconSrc } from '@/lib/resourceIcons';
import {resNames,type Kind,type Lang} from './presentation';
import scenes from './assets/map-scenes.webp';
import wood from './assets/sawmill.webp';
import stone from './assets/stone-mine.webp';
import gold from './assets/gold-mine.webp';
import diamonds from './assets/diamond-mine.webp';
export const blueprintArt={wood,stone,gold,diamonds};
export function Art({kind}:{kind:Kind}){const [x,y]={diamonds:[0,0],stone:[627,0],wood:[0,627],gold:[627,627]}[kind];return <svg className="mb-art map" aria-hidden="true" viewBox={`${x} ${y} 627 627`} preserveAspectRatio="xMidYMid slice"><image href={scenes} width={1254} height={1254}/></svg>}
export function Resource({kind,lang='ru',decorative=false}:{kind:Kind;lang?:Lang;decorative?:boolean}){return <img className="mb-resource" src={marketResourceIconSrc(kind)??undefined} alt={decorative?'':resNames[lang][kind]}/>}
