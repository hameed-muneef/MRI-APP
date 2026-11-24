import type {RecordingMeta} from './types';
export type RecorderStatus = 'idle'|'requesting'|'recording'|'stopped'|'unsupported'|'denied';
export type RecorderEvent = {kind: 'started'|'stopped'|'discarded'|'saved'|'unsupported'|'denied'; reason?: string};
type Stream = {getTracks: () => {stop: () => void}[]};
type Recorder = {mimeType?: string; ondataavailable: ((e: {data: Blob}) => void)|null; onstop: (() => void)|null; start: () => void; stop: () => void};
export type RecorderDeps = {
  getUserMedia: () => Promise<Stream>; createRecorder: (stream: Stream) => Recorder;
  createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void;
  onBackground?: (handler: () => void) => () => void;
  onEvent?: (event: RecorderEvent) => void; now?: () => number;
};
/** Owns every track, pending permission request, callback, blob and object URL. No network writes. */
export class SessionRecorder {
  private stream: Stream|null = null;
  private recorder: Recorder|null = null;
  private chunks: Blob[] = [];
  private blob: Blob|null = null;
  private url = '';
  private startedAt = 0;
  private durationMs = 0;
  private generation = 0;
  private removeBackground: (() => void)|null = null;
  status: RecorderStatus = 'idle';
  constructor(private deps: RecorderDeps) {}
  private now() { return this.deps.now?.() ?? Date.now(); }
  snapshot() {return {status: this.status, url: this.url, mimeType: this.blob?.type ?? '', durationMs: this.status === 'recording' ? this.now()-this.startedAt : this.durationMs};}
  async start(): Promise<RecorderStatus> {
    if (this.status === 'recording' || this.status === 'requesting') return this.status;
    this.discard('replace');
    const generation = ++this.generation;
    this.status = 'requesting';
    this.removeBackground = this.deps.onBackground?.(() => this.discard('background')) ?? null;
    try {
      const stream = await this.deps.getUserMedia();
      if (generation !== this.generation) {stream.getTracks().forEach(t => t.stop()); return this.status;}
      this.stream = stream;
      const recorder = this.deps.createRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = e => {if (generation === this.generation && e.data.size) this.chunks.push(e.data);};
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        this.durationMs = Math.max(0,this.now()-this.startedAt);
        this.blob = new Blob(this.chunks,{type:recorder.mimeType || 'audio/webm'});
        this.url = this.deps.createObjectURL(this.blob);
        this.chunks = [];
        this.releaseStream();
        this.status = 'stopped';
        this.deps.onEvent?.({kind:'stopped'});
      };
      this.startedAt = this.now();
      recorder.start(); this.status = 'recording';
      this.deps.onEvent?.({kind:'started'});
    } catch (error) {
      if (generation !== this.generation) return this.status;
      this.releaseStream(); this.removeBackground?.(); this.removeBackground = null;
      const name = (error as {name?:string})?.name;
      this.status = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unsupported';
      this.deps.onEvent?.({kind:this.status});
    }
    return this.status;
  }
  stop() {if (this.status === 'recording') this.recorder?.stop();}
  recordingForSave(newId: () => string, passageId?: string, sessionId?: string): {blob:Blob;meta:RecordingMeta}|null {
    if (this.status !== 'stopped' || !this.blob) return null;
    return {blob:this.blob,meta:{id:newId(),passageId,sessionId,mimeType:this.blob.type,durationMs:this.durationMs,retention:'saved_local',consentGranted:true,createdAt:new Date().toISOString()}};
  }
  saveToDevice(newId: () => string, passageId?: string, sessionId?: string): {blob:Blob;meta:RecordingMeta}|null {
    if (this.status !== 'stopped' || !this.blob) return null;
    const result = {blob:this.blob,meta:{id:newId(),passageId,sessionId,mimeType:this.blob.type,durationMs:this.durationMs,retention:'saved_local' as const,consentGranted:true,createdAt:new Date().toISOString()}};
    this.discard('saved'); this.deps.onEvent?.({kind:'saved'}); return result;
  }
  discard(reason: string) {
    this.generation++;
    const recorder = this.recorder;
    if (recorder) {recorder.onstop=null;recorder.ondataavailable=null;if(this.status==='recording') {try {recorder.stop();} catch {/* already stopped */}}}
    this.releaseStream(); this.removeBackground?.(); this.removeBackground=null;
    if(this.url) this.deps.revokeObjectURL(this.url);
    this.url='';this.blob=null;this.chunks=[];this.durationMs=0;this.status='idle';
    this.deps.onEvent?.({kind:'discarded',reason});
  }
  dispose() {this.discard('unmount');}
  private releaseStream() {this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.recorder=null;}
}
export function createBrowserRecorder(onEvent?: (event: RecorderEvent)=>void): SessionRecorder|null {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null;
  return new SessionRecorder({
    getUserMedia:()=>navigator.mediaDevices.getUserMedia({audio:true}),
    createRecorder:stream=>new MediaRecorder(stream as MediaStream) as unknown as Recorder,
    createObjectURL:blob=>URL.createObjectURL(blob),revokeObjectURL:url=>URL.revokeObjectURL(url),onEvent,
    onBackground:handler=>{const visibility=()=>{if(document.visibilityState==='hidden')handler();};
      document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',handler);
      return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',handler);};},
  });
}
