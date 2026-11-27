import {describe,expect,it} from 'vitest';
import {buildCoachHomeSummary,buildSmartTodayPlan,buildWeeklyReport,freePrayerSlots} from './smart';

const pr={'الفجر':'05:00','الشروق':'06:25','الظهر':'12:00','العصر':'15:15','المغرب':'17:35','العشاء':'19:00'};
const times=['2026-11-26T00:00:00','2026-11-26T04:59:00','2026-11-26T23:59:00','2026-12-31T23:59:59','2027-01-01T00:00:00'];

describe('smart coach edge cases',()=>{
  for(const t of times){
    it(`empty data at ${t}`,()=>{
      const input={goals:[],tasks:[],now:new Date(t)};
      expect(()=>buildSmartTodayPlan(input)).not.toThrow();
      expect(()=>buildWeeklyReport(input)).not.toThrow();
      expect(()=>buildCoachHomeSummary(input)).not.toThrow();
      expect(()=>buildSmartTodayPlan({...input,prayers:pr,coachSettings:{globalEnabled:true,enabledAt:'2026-11-01'}})).not.toThrow();
    });
  }
  it('bad prayer times do not crash',()=>{
    const input={goals:[],tasks:[],now:new Date('2026-11-26T10:00:00'),prayers:{'الفجر':'bad','الظهر':'','العصر':'25:99'} as Record<string,string>,coachSettings:{globalEnabled:true,enabledAt:'2026-11-01'}};
    expect(()=>buildSmartTodayPlan(input)).not.toThrow();
    expect(()=>freePrayerSlots({prayers:input.prayers,now:input.now} as never)).not.toThrow();
  });
  it('summary is finite',()=>{
    const s=buildCoachHomeSummary({goals:[],tasks:[],now:new Date('2026-11-26T10:00:00')});
    expect(s.subtitle.length).toBeGreaterThan(0);
    const w=buildWeeklyReport({goals:[],tasks:[],now:new Date('2026-11-26T10:00:00'),coachSettings:{globalEnabled:true,enabledAt:'2026-11-01'}});
    expect(Number.isNaN(w.overallRate as number)).toBe(false);
  });
});
