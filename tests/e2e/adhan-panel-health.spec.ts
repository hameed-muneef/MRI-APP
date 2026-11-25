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
  await page.locator('.notif-prayer-panel .notif-prayer-panel').screenshot({path:'/tmp/shots/adhan-no-location.png'});
});

test('adhan panel shows coverage, in-app-only warning and explicit opt-in without auto changes',async({page})=>{
  await openAdhan(page,{manual:true,inAppDhuhr:true});
  const panel=page.locator('.notif-prayer-panel .notif-prayer-panel');
  await expect(panel).toContainText('داخل التطبيق فقط');
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-notif-prefs-v1')||'{}').prayer_settings['الظهر'].channel);
  expect(before).toBe('in_app');
  await panel.screenshot({path:'/tmp/shots/adhan-in-app-warning.png'});
  await panel.getByRole('button',{name:/تفعيل الأذان في الخلفية/}).click();
  await expect(panel).not.toContainText('داخل التطبيق فقط');
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-notif-prefs-v1')||'{}').prayer_settings['الظهر'].channel);
  expect(after).toBe('both');
  await panel.screenshot({path:'/tmp/shots/adhan-after-optin.png'});
});
