// التاريخ الهجري وفق تقويم أم القرى، بحساب محلي كامل عبر Intl دون أي خدمة خارجية.
// ثبوت الشهر الرؤيتي قد يختلف بين البلدان؛ لذلك يعرض الهجري دائمًا بجوار الميلادي ولا يُعتمد عليه منفردًا.

// Names of the 12 Hijri months as the Umm al-Qura calendar formats them in Arabic (taken from a full-ICU engine).
const HIJRI_MONTHS=['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];

type Formatters={text:Intl.DateTimeFormat;numeric:Intl.DateTimeFormat};
const formatters=((): Formatters|undefined=>{
  try{
    const text=new Intl.DateTimeFormat('ar-EG-u-ca-islamic-umalqura',{day:'numeric',month:'long'});
    const numeric=new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',{month:'numeric'});
    // Old system WebViews may ignore the calendar and format Gregorian. Only use the engine when it really applies Umm al-Qura.
    if(text.resolvedOptions().calendar!=='islamic-umalqura'||numeric.resolvedOptions().calendar!=='islamic-umalqura')return undefined;
    return {text,numeric};
  }catch{return undefined}
})();

// يقبل كائن Date أو نصًا ميلاديًا بصيغة YYYY-MM-DD أو رقمًا زمنيًا، ويعيد نصًا عربيًا أو undefined عند التعذر.
export function hijriDate(date:Date|string|number=new Date()):string|undefined{
  try{
    const parsed=date instanceof Date?date:typeof date==='number'?new Date(date):new Date(`${date}T12:00:00`);
    if(!formatters||!Number.isFinite(parsed.getTime()))return undefined;
    const parts=formatters.text.formatToParts(parsed);
    const day=parts.find(part=>part.type==='day')?.value;
    const month=parts.find(part=>part.type==='month')?.value;
    if(!day||!month)return undefined;
    // Chrome 69-class engines apply the calendar correctly but fall back to GREGORIAN month names by index (month 6 shows
    // "يونيو"). The day and month number are right, so when the engine's name is not a Hijri month, name it from the number.
    if(HIJRI_MONTHS.includes(month))return formatters.text.format(parsed);
    const number=Number(formatters.numeric.format(parsed));
    const name=HIJRI_MONTHS[number-1];
    return Number.isInteger(number)&&name?`${day} ${name}`:undefined;
  }catch{return undefined}
}
