import {NewspaperFrame} from './NewspaperFrame';
import {NewspaperKiosk} from './NewspaperKiosk';
export function NewspaperKioskOverlay({onClose}:{onClose:()=>void}){
 return <NewspaperFrame><NewspaperKiosk onBack={onClose}/></NewspaperFrame>;
}
