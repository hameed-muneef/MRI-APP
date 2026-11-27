import {describe,expect,it} from 'vitest';
import {suggestionsEnabled} from './types';
import {parseStoredState} from '../state-schema';

describe('suggestions master switch and migration',()=>{
  it('is on when nothing was ever stored',()=>{expect(suggestionsEnabled(undefined)).toBe(true)});
  it('is on for settings that were never touched (no enabledAt)',()=>{expect(suggestionsEnabled({globalEnabled:false})).toBe(true)});
  it('legacy opt-in stays on',()=>{expect(suggestionsEnabled({globalEnabled:true,enabledAt:'2026-11-01'})).toBe(true)});
  it('legacy explicit opt-out stays off',()=>{expect(suggestionsEnabled({globalEnabled:false,enabledAt:'2026-11-01'})).toBe(false)});
  it('explicit mute wins over legacy values',()=>{
    expect(suggestionsEnabled({globalEnabled:true,enabledAt:'2026-11-01',suggestionsMuted:true})).toBe(false);
    expect(suggestionsEnabled({globalEnabled:false,enabledAt:'2026-11-01',suggestionsMuted:false})).toBe(true);
  });
});

describe('suggestionsMuted survives stored-state parsing',()=>{
  it('keeps the flag instead of dropping it',()=>{
    const raw=JSON.stringify({tasks:[],goals:[],wirds:[],reflections:[],lessonStep:0,prayers:{},coachSettings:{globalEnabled:false,suggestionsMuted:true}});
    expect(parseStoredState(raw).coachSettings?.suggestionsMuted).toBe(true);
  });
});
