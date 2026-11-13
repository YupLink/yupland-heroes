import {MineBuildingsWindow} from '../mine-buildings/MineBuildingsWindow';
export function MineOfficeModal({onClose}:{onClose:()=>void;icon:string}){
 return <MineBuildingsWindow entry="mine_office" onClose={onClose}/>;
}
