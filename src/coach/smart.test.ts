import {describe,expect,it} from 'vitest';
import type {AchievementEntry} from '../achievement/log';
import type {Task,TaskSchedule,Wird} from '../app-state';
import type {DayPlan} from '../DayPlanner';
import type {DayRecords} from '../day-tracking';
import type {Goal} from '../goal-plan';
import {storedStateSchema} from '../state-schema';
import {courseCoachOn,recordCourseCompletions,todayList} from './course';
import {coachOn,finishedKeys,suggestionsFor} from './engine';
import {habitOn,recordHabitCompletions} from './habit';
import {
  analyzePatterns,
  analyzeQuranCoach,
  analyzeRecovery,
  buildCoachHomeSummary,
  buildSmartTodayPlan,
  buildWeeklyReport,
  freePrayerSlots,
} from './smart';
import type {CoachSettings} from './types';

const now=new Date('2026-11-26T08:00:00');
const prayers={
  'الفجر':'05:00',
  'الشروق':'06:25',
  'الظهر':'12:00',
  'العصر':'15:15',
  'المغرب':'17:35',
  'العشاء':'19:00',
};

const mkGoal=(id:string,doneKeys:string[],extra:Partial<Goal>={}):Goal=>({
  id,
  title:`هدف ${id}`,
  benefit:'منفعة',
  createdAt:'2026-09-01',
  steps:[{id:`s-${id}`,title:`خطوة ${id}`,period:'daily',done:Object.fromEntries(doneKeys.map(k=>[k,true]))}],
  ...extra,
});

