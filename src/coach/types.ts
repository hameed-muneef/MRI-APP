export type CoachMode = 'inherit' | 'on' | 'off';

export type CoachRecoveryState = {
  startedAt: string;
  dismissedUntil?: string;
  completed?: boolean;
};

export type CoachSettings = {
  globalEnabled: boolean;
  enabledAt?: string;
  recovery?: CoachRecoveryState;
  dismissedWeekly?: string[];
  preferredCapacity?: number;
};

export function resolveCoachFlag(
  itemCoach: {enabled?: boolean; mode?: CoachMode} | undefined,
  settings?: CoachSettings,
): boolean {
  if (!itemCoach) return Boolean(settings?.globalEnabled);
  if (itemCoach.mode === 'off') return false;
  if (itemCoach.mode === 'on') return true;
  if (itemCoach.mode === 'inherit') return Boolean(settings?.globalEnabled);
  return Boolean(itemCoach.enabled);
}
