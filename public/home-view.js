import { icon } from './ui-icons.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const heroSlides = [
  {src:'./assets/admissions-hero-counseling.webp',title:'함께 그리는 진학 계획',alt:'학생과 상담자가 진학 계획을 함께 살펴보는 연출 이미지'},
  {src:'./assets/admissions-hero-campus.webp',title:'나에게 맞는 대학 탐색',alt:'두 학생이 대학 캠퍼스를 둘러보는 연출 이미지'},
  {src:'./assets/admissions-hero-study.webp',title:'나의 답을 준비하는 시간',alt:'학생이 노트에 자신의 생각을 정리하며 입시를 준비하는 연출 이미지'},
];
const homeCleanups = new WeakMap();

export function cleanupHome(root) {
  homeCleanups.get(root)?.();
  homeCleanups.delete(root);
}

export function renderHome(root, profile = {}, onStart, context = {}) {
  cleanupHome(root);
  const average = Number(profile.average);
  const hasGrade = Number.isFinite(average) && average >= 1 && average <= Number(profile.scale || 9);
  const savedCount = Math.max(0, Number(context.savedCount) || 0);
  const universityCount = Number(context.universityCount);
  const count = Number.isInteger(universityCount) && universityCount > 0 ? universityCount.toLocaleString() : '';
  const regions = context.regions || [];
  root.innerHTML = `
    <section class="admission-hero" aria-roledescription="캐러셀" aria-labelledby="home-title">
      <div class="admission-hero-media" tabindex="0" aria-label="입시 준비 이미지. 좌우 방향키로 넘길 수 있습니다.">
        <div class="admission-hero-track">
          ${heroSlides.map((slide,index)=>`<div class="admission-hero-slide" role="group" aria-roledescription="슬라이드" aria-label="${index+1} / ${heroSlides.length} · ${slide.title}" aria-hidden="${index!==0}"><img src="${slide.src}" alt="${slide.alt}" width="2048" height="768" fetchpriority="${index===0?'high':'low'}" decoding="async" draggable="false"></div>`).join('')}
        </div>
      </div>
      <div class="admission-hero-content"><div class="admission-hero-copy">
        <p class="admission-kicker"><span></span> 나의 가능성을, 나의 대학으로.</p>
        <h1 id="home-title">막막했던 대학 입시,<br><em>나에게 맞는 길</em>을 찾다.</h1>
        <p class="admission-hero-lead">대학을 고르는 순간부터 면접을 준비하는 날까지.<br>잡앤킬과 함께, 나의 다음 선택을 준비하세요.</p>
        <div class="admission-hero-actions">
          ${hasGrade ? '<a class="admission-button is-orange" href="#recommend">내 성적으로 시작하기 '+icon('arrow')+'</a>' : '<button id="home-start" class="admission-button is-orange" type="button">내 성적으로 시작하기 '+icon('arrow')+'</button>'}
          <a class="admission-text-link" href="#find" data-home-browse>대학 먼저 둘러보기 ${icon('arrow')}</a>
        </div>
        <p class="admission-hero-helper">평균 내신만 있어도 시작할 수 있어요.</p>
      </div></div>
      <div class="admission-carousel-controls" aria-label="상단 이미지 슬라이드 제어">
        <button class="admission-carousel-arrow is-prev" type="button" data-carousel-prev aria-label="이전 이미지">${icon('arrow')}</button>
        <span class="admission-carousel-count" aria-hidden="true"><b data-carousel-number>01</b><span> / ${String(heroSlides.length).padStart(2,'0')}</span></span>
        <div class="admission-carousel-dots">${heroSlides.map((slide,index)=>`<button type="button" data-carousel-go="${index}" aria-label="${index+1}번 이미지: ${slide.title}" aria-current="${index===0}"><span></span></button>`).join('')}</div>
        <button class="admission-carousel-arrow" type="button" data-carousel-next aria-label="다음 이미지">${icon('arrow')}</button>
        <button class="admission-carousel-toggle" type="button" data-carousel-toggle aria-label="자동 넘김 멈추기">${icon('pause')}</button>
      </div>
      <p class="sr-only" data-carousel-status role="status" aria-live="off" aria-atomic="true"></p>
    </section>

    <div class="admission-home-content">
    <section class="admission-discovery" aria-label="대학 빠른 검색">
      <div class="admission-discovery-title"><span>어떤 대학을 찾고 있나요?</span><p>${count ? '현재 '+count+'개 대학·캠퍼스를 탐색할 수 있어요.' : '관심 대학과 지역으로 탐색을 시작하세요.'}</p></div>
      <form id="home-search-form" class="admission-search-form">
        <div class="admission-search-field">${icon('search')}<label class="sr-only" for="home-query">대학명</label><input id="home-query" name="query" type="search" placeholder="관심 대학을 검색해 보세요" autocomplete="off" maxlength="100"></div>
        <div class="admission-region-field"><label class="sr-only" for="home-region">희망 지역</label><select id="home-region" name="region"><option value="">전국 지역</option>${regions.map(region=>'<option value="'+escape(region)+'">'+escape(region)+'</option>').join('')}</select></div>
        <button class="admission-search-submit" type="submit">대학 찾기 ${icon('arrow')}</button>
      </form>
    </section>

    <section class="admission-quick-links" aria-label="입시 준비 바로가기">
      <a href="#find" data-home-browse><span class="admission-quick-icon is-peach">${icon('school')}</span><span><strong>대학·학과 찾기</strong><small>관심에서 시작하는 탐색</small></span>${icon('arrow')}</a>
      <a href="#recommend"><span class="admission-quick-icon is-lilac">${icon('chart')}</span><span><strong>내 성적·입결 비교</strong><small>선택의 근거를 더하기</small></span>${icon('arrow')}</a>
      <a href="#saved"><span class="admission-quick-icon is-yellow">${icon('bookmark')}</span><span><strong>내 지원 후보${savedCount ? ' <b>'+savedCount+'</b>' : ''}</strong><small>담아 두고 나란히 비교</small></span>${icon('arrow')}</a>
      <a href="#prepare"><span class="admission-quick-icon is-pink">${icon('pencil')}</span><span><strong>논술·면접 준비</strong><small>읽기를 넘어 직접 연습</small></span>${icon('arrow')}</a>
    </section>

    ${hasGrade || savedCount ? `<section class="admission-resume" aria-label="이어서 준비하기"><span>${icon('bookmark')} 나의 준비, 이어서</span><p>${hasGrade ? escape(profile.scale || 9)+'등급제 · 평균 '+escape(profile.average)+'등급' : '성적을 입력해 비교를 시작하세요.'} <span>지원 후보 ${savedCount}개</span></p><a href="${hasGrade ? '#recommend' : '#saved'}">이어서 보기 ${icon('arrow')}</a></section>` : ''}

    <section class="admission-section admission-journey" aria-labelledby="journey-title">
      <div class="admission-section-heading"><p class="admission-eyebrow">A CLEARER WAY FORWARD</p><h2 id="journey-title">찾고. 비교하고.<br>준비까지, <em>한 번에.</em></h2><p>정보가 많을수록 필요한 건, 나에게 맞는 순서.<br>지금 필요한 단계부터 차근차근 시작해 보세요.</p></div>
      <div class="admission-journey-grid">
        <article class="admission-journey-item"><div class="admission-journey-graphic is-peach"><span class="admission-step-label">STEP 01</span>${icon('school')}<span class="admission-graphic-caption">관심이 선택이 되도록</span></div><h3>나에게 맞는 대학 찾기</h3><p>희망 지역과 관심 학과를 살펴보고<br>대학별 전형과 공식 자료를 확인하세요.</p><a href="#find" data-home-browse>대학 탐색하기 ${icon('arrow')}</a></article>
        <article class="admission-journey-item"><div class="admission-journey-graphic is-lilac"><span class="admission-step-label">STEP 02</span>${icon('chart')}<span class="admission-graphic-caption">숫자에 근거를 더하다</span></div><h3>내 성적과 입결 비교하기</h3><p>평균 내신을 정리하고, 학과·전형별<br>과거 입결을 같은 기준으로 살펴보세요.</p><a href="#recommend">성적 비교하기 ${icon('arrow')}</a></article>
        <article class="admission-journey-item"><div class="admission-journey-graphic is-pink"><span class="admission-step-label">STEP 03</span>${icon('speech')}<span class="admission-graphic-caption">나의 언어로 준비하다</span></div><h3>논술과 면접 직접 연습하기</h3><p>학교와 전형에 필요한 준비를 확인하고<br>답안·답변을 작성하며 보완하세요.</p><a href="#prepare">실전 준비하기 ${icon('arrow')}</a></article>
      </div>
    </section>

    <section class="admission-practice-section" aria-labelledby="practice-title">
      <div class="admission-section-heading is-left"><p class="admission-eyebrow">MAKE IT YOUR OWN</p><h2 id="practice-title">생각했던 답을,<br><em>나의 답으로.</em></h2><p>무엇을 준비할지 알았다면, 이제 직접 해볼 차례.<br>나의 경험과 생각을 구체적인 답변으로 만들어 보세요.</p></div>
      <div class="admission-practice-grid">
        <a class="admission-practice-item" href="#prepare/writing"><span class="admission-practice-top"><span class="admission-mini-tag">경험 정리</span>${icon('pencil')}</span><h3>자기소개서·경험 정리</h3><p>나의 활동과 경험을 정리하고<br>면접 질문으로 연결해 보세요.</p><span class="admission-practice-link">작성 시작하기 ${icon('arrow')}</span></a>
        <a class="admission-practice-item" href="#prepare/essay"><span class="admission-practice-top"><span class="admission-mini-tag">답안 연습</span>${icon('paper')}</span><h3>논술 실전 연습</h3><p>문제를 고르고 시간을 확인하며<br>답안을 작성하고 피드백을 살펴보세요.</p><span class="admission-practice-link">문제 풀어보기 ${icon('arrow')}</span></a>
        <a class="admission-practice-item" href="#prepare/interview"><span class="admission-practice-top"><span class="admission-mini-tag">답변 연습</span>${icon('speech')}</span><h3>면접 답변 연습</h3><p>대학·학과별 질문을 확인하고<br>나만의 근거를 담아 답변을 보완하세요.</p><span class="admission-practice-link">질문 확인하기 ${icon('arrow')}</span></a>
      </div>
      <p class="admission-practice-footnote">대학별 제출서류와 평가요소는 해당 연도 모집요강을 기준으로 확인하세요.</p>
    </section>

    <section class="admission-section admission-evidence" aria-labelledby="evidence-title">
      <div class="admission-evidence-copy"><p class="admission-eyebrow">INFORMATION WITH CONTEXT</p><h2 id="evidence-title">선택의 근거까지,<br><em>함께 확인하세요.</em></h2><p>같은 정보처럼 보여도, 쓰임은 다르니까.<br>자료의 출처와 비교 범위를 구분해 안내합니다.</p><a class="admission-text-link" href="#history">연도별 입결 자료 보기 ${icon('arrow')}</a></div>
      <div class="admission-evidence-list"><article><span>01</span><div><h3>대학이 공개한 공식 자료</h3><p>모집요강과 공개 질문은 원문 출처를 확인할 수 있어요. 대학별 수집 범위도 함께 표시합니다.</p></div>${icon('check')}</article><article><span>02</span><div><h3>조건을 확인하는 입결 비교</h3><p>학년도·학과·전형·등급체계를 확인해 비교합니다. 과거 입결은 올해의 합격확률을 뜻하지 않습니다.</p></div>${icon('check')}</article><article><span>03</span><div><h3>출처가 구분된 자체 연습</h3><p>공식 질문과 자체 연습 문제를 구분합니다. 연습 피드백은 대학의 실제 채점 결과와 다릅니다.</p></div>${icon('check')}</article></div>
    </section>

    <section class="admission-section admission-faq" aria-labelledby="faq-title"><div class="admission-section-heading"><p class="admission-eyebrow">BEFORE YOU START</p><h2 id="faq-title">시작하기 전에,<br>궁금한 것들.</h2></div><div class="admission-faq-list">
      <details><summary>성적을 모두 입력해야 시작할 수 있나요?<span aria-hidden="true">+</span></summary><p>평균 내신만 입력해도 시작할 수 있습니다. 세부 과목과 이수단위는 필요할 때 추가하세요. 대학 목록은 성적을 입력하지 않고도 둘러볼 수 있습니다.</p></details>
      <details><summary>모든 대학의 상세 자료가 제공되나요?<span aria-hidden="true">+</span></summary><p>대학 목록과 상세 전형·입결·공식 질문의 제공 범위는 다릅니다. 각 대학 화면에서 수집 범위와 출처를 표시하며, 자료가 없는 경우 대학 공식 안내로 연결합니다.</p></details>
      <details><summary>입결 비교로 합격 여부를 알 수 있나요?<span aria-hidden="true">+</span></summary><p>입결 비교는 지원 후보를 살펴보는 참고 자료입니다. 과거 결과가 올해 합격을 보장하지 않습니다. 대학별 성적 산출식과 전형 변경, 지원자격을 함께 확인하세요.</p></details>
      <details><summary>작성한 답안과 지원 후보는 어디에 저장되나요?<span aria-hidden="true">+</span></summary><p>성적, 지원 후보와 연습 기록은 현재 사용하는 브라우저에 저장됩니다. 다른 기기와 자동으로 동기화되지 않으며, 브라우저 데이터를 삭제하면 기록도 사라질 수 있습니다.</p></details>
    </div></section>

    <section class="admission-consult-banner" aria-labelledby="consult-title"><div><p class="admission-eyebrow">YOUR NEXT, TOGETHER</p><h2 id="consult-title">다음 선택이 고민된다면,<br>함께 방향을 정리해요.</h2><p>나의 성적, 경험, 목표 대학.<br>지금 가장 필요한 준비부터 이야기해 주세요.</p></div><a class="admission-button is-orange" href="#consult">진학 상담 신청 ${icon('arrow')}</a><span class="admission-consult-art" aria-hidden="true">↗</span></section>
    </div>`;

  homeCleanups.set(root, bindHeroCarousel(root));
  const start = root.querySelector('#home-start');
  if (start) start.onclick = onStart;
  root.querySelectorAll('[data-home-browse]').forEach(link => link.addEventListener('click', event => {
    if (!context.onSearch || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    context.onSearch({query:'',region:''});
  }));
  root.querySelector('#home-search-form').onsubmit = event => {
    event.preventDefault();
    context.onSearch?.({query:root.querySelector('#home-query').value.trim(),region:root.querySelector('#home-region').value});
  };
}

function bindHeroCarousel(root) {
  const hero = root.querySelector('.admission-hero');
  const media = hero.querySelector('.admission-hero-media');
  const track = hero.querySelector('.admission-hero-track');
  const slides = [...hero.querySelectorAll('.admission-hero-slide')];
  const dots = [...hero.querySelectorAll('[data-carousel-go]')];
  const toggle = hero.querySelector('[data-carousel-toggle]');
  const status = hero.querySelector('[data-carousel-status]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverCapable = window.matchMedia('(hover: hover)');
  const controller = new AbortController();
  const listen = (element,type,handler) => element.addEventListener(type,handler,{signal:controller.signal});
  let index = 0;
  let automatic = !reducedMotion.matches;
  let timer;
  let gesture;

  const updateRotation = () => {
    toggle.setAttribute('aria-label',automatic ? '자동 넘김 멈추기' : '자동 넘김 시작하기');
    toggle.innerHTML = icon(automatic ? 'pause' : 'play');
    hero.dataset.autoplay = String(automatic);
    status.setAttribute('aria-live',automatic ? 'off' : 'polite');
  };
  const schedule = () => {
    window.clearTimeout(timer);
    if (!automatic || document.hidden || controller.signal.aborted) return;
    timer = window.setTimeout(() => {
      if (!hero.isConnected) { cleanupHome(root); return; }
      // Check actual hover state: replacing a control icon can omit a leave event.
      if (hoverCapable.matches && hero.matches(':hover')) { schedule(); return; }
      show(index+1);
    },6000);
  };
  const show = (next,manual = false) => {
    index = (next+slides.length)%slides.length;
    if (manual) automatic = false;
    track.style.transform = `translateX(-${index*100}%)`;
    hero.dataset.slide = String(index);
    slides.forEach((slide,i)=>slide.setAttribute('aria-hidden',String(i!==index)));
    dots.forEach((dot,i)=>dot.setAttribute('aria-current',String(i===index)));
    hero.querySelector('[data-carousel-number]').textContent = String(index+1).padStart(2,'0');
    updateRotation();
    if (manual) status.textContent = `${index+1} / ${slides.length} · ${heroSlides[index].title}`;
    schedule();
  };
  listen(hero.querySelector('[data-carousel-prev]'),'click',()=>show(index-1,true));
  listen(hero.querySelector('[data-carousel-next]'),'click',()=>show(index+1,true));
  dots.forEach((dot,i)=>listen(dot,'click',()=>show(i,true)));
  listen(toggle,'click',()=>{automatic=!automatic;updateRotation();schedule();});
  listen(hero,'mouseenter',schedule);
  listen(hero,'mouseleave',schedule);
  listen(hero,'focusin',event=>{
    if (event.target===toggle) return;
    automatic=false;updateRotation();schedule();
  });
  listen(media,'keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    show(event.key==='Home'?0:event.key==='End'?slides.length-1:index+(event.key==='ArrowLeft'?-1:1),true);
  });
  listen(media,'pointerdown',event=>{
    if (event.pointerType==='mouse' || !event.isPrimary) return;
    gesture={x:event.clientX,y:event.clientY,id:event.pointerId};
    media.setPointerCapture(event.pointerId);
  });
  listen(media,'pointerup',event=>{
    if (!gesture || gesture.id!==event.pointerId) return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    gesture=null;
    if (Math.abs(dx)>40 && Math.abs(dx)>Math.abs(dy)*1.3) show(index+(dx<0?1:-1),true);
  });
  listen(media,'pointercancel',()=>{gesture=null;});
  listen(document,'visibilitychange',schedule);
  listen(reducedMotion,'change',()=>{
    if(reducedMotion.matches){automatic=false;updateRotation();}
    schedule();
  });
  hero.dataset.slide='0';
  updateRotation();
  schedule();
  return () => {window.clearTimeout(timer);controller.abort();};
}