describe('smart coach engine',()=>{
  it('honors global activation with per-item inherit, on, and off overrides',()=>{
    const globalOn:CoachSettings={globalEnabled:true,enabledAt:'2026-09-01'};
    const untouchedGoal=mkGoal('g1',[]);
    const optedOutGoal=mkGoal('g2',[],{coach:{enabled:false,enabledAt:'2026-09-01',mode:'off'}});
    const legacyOffGoal=mkGoal('g3',[],{coach:{enabled:false,enabledAt:'2026-09-01'}});
    const optedInGoal=mkGoal('g4',[],{coach:{enabled:true,enabledAt:'2026-09-01',mode:'on'}});

    expect(coachOn(untouchedGoal,globalOn)).toBe(true);
    expect(coachOn(optedOutGoal,globalOn)).toBe(false);
    expect(coachOn(legacyOffGoal,globalOn)).toBe(false);
    expect(coachOn(optedInGoal,{globalEnabled:false})).toBe(true);
    expect(coachOn(untouchedGoal,{globalEnabled:false})).toBe(false);

    const w:Wird={id:'w1',title:'استغفار',target:100,count:100,period:'daily',periodKey:'2026-11-26'};
    expect(habitOn(w,globalOn)).toBe(true);
    const logged=recordHabitCompletions([w],now,globalOn);
    expect(logged[0].coach?.log).toEqual(['2026-11-26']);

    const planTask:Task={id:'bilquran:p1:d',title:'ورد اليوم',period:'daily',done:true,optional:false,doneKey:'2026-11-26',plan:{planId:'p1',kind:'day'}};
    expect(courseCoachOn(undefined,globalOn)).toBe(true);
    const cNext=recordCourseCompletions(undefined,[planTask],now,globalOn);
    expect(cNext?.log?.day).toEqual(['2026-11-26']);
    expect(todayList([untouchedGoal,optedOutGoal],[],undefined,now,[],globalOn).map(i=>i.goalId)).toEqual(['g1']);
  });

  it('finds free prayer intervals and subtracts busy dayPlan and taskSchedules blocks',()=>{
    const dayPlan:DayPlan={
      workStart:'08:30',
      sleep:'23:00',
      activities:{
        'after-asr-0':[{id:'busy1',title:'درس',timing:{anchor:'العصر',offset:25},duration:45,scheduleStatus:'confirmed'}],
      },
      completed:{},
    };
    const taskSchedules:Record<string,TaskSchedule>={
      t1:{title:'مراجعة',sourceLabel:'قرآن',confirmedDate:'2026-11-26',confirmedTime:'18:05'},
    };
    const slots=freePrayerSlots({prayers,dayPlan,taskSchedules,dateKey:'2026-11-26',now});
    expect(slots.some(s=>s.id==='before-fajr')).toBe(false); // already past 08:00
    const duha=slots.find(s=>s.id==='duha');
    expect(duha).toBeDefined();
    expect(duha!.inWorkHours).toBe(true);
    const asr=slots.find(s=>s.id==='after-asr');
    expect(asr).toBeDefined();
    // Confirmed 45m activity started at 15:40 -> ends 16:25; Maghrib - 15 is 17:20 -> free starts at 16:25
    expect(asr!.startTime).toBe('16:25');
    expect(asr!.inWorkHours).toBe(false);

    // Fallback when prayers missing
    const fallback=freePrayerSlots({prayers:{},dateKey:'2026-11-26',now});
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback[0].estimated).toBe(true);
  });

  it('detects peak time window, weakest weekday, and daily capacity from logs',()=>{
    const achievementLog:AchievementEntry[]=[
      {id:'1',kind:'adhkar_category',date:'2026-11-25',refId:'a',at:'2026-11-25T16:10:00'},
      {id:'2',kind:'adhkar_category',date:'2026-11-24',refId:'b',at:'2026-11-24T16:30:00'},
      {id:'3',kind:'wird_complete',date:'2026-11-23',refId:'w',at:'2026-11-23T15:50:00'},
    ];
    // Give consistent completions except Thursday (Nov 19, 2026 was Thursday -> getDay()===4)
    const activeDates=['2026-11-25','2026-11-24','2026-11-23','2026-11-22','2026-11-21','2026-11-20'];
    const dayRecords:DayRecords=Object.fromEntries(
      activeDates.map(d=>[d,{date:d,savedAt:`${d}T16:00:00`,items:Array.from({length:5},(_,i)=>({id:`it-${i}`,title:'عمل',period:'عصر',start:'16:00',end:'16:30',startDay:'',endDay:'',duration:30,status:'done' as const}))}]),
    );
    const p=analyzePatterns({goals:[],wirds:[],dayRecords,achievementLog,now});
    expect(p.peakWindow).toBe('afternoon');
    expect(p.bestPrayerSlotId).toBe('after-asr');
    expect(p.estimatedCapacity).toBe(6);
    expect(p.weakestWeekday).toBe(4);
    expect(p.weakestWeekdayLabel).toBe('الخميس');
  });

  it('triggers 3-day quiet recovery at half load after >=3 missed days and respects day progression & dismissal',()=>{
    const g=mkGoal('g1',['2026-11-20']); // last active Nov 20, now Nov 26 -> gap 5 full days
    const r1=analyzeRecovery({goals:[g],normalCapacity:6,now});
    expect(r1.active).toBe(true);
    expect(r1.gapDays).toBe(5);
    expect(r1.dayNumber).toBe(1);
    expect(r1.dailyLimit).toBe(3); // 50% of 6

    const day2Settings:CoachSettings={globalEnabled:true,recovery:{startedAt:'2026-11-25'}};
    const r2=analyzeRecovery({goals:[mkGoal('g1',['2026-11-25'])],normalCapacity:6,coachSettings:day2Settings,now});
    expect(r2.active).toBe(true);
    expect(r2.dayNumber).toBe(2);
    expect(r2.dailyLimit).toBe(3);

    const dismissedSettings:CoachSettings={globalEnabled:true,recovery:{startedAt:'2026-11-25',dismissedUntil:'2026-11-26'}};
    const rDismissed=analyzeRecovery({goals:[g],normalCapacity:6,coachSettings:dismissedSettings,now});
    expect(rDismissed.active).toBe(false);
  });

  it('prioritizes Quran consolidation when weak/overdue passages accumulate',()=>{
    const tasks:Task[]=[
      {id:'bilquran:p1:d',title:'حفظ جديد',period:'daily',done:false,optional:false,plan:{planId:'p1',kind:'day'}},
      {id:'bilquran:p1:w',title:'مراجعة الربط',period:'weekly',done:false,optional:false,plan:{planId:'p1',kind:'week'}},
    ];
    const insight=analyzeQuranCoach({
      quranPassages:[
        {id:'q1',contentType:'quran',surah:2,ayahStart:1,ayahEnd:5,state:'needs_revision',ease:2.2,intervalDays:1,dueDate:'2026-11-20',reviewCount:2,lapses:2,createdAt:'2026-11-01',updatedAt:'2026-11-20'},
        {id:'q2',contentType:'quran',surah:2,ayahStart:6,ayahEnd:10,state:'needs_revision',ease:2.2,intervalDays:1,dueDate:'2026-11-22',reviewCount:2,lapses:1,createdAt:'2026-11-01',updatedAt:'2026-11-22'},
        {id:'q3',contentType:'quran',surah:2,ayahStart:11,ayahEnd:15,state:'learning',ease:2.5,intervalDays:2,dueDate:'2026-11-24',reviewCount:1,lapses:0,createdAt:'2026-11-01',updatedAt:'2026-11-24'},
      ],
      tasks,
      now,
    });
    expect(insight.shouldConsolidateFirst).toBe(true);
    expect(insight.weakCount).toBe(2);
    expect(insight.overdueReviews).toBe(3);
    expect(insight.topDueTaskId).toBe('bilquran:p1:w');
  });

  it('builds a smart today plan capping overload during recovery and generates weekly report + home summary',()=>{
    const coachSettings:CoachSettings={globalEnabled:true,enabledAt:'2026-09-01'};
    const goals:Goal[]=[
      mkGoal('g1',['2026-11-10'],{targetDate:'2026-12-01'}),
      mkGoal('g2',['2026-11-10']),
      mkGoal('g3',['2026-11-10']),
      mkGoal('g4',['2026-11-10']),
      mkGoal('g5',['2026-11-10']),
    ];
    const plan=buildSmartTodayPlan({
      goals,
      tasks:[],
      wirds:[],
      coachSettings,
      prayers,
      dayPlan:{workStart:'08:00',sleep:'23:00',activities:{},completed:{}},
      masteryRoot:null,
      now,
    });
    expect(plan.recovery.active).toBe(true);
    expect(plan.budget).toBe(2); // 50% of default 4
    expect(plan.recommended.length).toBe(2);
    expect(plan.deferred.length).toBe(3);
    expect(plan.recommended[0].suggestedSlot?.inWorkHours).toBe(false);
    expect(plan.coldStart.some(c=>c.kind==='unscheduled-today')).toBe(true);

    const report=buildWeeklyReport({goals:[mkGoal('g1',finishedKeys('daily',now,7).slice(5))],tasks:[],coachSettings,now});
    expect(report.overallExpected).toBe(7);
    expect(report.overallDone).toBe(2);
    expect(report.recommendations.some(r=>r.kind==='goal-suggestion'&&r.actionable)).toBe(true);
    expect(suggestionsFor(goals[0],now,coachSettings).length).toBeGreaterThan(0);

    const home=buildCoachHomeSummary({goals,tasks:[],coachSettings,prayers,masteryRoot:null,now});
    expect(home.anyActive).toBe(true);
    expect(home.recoveryActive).toBe(true);
    expect(home.subtitle).toContain('عودة هادئة');
  });

  it('validates coachSettings and mode overrides in state schema',()=>{
    const payload={
      tasks:[],
      goals:[{id:'g1',title:'هدف',benefit:'نية',coach:{enabled:false,enabledAt:'2026-11-26',mode:'off'}}],
      wirds:[{id:'w1',title:'ورد',target:10,count:0,period:'daily',periodKey:'2026-11-26',coach:{enabled:true,enabledAt:'2026-11-26',mode:'inherit'}}],
      coachSettings:{globalEnabled:true,enabledAt:'2026-11-26',recovery:{startedAt:'2026-11-26'},dismissedWeekly:['x']},
      prayers:{},
    };
    const parsed=storedStateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});
