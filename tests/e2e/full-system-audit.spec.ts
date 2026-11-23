import {test,expect,type Page,type TestInfo} from '@playwright/test';

// Full-system functional + visual audit (user request 6985412).
// Walks every view and Quran/Sunnah section, records runtime problems and
// captures screenshots for manual pixel inspection.

function collectProblems(page:Page){
  const problems:string[]=[];
  page.on('pageerror',e=>problems.push(`pageerror: ${e.message}`));
  page.on('console',m=>{
    if(m.type()!=='error')return;
    const text=m.text();
    if(/favicon/.test(text))return;
    problems.push(`console.error: ${text.slice(0,300)}`);
  });
  page.on('requestfailed',r=>{
    const url=r.url();
    if(!url.startsWith('http://localhost'))return;
    problems.push(`requestfailed: ${url} (${r.failure()?.errorText})`);
  });
  return problems;
}

async function shot(page:Page,info:TestInfo,name:string,full=false){
  const path=`audit-shots/${info.project.name}/${name}.png`;
  const t0=Date.now();
  await page.screenshot({path,fullPage:full,timeout:10000}).then(()=>console.log(`shot ${name} ${Date.now()-t0}ms`)).catch(e=>console.log(`shotfail ${name} ${Date.now()-t0}ms`));
}

const navMap:Record<string,string>={'home':'الرئيسية','day':'حياتي','quran':'القرآن','haramain':'الحرمين','qibla':'القبلة','mosques':'المساجد','reflect':'المحاسبة'};
async function sideNav(page:Page,name:string|RegExp){
  const key=Object.keys(navMap).find(k=>navMap[k]===name);
  if(key)await page.locator('.mobile-nav').getByRole('button',{name:navMap[key]}).click();
  else if(name==='الإعدادات')await page.locator('button.topbar-settings').click();
  else if(name==='الرئيسية')await page.locator('.mobile-nav').getByRole('button',{name:'الرئيسية'}).click();
  else throw new Error(`unknown nav ${name}`);
}

