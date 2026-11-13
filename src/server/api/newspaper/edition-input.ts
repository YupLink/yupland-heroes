import {z} from 'zod';
import {isNewspaperImageUrl} from '../../../lib/newspaper';
const edition=z.object({title:z.string().trim().min(1).max(120),spreadUrls:z.array(z.string().refine(isNewspaperImageUrl,'newspaper.bad_image')).min(1).max(2)}).strict();
export const newspaperEditionsInput=z.object({ru:edition,en:edition}).strict().refine(v=>v.ru.spreadUrls.length===v.en.spreadUrls.length,'Both languages must contain the same number of spreads');
