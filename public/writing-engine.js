import {
  composeSituationNarrative,
  composeActionNarrative,
  composeResultNarrative,
  composeLearningNarrative
} from './vendor/jobnkill/narrative-engine.mjs';

export const WRITING_SOURCE = 'jobnkill-narrative-engine';
export const WRITING_LIMITS = Object.freeze({minimum:20, maximum:16000});
export const WRITING_PROMPTS = Object.freeze([
  {id:'motivation',label:'지원 동기와 경험',prompt:'지원 동기와 관련 경험을 연결해 서술하시오.'},
  {id:'problem-solving',label:'문제 해결 경험',prompt:'문제를 해결한 경험과 본인의 역할을 서술하시오.'},
  {id:'collaboration',label:'협업과 갈등 조정',prompt:'협업 과정에서 맡은 역할과 배운 점을 서술하시오.'},
  {id:'learning',label:'학업·성장 계획',prompt:'관심 분야에서 배운 점과 앞으로의 학습 계획을 서술하시오.'},
  {id:'strength',label:'강점과 보완점',prompt:'본인의 강점이 드러난 경험과 보완할 점을 서술하시오.'}
]);
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

// 문항 중심 자기소개서 작업실: 입력 사실을 항목별로 보존하고 연결어만 보탭니다.
const SELF_INTRO_FIELDS = Object.freeze([
  ['experience','경험과 상황'], ['challenge','문제와 어려움'], ['reason','판단 기준과 선택 이유'],
  ['action','직접 한 행동'], ['ask','질문·확인한 내용'], ['feedback','받은 피드백과 수정'],
  ['result','결과와 확인 근거'], ['learning','배운 점'], ['targetEvidence','지원 학교·학과에서 확인한 내용'], ['plan','이어갈 학습 계획']
]);
const textValue = (v, max=4000) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const sectionText = (label, value) => value ? `${label}\n${value}` : '';
export function normalizeSelfIntroductionInput(input={}) {
  const out = {};
  for (const [key] of SELF_INTRO_FIELDS) out[key] = textValue(input[key]);
  out.question = textValue(input.question, 2000);
  out.purpose = ['admission','interview','employment'].includes(input.purpose) ? input.purpose : 'admission';
  out.school = textValue(input.school, 160); out.major = textValue(input.major, 160);
  out.company = textValue(input.company, 160); out.job = textValue(input.job, 160);
  out.targetMin = Math.max(0, Math.min(16000, Number(input.targetMin)||0));
  out.targetMax = Math.max(1, Math.min(16000, Number(input.targetMax)||16000));
  return out;
}
export function buildSelfIntroductionDraft(input={}) {
  const data = normalizeSelfIntroductionInput(input);
  const source = [
    sectionText('경험과 상황', data.experience), sectionText('문제와 어려움', data.challenge),
    sectionText('판단 기준과 선택 이유', data.reason), sectionText('직접 한 행동', data.action),
    sectionText('질문·확인한 내용', data.ask), sectionText('받은 피드백과 수정', data.feedback),
    sectionText('결과와 확인 근거', data.result), sectionText('배운 점', data.learning),
    sectionText('지원 연결 근거', data.targetEvidence), sectionText('이어갈 학습 계획', data.plan)
  ].filter(Boolean).join('\n\n');
  if ([...source].length < WRITING_LIMITS.minimum) {
    const error = new Error('실제로 겪은 경험을 20자 이상 입력해 주세요.'); error.code='MIN_LENGTH'; throw error;
  }
  const legacy = buildWritingDraft({experience:data.experience, action:[data.challenge,data.reason,data.action,data.ask,data.feedback].filter(Boolean).join(' '), result:[data.result,data.targetEvidence].filter(Boolean).join(' '), learning:[data.learning,data.plan].filter(Boolean).join(' ')});
  const text = [data.question ? `문항: ${data.question}` : '', legacy.text].filter(Boolean).join('\n\n');
  const max = data.targetMax || 16000;
  const warnings = [...(legacy.warnings || [])];
  if ([...text].length > max) warnings.push(`설정한 최대 글자 수 ${max.toLocaleString('ko-KR')}자를 넘었습니다. 문장을 직접 줄여 주세요.`);
  const missing = SELF_INTRO_FIELDS.filter(([key]) => !data[key]).map(([,label]) => label);
  return {text, originalText:source, source:'jobnkill-guided-writing-local', purpose:data.purpose, question:data.question, target:{school:data.school,major:data.major,company:data.company,job:data.job,min:data.targetMin,max}, warnings, missing, characterCount:[...text].length, fields:data};
}
export function reviewSelfIntroductionDraft(value='', input={}) {
  const text = validateText(value);
  const data = normalizeSelfIntroductionInput(input);
  const sentences = text.split(/(?<=[.!?。！？])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
  const rules = [
    ['상황·문항 적합성', /수업|동아리|탐구|프로젝트|활동|문제|경험|문항/, '문항이 요구한 상황과 해결할 문제를 한 문장으로 먼저 좁혀 보세요.'],
    ['나의 판단과 역할', /제가|저는|내가|나는|맡|담당|선택|이유|판단/, '팀의 성과와 본인이 결정한 범위를 구분하고, 그 방법을 택한 이유를 실제 기준과 연결하세요.'],
    ['행동·확인·수정', /분석|비교|기록|측정|조사|제안|수정|검증|확인|질문|피드백/, '행동의 순서와 확인 방법, 피드백 뒤 바꾼 점을 실제로 한 일만 적으세요.'],
    ['결과·근거', /그 결과|변화|줄었|늘었|개선|확인|기록|관찰|평가/, '무엇이 달라졌는지와 어떤 기록·관찰로 확인했는지 함께 써 보세요. 확인하지 않은 수치는 추가하지 않습니다.'],
    ['배움·지원 연결', /배웠|깨달|중요|학습|배우고|교육과정|전공|학과|계획/, '경험 후 생각의 변화와 지원 학교·학과의 공식 교육과정에서 확인한 내용을 연결하세요.']
  ];
  const items = rules.map(([label, pattern, feedback])=>{const evidence=sentences.find(s=>pattern.test(s))||'';return {label,evidence,feedback,status:evidence?'found':'needs-detail'};});
  const corrections = items.filter(i=>!i.evidence).map(i=>({label:i.label,before:'(작성문에서 근거를 찾지 못함)',after:i.feedback,reason:'문항 평가자가 확인할 근거가 더 필요합니다.'}));
  const priority = corrections.slice(0,3).map(c=>c.after);
  if(data.major || data.school) priority.push(`${[data.school,data.major].filter(Boolean).join(' ')}의 공식 모집요강·교육과정에서 확인한 사실을 한 가지 인용해 지원 연결을 구체화하세요.`);
  return {items,corrections,priority:priority.slice(0,3),characterCount:[...text].length,source:'jobnkill-guided-writing-local',notice:'입력 문장에 근거한 구조 피드백입니다. 대학 채점자나 합격 결과를 대신하지 않습니다.'};
}
export function buildWritingInterviewQuestions(value='', input={}) {
  const text=validateText(value), data=normalizeSelfIntroductionInput(input);
  const target=[data.school,data.major,data.company,data.job].filter(Boolean).join(' ') || '지원 분야';
  const anchors=text.split(/(?<=[.!?。！？])\s+|\n+/).map(s=>s.trim()).filter(Boolean).slice(0,12);
  const defs=[
    ['목표','이 경험에서 이루려던 목표와 완료 기준은 무엇인가요?'],['상황','문제를 처음 발견한 장면을 설명해 주세요.'],['역할','본인이 책임진 일과 함께한 사람의 일을 구분해 주세요.'],['판단','다른 방법 대신 이 방법을 선택한 이유는 무엇인가요?'],['순서','처음부터 마지막까지 행동을 순서대로 말해 주세요.'],['확인','무엇을 확인한 뒤 다음 행동을 결정했나요?'],['질문','모르는 점을 누구에게 어떻게 물었고, 답을 어떻게 적용했나요?'],['참고','다른 사례를 참고했다면 그대로 따른 부분과 바꾼 부분은 무엇인가요?'],['피드백','첫 시도의 부족한 점을 어떻게 알아차렸나요?'],['수정','피드백을 받은 뒤 실제로 무엇을 바꿨나요?'],['결과','내 행동으로 달라진 부분은 무엇인가요?'],['근거','결과를 어떤 기록·관찰로 확인했나요?'],['한계','이 경험만으로 단정하기 어려운 점은 무엇인가요?'],['협업','협업자의 기여와 본인의 기여를 어떻게 구분하나요?'],['갈등','의견이 달랐을 때 어떤 기준으로 조정했나요?'],['실패','계획대로 되지 않은 부분과 다시 한다면 바꿀 점은 무엇인가요?'],['윤리','자료·도움을 사용한 범위와 직접 한 부분을 어떻게 구분하나요?'],['전이','이 경험의 방법을 다른 상황에 적용한다면 무엇을 조정하나요?'],['전공',''+target+'에서 이 경험과 연결해 배우고 싶은 것은 무엇인가요?'],['교육과정','공식 교육과정에서 확인한 과목 또는 활동은 무엇인가요?'],['지원동기','왜 '+target+'을 선택했나요?'],['학습계획','입학·입사 후 첫 학기에 무엇을 배우고 싶나요?'],['반론','본인의 선택에 대한 반대 의견에 어떻게 답하나요?'],['기준','우선순위를 정할 때 가장 중요한 기준은 무엇이었나요?'],['수치','제시한 수치가 있다면 측정 방법과 비교 기준은 무엇인가요?'],['재현','다른 사람이 같은 방법을 재현하려면 무엇을 기록해야 하나요?'],['책임','결과가 좋지 않았다면 본인이 책임질 부분은 무엇인가요?'],['성장','경험 전후로 달라진 생각을 한 문장으로 말해 주세요.'],['압축','이 경험을 40초 안에 핵심만 말해 보세요.'],['추가','면접관이 더 확인하고 싶어 할 부분은 무엇이며 근거를 어떻게 준비하겠나요?']
  ];
  return defs.map(([id,q],i)=>({id:`writer-${id}-${i+1}`,number:i+1,category:id,question:q,evidence:anchors[i%Math.max(1,anchors.length)]||'',guide:'주장 → 직접 한 행동 → 확인 근거 → 배움의 순서로 답해 보세요.',source:'작성문 기반 자체 연습',official:false}));
}
