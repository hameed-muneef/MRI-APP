import {z} from 'zod';
const str=z.string(),num=z.number().finite(),bool=z.boolean();
const channel=z.enum(['in_app','system','both']);
const time=str.regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date=str.regex(/^\d{4}-\d{2}-\d{2}$/);
export const reminderSchema=z.object({
 id:str.min(1),title:str.min(1),scheduled_at:str.refine(s=>Number.isFinite(Date.parse(s))),
 recurrence:z.enum(['none','daily','weekday','weekdays','weekly','monthly','custom','specific_dates']).optional(),
 recurrence_config:z.object({days_of_week:z.array(num.int().min(0).max(6)).optional(),start_date:date.optional(),end_date:date.optional(),specific_dates:z.array(date).optional(),interval_days:num.int().positive().optional()}).optional(),
 user_id:str.optional(),description:str.optional(),sound_id:str.optional(),category:str.optional(),linked_goal_id:str.optional(),linked_task_id:str.optional(),enabled:bool.optional(),alarm_mode:bool.optional(),snooze_until:str.nullable().optional(),created_at:str.optional(),updated_at:str.optional(),
});
export const prefsSchema=z.object({
 user_id:str.optional(),global_enabled:bool.optional(),categories:z.record(str,bool).optional(),dnd_enabled:bool.optional(),updated_at:str.optional(),
 prayer_settings:z.record(str,z.object({enabled:bool.optional(),adhan_type:z.enum(['full','short','silent']).optional(),remind_before_minutes:num.optional(),remind_after_minutes:num.optional(),adjust_minutes:num.optional(),sound_id:str.optional(),channel:channel.optional()})).optional(),
 reminder_settings:z.object({default_sound_id:str.optional(),default_channel:channel.optional(),snooze_minutes:num.positive().optional(),task_notifications:z.object({enabled:bool.optional(),remind_before_minutes:num.optional(),notify_at_time:bool.optional(),include_initial:bool.optional(),include_day_plan:bool.optional(),channel:channel.optional(),sound_id:str.optional()}).optional()}).optional(),
 quiet_hours:z.object({enabled:bool.optional(),start:time.optional(),end:time.optional()}).optional(),
});
