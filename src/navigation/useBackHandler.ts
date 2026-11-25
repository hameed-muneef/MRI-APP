import {useLayoutEffect, useRef} from 'react';
import {registerBackHandler, type BackHandler} from './back-stack';

/**
 * يسجّل معالج زر الرجوع ما دامت الطبقة نشطة.
 * يُحدَّث المعالج في كل رسم دون إعادة تسجيل، حتى لا يتغيّر ترتيب الطبقات.
 * التسجيل في useLayoutEffect حتى يتم مع تثبيت العناصر في DOM مباشرةً؛
 * فلا توجد نافذة بين ظهور الطبقة وتسجيل معالجها يقع فيها رجوع فيغادر التطبيق الشاشة.
 */
export function useBackHandler(handler: BackHandler, active = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useLayoutEffect(() => {
    if (!active) return;
    return registerBackHandler(() => handlerRef.current());
  }, [active]);
}
