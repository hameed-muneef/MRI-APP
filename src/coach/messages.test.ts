import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {allCoachMessageSamples,COACH_MESSAGES} from './messages';

// Words that start a question or address the user in a dialogue. Messages state a fact or offer an action.
const QUESTION_WORDS=['هل ','ماذا','لماذا','كيف ','متى ','أين ','من فضلك','أخبرني','اخبرني','أجب','اجب','قل لي','ما رأيك','ما السبب'];

describe('coach message catalog is static and non-conversational',()=>{
  const samples=allCoachMessageSamples();
  it('has messages to scan',()=>{expect(samples.length).toBeGreaterThan(25)});
  it('no message is empty',()=>{for(const {id,text} of samples)expect(text.trim().length,id).toBeGreaterThan(0)});
  it('no message contains a question mark',()=>{for(const {id,text} of samples){expect(text,id).not.toMatch(/[?؟]/)}});
  it('no message opens with or contains a question word or asks for an answer',()=>{
    for(const {id,text} of samples)for(const w of QUESTION_WORDS)expect(text.includes(w),`${id} contains "${w}"`).toBe(false);
  });
  it('samples render identically twice (deterministic)',()=>{expect(allCoachMessageSamples()).toEqual(samples)});
  it('keys are unique and every entry has a sample',()=>{
    const ids=Object.keys(COACH_MESSAGES);
    expect(new Set(ids).size).toBe(ids.length);
    for(const id of ids)expect((COACH_MESSAGES as Record<string,{sample:unknown}>)[id].sample,id).toBeDefined();
  });
});

describe('coach code stays offline and has no free-text input',()=>{
  const dir=join(__dirname);
  const files=readdirSync(dir).filter(f=>/\.(ts|tsx)$/.test(f)&&!f.includes('.test.'));
  const read=(f:string)=>readFileSync(join(dir,f),'utf8');
  it('does not use the network, sockets or speech',()=>{
    for(const f of files)expect(read(f),f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon|SpeechRecognition|speechSynthesis/);
  });
  it('has no text input, textarea or contenteditable in coach UI',()=>{
    for(const f of files.filter(x=>x.endsWith('.tsx')))expect(read(f),f).not.toMatch(/<textarea|type=["']text["']|contentEditable|<input(?![^>]*type=["'](?:checkbox|radio)["'])(?![^>]*role=["']switch["'])/);
  });
  it('does not import AI or chat libraries',()=>{
    for(const f of files)expect(read(f),f).not.toMatch(/from ['"](openai|@anthropic|@google\/generative|ai|langchain)/);
  });
  it('has no randomness or hidden clock in the planning modules',()=>{
    for(const f of ['smart.ts','engine.ts','habit.ts','course.ts','messages.ts'])expect(read(f),f).not.toMatch(/Math\.random|Date\.now\(\)/);
  });
});
