// ما يُعرض في مركز الإشعارات: الجرس يبقى ظاهرًا دائمًا، وحالة اللوحة تتبع تفضيل المستخدم.
// إخفاء الجرس كان يمنع الوصول إلى الإشعارات نهائيًا عند إيقاف التفضيل من الإعدادات.
export type NotificationCenterVisibility = {
  /** الجرس ظاهر دائمًا حتى يستطيع المستخدم الوصول إلى الإشعارات أو إعادة تفعيلها. */
  bell: boolean;
  /** 'preferences-off' تعني أن اللوحة تعرض حالة الإيقاف وطريق العودة إلى الإعدادات. */
  panel: 'ready' | 'preferences-off';
};

export function notificationCenterVisibility(
  preferences?: Record<string, unknown> | null,
): NotificationCenterVisibility {
  return {
    bell: true,
    panel: preferences?.enabled === false ? 'preferences-off' : 'ready',
  };
}
