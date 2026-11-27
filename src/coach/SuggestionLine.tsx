import type {ReactNode} from 'react';

/**
 * One static suggestion line for the normal screens. Text comes from the coach message catalog.
 * Optional dismiss and at most one action button. Never renders an input, never asks anything.
 */
export default function SuggestionLine({text,actionLabel,onAction,onDismiss,icon}:{text:string;actionLabel?:string;onAction?:()=>void;onDismiss?:()=>void;icon?:ReactNode}){
  if(!text)return null;
  return <div className="coach-suggestion-line" role="note">
    {icon}
    <span>{text}</span>
    {actionLabel&&onAction&&<button type="button" className="soft-btn" onClick={onAction}>{actionLabel}</button>}
    {onDismiss&&<button type="button" className="icon-btn" aria-label="إخفاء الاقتراح" onClick={onDismiss}>×</button>}
  </div>;
}