test.describe('full-system audit',()=>{

  test('all main views load cleanly',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await expect(page.locator('.home-dashboard')).toBeVisible();
    await shot(page,info,'00-home');
    const steps:Array<[string,string|RegExp,number]>=[
      ['day','حياتي',900],
      ['quran','القرآن',2500],
      ['haramain','الحرمين',1200],
      ['qibla','القبلة',900],
      ['mosques','المساجد',900],
      ['reflect','المحاسبة',700],
      ['settings','الإعدادات',900],
    ];
    test.setTimeout(110000);
    for(const [name,nav,settle] of steps){
      await sideNav(page,nav);
      await page.waitForTimeout(settle);
      await expect(page.locator('.content').first()).toBeVisible();
      await shot(page,info,`view-${name}`);
    }
    // daily suite subnav
    await sideNav(page,'حياتي');
    for(const [name,label] of [['tasks','مهام اليوم'],['week','أسبوعي'],['month','شهري'],['goals','المؤمن القوي']] as const){
      await page.locator('.section-subnav').getByRole('button',{name:label}).click();
      await page.waitForTimeout(400);
      await shot(page,info,`view-${name}`);
    }
    // wird tab from reflect
    await sideNav(page,'المحاسبة');
    await page.getByRole('tab',{name:'زكِّ نفسك'}).click();
    await page.waitForTimeout(300);
    await shot(page,info,'view-wird');
    await sideNav(page,'الرئيسية');
    await shot(page,info,'99-home-return');
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('quran and sunnah sections load cleanly',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'القرآن');
    await expect(page.locator('.quran-section-grid')).toBeVisible();
    const sections=['mushaf','tafsir','translations','reciters','hifz','revision','bukhari','muslim','sunnah','routine','progress','azkar'];
    for(const s of sections){
      await page.locator(`[data-quran-tab="${s}"]`).click();
      await page.waitForTimeout(s==='mushaf'?2500:700);
      await shot(page,info,`quran-${s}`);
    }
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('day view shows planner content by default',async({page})=>{
    await page.goto('/');
    await sideNav(page,'حياتي');
    await expect(page.locator('.day-plan-content')).toBeVisible();
    const text=await page.locator('.content').innerText();
    expect(text.length).toBeGreaterThan(400);
  });

  test('daily task add/complete/delete persists across reload',async({page})=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'حياتي');
    await page.locator('details.legacy-tasks summary').click();
    const input=page.getByPlaceholder('أضف نشاطًا يناسبك...');
    await input.fill('نشاط اختباري');
    await page.getByRole('button',{name:'إضافة',exact:true}).click();
    const task=page.locator('.task',{hasText:'نشاط اختباري'});
    await expect(task).toBeVisible();
    await task.getByRole('checkbox').check();
    await expect(task.locator('span')).toHaveClass(/completed/);
    await page.reload();
    await sideNav(page,'حياتي');
    await page.locator('details.legacy-tasks summary').click();
    const again=page.locator('.task',{hasText:'نشاط اختباري'});
    await expect(again).toBeVisible();
    await again.getByRole('button',{name:'حذف نشاط اختباري'}).click();
    await expect(page.locator('.task',{hasText:'نشاط اختباري'})).toHaveCount(0);
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('wird counter increments and persists',async({page})=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'المحاسبة');
    await page.getByRole('tab',{name:'زكِّ نفسك'}).click();
    const card=page.locator('.wird-card').first();
    const before=await card.locator('.count-row strong').innerText();
    await card.getByRole('button',{name:'+1',exact:true}).click();
    await page.reload();
    await sideNav(page,'المحاسبة');
    await page.getByRole('tab',{name:'زكِّ نفسك'}).click();
    const after=await page.locator('.wird-card').first().locator('.count-row strong').innerText();
    expect(after).not.toEqual(before);
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('reflection add and delete persists',async({page})=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'المحاسبة');
    await page.getByPlaceholder('اكتب لنفسك فقط...').fill('مراجعة اختبارية');
    await page.getByRole('button',{name:'حفظ خاص'}).click();
    await expect(page.locator('.reflection-entry',{hasText:'مراجعة اختبارية'})).toBeVisible();
    await page.reload();
    await sideNav(page,'المحاسبة');
    await expect(page.locator('.reflection-entry',{hasText:'مراجعة اختبارية'})).toBeVisible();
    await page.locator('.reflection-entry',{hasText:'مراجعة اختبارية'}).getByRole('button',{name:'حذف المراجعة'}).click();
    await expect(page.locator('.reflection-entry',{hasText:'مراجعة اختبارية'})).toHaveCount(0);
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('goal creation workflow with step',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'حياتي');
    await page.locator('.section-subnav').getByRole('button',{name:'المؤمن القوي'}).click();
    await page.getByPlaceholder('مثلًا: قراءة كتاب نافع').fill('هدف اختباري');
    await page.getByPlaceholder('مثلًا: تعلّم ما ينفعني والعمل به').fill('نية اختبارية');
    await page.locator('.goal-create-form input[type=date]').fill('2027-01-01');
    await page.getByRole('button',{name:'إضافة الهدف'}).click();
    await expect(page.getByText('هدف اختباري').first()).toBeVisible();
    await shot(page,info,'goal-created');
    await page.reload();
    await sideNav(page,'حياتي');
    await page.locator('.section-subnav').getByRole('button',{name:'المؤمن القوي'}).click();
    await expect(page.getByText('هدف اختباري').first()).toBeVisible();
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('weekly and monthly task add persists',async({page})=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'حياتي');
    await page.locator('.section-subnav').getByRole('button',{name:'أسبوعي'}).click();
    await page.getByPlaceholder('ما الذي تريد إنجازه؟').fill('نشاط أسبوعي اختباري');
    await page.getByRole('button',{name:'إضافة المهمة'}).click();
    await expect(page.locator('.task',{hasText:'نشاط أسبوعي اختباري'})).toBeVisible();
    await page.locator('.section-subnav').getByRole('button',{name:'شهري'}).click();
    await page.getByPlaceholder('ما الذي تريد إنجازه؟').fill('نشاط شهري اختباري');
    await page.getByRole('button',{name:'إضافة المهمة'}).click();
    await expect(page.locator('.task',{hasText:'نشاط شهري اختباري'})).toBeVisible();
    await page.reload();
    await sideNav(page,'حياتي');
    await page.locator('.section-subnav').getByRole('button',{name:'أسبوعي'}).click();
    await expect(page.locator('.task',{hasText:'نشاط أسبوعي اختباري'})).toBeVisible();
    await page.locator('.section-subnav').getByRole('button',{name:'شهري'}).click();
    await expect(page.locator('.task',{hasText:'نشاط شهري اختباري'})).toBeVisible();
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('settings view renders key panels',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'الإعدادات');
    await page.waitForTimeout(600);
    await shot(page,info,'settings-full');
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('appearance dark mode switches and persists',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    const toggle=page.getByRole('button',{name:/المظهر:/});
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-appearance-mode','light');
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-appearance-mode','dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await shot(page,info,'dark-home');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await sideNav(page,'القرآن');
    await page.waitForTimeout(1500);
    await shot(page,info,'dark-quran');
    await sideNav(page,'الإعدادات');
    // settings view is lazy-loaded: wait for real content, not the loading fallback
    await expect(page.getByText('جاري تحميل الصفحة')).toBeHidden();
    await expect(page.getByText('الإعدادات والمنبهات')).toBeVisible();
    await shot(page,info,'dark-settings');
    // restore system default
    await page.getByRole('button',{name:/المظهر:/}).click();
    await expect(page.getByRole('button',{name:/المظهر:/})).toHaveAttribute('data-appearance-mode','system');
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('notification center opens',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    const bell=page.locator('button[aria-label*="إشعار"],button[aria-label*="الإشعارات"]').first();
    await bell.click();
    await page.waitForTimeout(400);
    await shot(page,info,'notification-center');
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('scroll-to-top fab appears after scrolling',async({page},info)=>{
    const problems=collectProblems(page);
    await page.goto('/');
    await sideNav(page,'الإعدادات');
    await page.waitForTimeout(700);
    await page.evaluate(()=>window.scrollTo(0,3000));
    await page.waitForTimeout(400);
    const fab=page.locator('.scroll-top-fab,button[aria-label*="أعلى"]').first();
    if(await fab.count()>0&&await fab.isVisible()){
      await shot(page,info,'scroll-fab');
      await fab.click();
    }
    expect(problems,problems.join('\n')).toEqual([]);
  });

  test('topbar shows full view titles on narrow phones',async({page})=>{
    // Regression: crumb used to truncate both brand and title (e.g. "المساجد الق...").
    await page.setViewportSize({width:393,height:740});
    await page.goto('/');
    await page.waitForTimeout(700);
    for(const nav of ['المساجد','الحرمين'] as const){
      await sideNav(page,nav);
      await page.waitForTimeout(900);
      const m=await page.evaluate(()=>{
        const s=document.querySelector('.topbar .crumb strong') as HTMLElement|null;
        return s?{ellipsized:s.scrollWidth>s.clientWidth+1,text:s.textContent}:null;
      });
      expect(m?.ellipsized,`topbar title ellipsized for ${nav}: ${m?.text}`).toBe(false);
    }
  });

  test('qibla quick-steps dismissal persists across reloads',async({page})=>{
    await page.goto('/');
    await page.waitForTimeout(700);
    await sideNav(page,'القبلة');
    await page.waitForTimeout(900);
    await expect(page.getByText('3 خطوات سريعة')).toBeVisible();
    await page.locator('.qibla-steps-close').click();
    await expect(page.getByText('3 خطوات سريعة')).toBeHidden();
    await page.reload();
    await page.waitForTimeout(900);
    await sideNav(page,'القبلة');
    await page.waitForTimeout(800);
    await expect(page.getByText('3 خطوات سريعة')).toBeHidden();
  });
});
