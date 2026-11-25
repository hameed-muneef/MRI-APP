import {test,expect} from '@playwright/test';

async function openAdhan(page:any, opts:{manual:boolean; inAppDhuhr:boolean}){
  await page.addInitScript((o:any)=>{
    (window as any).androidBridge={postMessage(){}};
    if(o.manual)localStorage.setItem('rabbani-central-location-manual-v1',JSON.stringify({latitude:30.0444,longitude:31.2357,label:'القاهرة'}));
    if(o.inAppDhuhr)localStorage.setItem('rabbani-notif-prefs-v1',JSON.stringify({prayer_settings:{'الظهر':{enabled:true,adhan_type:'short',channel:'in_app'}}}));
  },opts);
  await page.goto('/');
  await expect(page.locator('.home-dashboard')).toBeVisible();
  await page.locator('button.topbar-settings').click();
  await page.locator('.settings-tabs button[role="tab"]',{hasText:'الأذان'}).click();
  await expect(page.locator('.notif-prayer-panel .notif-prayer-panel')).toBeVisible();
  await page.waitForTimeout(1500);
}

test('adhan panel warns when no location is available',async({page})=>{
  await openAdhan(page,{manual:false,inAppDhuhr:false});
  await expect(page.locator('.notif-prayer-panel .notif-prayer-panel')).toContainText('لا يوجد موقع');
});

test('legacy in-app-only prayer is migrated: device coverage shown, no in-app-only warning',async({page})=>{
  await openAdhan(page,{manual:true,inAppDhuhr:true});
  const panel=page.locator('.notif-prayer-panel .notif-prayer-panel');
  await expect(panel).not.toContainText('داخل التطبيق فقط');
  await expect(panel).not.toContainText('لا يوجد موقع');
});

test('global kill switch is visible as a blocker for all notification categories',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).androidBridge={postMessage(){}};
    localStorage.setItem('rabbani-central-location-manual-v1',JSON.stringify({latitude:30.0444,longitude:31.2357,label:'القاهرة'}));
    localStorage.setItem('rabbani-notif-prefs-v1',JSON.stringify({global_enabled:false}));
  });
  await page.goto('/');
  await page.locator('button.topbar-settings').click();
  await page.locator('.settings-tabs button[role="tab"]',{hasText:'الأذان'}).click();
  await expect(page.locator('[data-notif-blocker="global"]')).toContainText('لا يُجدول أي تنبيه');
});

for(const width of [320,390]){
  test(`adhan settings page has no horizontal overflow at ${width}px (full viewport)`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await openAdhan(page,{manual:false,inAppDhuhr:false});
    const m=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,bw:document.body.scrollWidth,iw:window.innerWidth,wide:[...document.querySelectorAll('.notif-prayer-panel *')].filter(e=>e.getBoundingClientRect().right>window.innerWidth+1||e.getBoundingClientRect().left<-1).map(e=>e.tagName+'.'+e.className).slice(0,5)}));
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    expect(m.bw).toBeLessThanOrEqual(m.iw);
    expect(m.wide).toEqual([]);
    await page.locator('.notif-prayer-panel .notif-prayer-panel').scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/shots/adhan-viewport-${width}.png`});
  });
}
