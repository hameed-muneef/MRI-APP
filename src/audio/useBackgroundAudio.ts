import { useEffect, useState } from 'react';
import { backgroundAudio } from './background-player';
import type { AudioPlayerState } from './types';

export function useBackgroundAudio(): AudioPlayerState {
  const [state, setState] = useState<AudioPlayerState>(() => backgroundAudio.getState());

  useEffect(() => {
    setState(backgroundAudio.getState());
    return backgroundAudio.subscribe(setState);
  }, []);

  return state;
}
