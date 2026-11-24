import {useState} from 'react';
import type {QuranAsset} from '../../quran/types';
import type {SessionPurpose} from '../../quran-mastery/types';
import HifzMushafMode from './HifzMushafMode';
import MasteryWorkspace from './MasteryWorkspace';

type Props = {asset: QuranAsset; purpose: SessionPurpose; notify: (text: string) => void};

// المسار الافتراضي: الصفحة الكاملة أولًا. الجلسة المفصّلة تبقى متاحة من شاشة البداية بلا فقد للبيانات.
export default function HifzHome({asset, purpose, notify}: Props) {
  const [detailed, setDetailed] = useState(false);
  return detailed
    ? <><button type="button" className="soft-btn" onClick={() => setDetailed(false)}>← الصفحة الكاملة</button><MasteryWorkspace asset={asset} purpose={purpose} notify={notify}/></>
    : <HifzMushafMode asset={asset} notify={notify} onDetailed={() => setDetailed(true)}/>;
}
