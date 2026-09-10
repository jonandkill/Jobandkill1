import {
  composeSituationNarrative,
  composeActionNarrative,
  composeResultNarrative,
  composeLearningNarrative
} from './vendor/jobnkill/narrative-engine.mjs';

export const WRITING_SOURCE = 'jobnkill-narrative-engine';
export const WRITING_LIMITS = Object.freeze({minimum:20, maximum:16000});
const fields = [
  {key:'experience',label:'경험과 상황'},
  {key:'action',label:'내가 한 행동'},
  {key:'result',label:'결과와 확인 근거'},
  {key:'learning',label:'배운 점'}
];

function inputError(code,message) {
  const error = new Error(message);
  error.code=code;
  return error;
}

function validateText(value,minimum=0) {
  if(typeof value!=='string') throw inputError('INVALID_INPUT','작성 내용은 글로 입력해 주세요.');
  const text=value.trim();
  const count=[...text].length;
  if(count>WRITING_LIMITS.maximum) throw inputError('MAX_LENGTH','작성 내용은 전체 16,000자까지 사용할 수 있어요. 내용을 나누어 작성해 주세요.');
  if(count<minimum) throw inputError('MIN_LENGTH','실제로 겪은 경험을 전체 20자 이상 입력해 주세요. 없는 행동이나 결과는 채우지 않아도 됩니다.');
  return text;
}

// Accept only a small, explicit set of surface edits. This is a provenance
// check, not an attempt to infer whether an invented claim is plausible.
function comparable(value) {
  return String(value).normalize('NFKC').replace(/\s+/g,'').replace(/[.!?。！？]+$/g,'');
}

const safeEndings = [
  [/어려웠음$/, '어려웠습니다'], [/힘들었음$/, '힘들었습니다'],
  [/알게\s*됨$/, '알게 됐습니다'], [/늘어남$/, '늘었습니다'],
  [/줄어듦$/, '줄었습니다'], [/좋아짐$/, '좋아졌습니다'],
  [/했음$/, '했습니다'], [/였음$/, '였습니다'], [/받음$/, '받았습니다'],
  [/됨$/, '됐습니다'], [/적용$/, '적용했습니다'], [/반영$/, '반영했습니다'],
  [/확인$/, '확인했습니다'], [/진행$/, '진행했습니다'], [/공유$/, '공유했습니다'],
  [/정리$/, '정리했습니다'], [/비교$/, '비교했습니다'], [/검토$/, '검토했습니다'],
  [/증가$/, '증가했습니다'], [/감소$/, '감소했습니다']
];

function isTraceableRewrite(original,candidate,key) {
  if(!candidate) return false;
  const base=original.normalize('NFKC').replace(/\s+/g,' ').replace(/[.!?\s]+$/g,'');
  const choices=[base];
  for(const [pattern,replacement] of safeEndings) {
    if(pattern.test(base)) choices.push(base.replace(pattern,replacement));
  }
  const actual=comparable(candidate);
  return choices.some(choice=>actual===comparable(choice) ||
    (key==='learning' && actual===comparable('이 경험을 통해 '+choice)));
}

/** Compose only entered evidence. No generated event, cognition or score. */
export function buildWritingDraft(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input))
    throw inputError('INVALID_INPUT','작성할 경험과 행동을 입력해 주세요.');
  const values=Object.fromEntries(fields.map(({key})=>[key,validateText(input[key]??'')]));
  const originalText=fields.map(({key})=>values[key]).filter(Boolean).join('\n\n');
  validateText(originalText,WRITING_LIMITS.minimum);
  const warnings=[];
  const compose={
    experience:()=>composeSituationNarrative({situationEvidence:{scene:values.experience}},{allowGuidedFallback:false}).text,
    action:()=>composeActionNarrative({actionDetail:values.action},{allowGuidedFallback:false}).text,
    result:()=>composeResultNarrative({result:values.result}),
    learning:()=>composeLearningNarrative({learning:values.learning})
  };
  const parts=fields.filter(({key})=>values[key]).map(({key,label})=>{
    const original=values[key];
    let candidate='';
    try {candidate=compose[key]();} catch { /* Preserve user work on engine errors. */ }
    const preserved=!isTraceableRewrite(original,candidate,key);
    const text=preserved?original:candidate;
    if(preserved) warnings.push(label+'의 원문 의미가 달라지거나 일부 내용이 빠질 수 있어 입력한 글을 그대로 유지했습니다.');
    return {key,label,original,text,changed:text!==original,preserved};
  });
  const text=parts.map(part=>part.text).join('\n\n');
  if(!text) throw inputError('EMPTY_DRAFT','정리할 글이 없습니다. 실제로 겪은 경험을 먼저 입력해 주세요.');
  // The small sentence-ending edits can lengthen an input near the limit.
  // Preserve the original instead of returning a draft that cannot be edited.
  if([...text].length>WRITING_LIMITS.maximum) {
    warnings.push('문장 정리 후 글자 수 제한을 넘어서 입력한 원문을 유지했습니다.');
    return {text:originalText,originalText,warnings,parts:parts.map(part=>({...part,text:part.original,changed:false,preserved:true})),source:WRITING_SOURCE,characterCount:[...originalText].length};
  }
  return {text,originalText,warnings,parts,source:WRITING_SOURCE,characterCount:[...text].length};
}

