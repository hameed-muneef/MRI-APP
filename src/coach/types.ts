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
  /** Explicit master switch for in-screen suggestions. true = the user turned suggestions off. Unset = follow the legacy rule. */
  suggestionsMuted?: boolean;
};

/**
 * Master switch for suggestions shown inside the normal screens.
 * - Explicit choice (suggestionsMuted set) always wins.
 * - Legacy opt-out: a user who touched the old activation switch (enabledAt set) and left it off stays off.
 * - Legacy opt-in: globalEnabled true stays on.
 * - Never touched (no settings, or no enabledAt): on by default.
 */
export function suggestionsEnabled(settings?: CoachSettings): boolean {
  if (!settings) return true;
  if (settings.suggestionsMuted !== undefined) return !settings.suggestionsMuted;
  if (settings.globalEnabled) return true;
  return !settings.enabledAt;
}

/**
 * Default-on migration. Settings that were never touched (no enabledAt, no explicit choice)
 * become "on" from today, so existing logic that reads globalEnabled/enabledAt keeps working.
 * Explicit opt-outs (enabledAt set, or suggestionsMuted set) are never changed.
 * Returns the same object when nothing changes.
 */
export function migrateSuggestionsDefault(settings: CoachSettings | undefined, todayKey: string): CoachSettings | undefined {
  if (settings && (settings.enabledAt || settings.suggestionsMuted !== undefined)) return settings;
  return {...(settings ?? {}), globalEnabled: true, enabledAt: todayKey, suggestionsMuted: false};
}

/** The one master switch. Keeps globalEnabled in step so older code paths agree. Never touches goals, targets or schedules. */
export function setSuggestionsEnabled(settings: CoachSettings | undefined, on: boolean, todayKey: string): CoachSettings {
  return {...(settings ?? {globalEnabled: on}), globalEnabled: on, enabledAt: settings?.enabledAt ?? todayKey, suggestionsMuted: !on};
}

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
