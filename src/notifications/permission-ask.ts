// قرار واحد لطلب إذن إشعارات النظام: يُطلب تلقائيًا مرة واحدة، ويُعاد الطلب من زر صريح.
// كان الشرط السابق يمنع إعادة الطلب حتى من الزر، فيبدو الزر بلا أثر عند المستخدم.
export type PermissionAskState = {
  /** حالة الإذن الحالية كما يراها النظام أو المتصفح. */
  permission: 'granted' | 'denied' | 'default' | 'unsupported';
  /** هل سبق أن طلب التطبيق الإذن تلقائيًا؟ */
  asked: boolean;
  /** ask=false: قراءة الحالة فقط دون أي نافذة. */
  ask?: boolean;
  /** force=true: فعل صريح من المستخدم (زر) يسمح بإعادة الطلب. */
  force?: boolean;
};

export function shouldRequestPermission(state: PermissionAskState): boolean {
  if (state.permission !== 'default') return false;
  if (state.ask === false) return false;
  if (state.asked && !state.force) return false;
  return true;
}