const reviewRules=[
  {label:'경험과 상황',pattern:/수업|동아리|탐구|실험|과제|활동|프로젝트|봉사|당시|문제|어려/,feedback:'어떤 수업·활동에서 무엇을 해결하려 했는지 설명해 주세요. 이미 적었다면 가장 중요한 상황 한 가지로 좁혀 보세요.'},
  {label:'내가 맡은 역할',pattern:/담당|역할|책임|맡[았은아]|(?:제가|저는|내가|나는).*(?:분석|비교|제안|확인|수정)/,feedback:'함께한 사람들의 행동과 내가 책임진 일을 구분해 주세요. 내가 결정하거나 실행한 내용을 중심으로 써 보세요.'},
  {label:'행동과 선택 이유',pattern:/(?:분석|비교|확인|기록|실험|조사|제안|수정|관찰|설계|검증|연습|측정)(?:했|하|해|한)/,feedback:'행동의 대상·방법과 그 방법을 선택한 이유를 연결해 주세요. 시도 후 바꾼 점이 있다면 실제 순서대로 덧붙여 보세요.'},
  {label:'결과와 확인 근거',pattern:/그 결과|줄었|늘었|개선[됐되]|완성했|달라졌|실패했|성공했|피드백을 받|평가를 받|확인할 수 있었/,feedback:'무엇이 달라졌는지, 그 변화를 어떤 관찰·기록·피드백으로 확인했는지 설명해 주세요. 실제로 확인하지 않은 수치는 추가하지 마세요.'},
  {label:'배운 점과 다음 학습',pattern:/배웠|배운|깨달|알게 되|한계를|중요성을|배우고 싶|학습하고/,feedback:'경험 전후로 달라진 생각과 다음에 보완할 행동을 연결해 주세요. 지원 전공의 배움과 연결한다면 직접 확인한 교육과정을 사용해 주세요.'}
];

/** Rule-based writing review. Matched expressions are cues, not verified facts. */
export function reviewWritingDraft(value='',context={}) {
  const text=validateText(value);
  const sentences=text.split(/(?<=[.!?。！？])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
  const items=reviewRules.map(rule=>{
    const evidence=sentences.find(sentence=>rule.pattern.test(sentence))||'';
    return {label:rule.label,evidence,feedback:rule.feedback,status:evidence?'found':'needs-detail'};
  });
  const priority=[];
  if(text && /우리|팀원|함께/.test(text) && !/제가|저는|내가|나는|담당|맡[았은아]/.test(text))
    priority.push('팀의 성과에서 내가 직접 결정하고 실행한 일을 구분해 주세요.');
  priority.push(...items.filter(item=>!item.evidence).map(item=>item.feedback));
  if(text && !/때문|위해|이유|판단|선택/.test(text))
    priority.push('적어 둔 행동을 왜 선택했는지, 당시의 판단 기준 한 가지를 덧붙여 보세요.');
  if(text && !priority.length) priority.push('입력한 경험의 사실관계와 내가 한 역할을 확인한 뒤, 가장 중요한 행동과 확인 근거를 중심으로 문장을 다듬어 보세요.');
  const school=typeof context?.school==='string'?context.school.trim().slice(0,120):'';
  const major=typeof context?.major==='string'?context.major.trim().slice(0,120):'';
  if(major || school) {
    const target=[school,major].filter(Boolean).join(' ');
    items.push({label:'지원 학교·학과 연결',evidence:sentences.find(sentence=>(major&&sentence.includes(major))||(school&&sentence.includes(school)))||'',feedback:target+'의 공식 교육과정에서 직접 확인한 내용 한 가지와 이 경험 이후의 학습 계획을 연결해 주세요.',status:'context'});
  }
  return {items,priority:priority.slice(0,3),characterCount:[...text].length,source:WRITING_SOURCE,notice:'입력 표현을 바탕으로 한 글 구조 점검입니다. 경험의 사실 여부나 대학의 평가 결과를 판정하지 않습니다.'};
}
