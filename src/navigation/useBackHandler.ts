import {useEffect, useRef} from 'react';
import {registerBackHandler, type BackHandler} from './back-stack';

/**
 * يسجّل معالج زر الرجوع ما دامت الطبقة نشطة.
 * يُحدَّث المعالج في كل رسم دون إعادة تسجيل، حتى لا يتغيّر ترتيب الطبقات.
 */
export function useBackHandler(handler: BackHandler, active = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    return registerBackHandler(() => handlerRef.current());
  }, [active]);
}
