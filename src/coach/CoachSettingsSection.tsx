import {Sparkles} from 'lucide-react';
import {localGoalDate} from '../goal-plan';
import {COACH_MESSAGES as M} from './messages';
import {setSuggestionsEnabled,suggestionsEnabled,type CoachSettings} from './types';

/** Settings entry for the single master switch of in-screen suggestions. Static text only. */
export default function CoachSettingsSection({coachSettings,onCoachSettings}:{coachSettings?:CoachSettings;onCoachSettings:(settings:CoachSettings)=>void}){
  const on=suggestionsEnabled(coachSettings);
  return <section className="panel" aria-label={M.settingsSuggestionsTitle.text({})}>
    <h3><Sparkles size={18}/> {M.settingsSuggestionsTitle.text({})}</h3>
    <p className="muted">{M.settingsSuggestionsAbout.text({})}</p>
    <label className="goal-coach-switch">
      <input type="checkbox" role="switch" aria-label={M.settingsSuggestionsTitle.text({})} checked={on} onChange={e=>onCoachSettings(setSuggestionsEnabled(coachSettings,e.target.checked,localGoalDate(new Date())))}/>
      <span>{on?M.settingsSuggestionsOn.text({}):M.settingsSuggestionsOff.text({})}</span>
    </label>
  </section>;
}
