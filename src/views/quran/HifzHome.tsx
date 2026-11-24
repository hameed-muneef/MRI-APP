import {useState} from 'react';
import type {Task, TaskSchedule} from '../../app-state';
import type {QuranAsset} from '../../quran/types';
import type {SessionPurpose} from '../../quran-mastery/types';
import HifzMushafMode from './HifzMushafMode';
import MasteryWorkspace from './MasteryWorkspace';

type Props = {asset: QuranAsset; purpose: SessionPurpose; notify: (text: string) => void; tasks?: Task[]; onTasks?: (t: Task[]) => void; taskSchedules?: Record<string, TaskSchedule>; onTaskSchedules?: (n: Record<string, TaskSchedule>) => void};

// المسار الافتراضي: الصفحة الكاملة أولًا. الجلسة المفصّلة تبقى متاحة من شاشة البداية بلا فقد للبيانات.
export default function HifzHome({asset, purpose, notify, tasks, onTasks, taskSchedules, onTaskSchedules}: Props) {
  const [detailed, setDetailed] = useState(false);
  return detailed
    ? <><button type="button" className="soft-btn" onClick={() => setDetailed(false)}>← الصفحة الكاملة</button><MasteryWorkspace asset={asset} purpose={purpose} notify={notify}/></>
    : <HifzMushafMode asset={asset} notify={notify} tasks={tasks} onTasks={onTasks} taskSchedules={taskSchedules} onTaskSchedules={onTaskSchedules}/>;
}
