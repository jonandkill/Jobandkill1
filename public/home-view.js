const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function renderHome(root, profile = {}, onStart, context = {}) {
  const average = Number(profile.average);
  const hasGrade = Number.isFinite(average) && average >= 1 && average <= Number(profile.scale || 9);
  const savedCount = Math.max(0, Number(context.savedCount) || 0);
  const universityCount = Number(context.universityCount);
  const countLabel = Number.isInteger(universityCount) && universityCount > 0 ? `${universityCount.toLocaleString()}개 대학 탐색` : '전국 대학 탐색';
  const gradeLabel = hasGrade ? `${escape(profile.average)}등급` : '평균 내신부터';
  const nextTitle = hasGrade ? '입력한 성적과 대학을 함께 살펴보세요.' : '성적 한 줄로, 나에게 맞는 다음 단계.';
  const nextDescription = hasGrade
    ? `${escape(profile.scale || 9)}등급제 · 평균 ${gradeLabel}. 세부 성적을 더하면 대학별 반영 방식에 맞춰 비교할 수 있는 범위를 넓힐 수 있어요.`
    : '예를 들어 2.3등급만 입력해도 시작할 수 있어요. 학교를 먼저 둘러보거나, 필요한 성적만 추가해도 괜찮아요.';

  root.innerHTML = `
    <section class="landing-hero lifecycle-hero" aria-labelledby="home-title">
      <div class="hero-story">
        <p class="eyebrow">잡앤킬 진학설계</p>
        <h1 id="home-title">오늘의 준비가,<br>다음 선택이 되도록.</h1>
        <p class="hero-lead">대학을 찾는 순간부터<br>논술과 면접을 준비하는 날까지.</p>
        <div class="actions home-primary-actions">
          ${hasGrade ? '<a class="button primary" href="#recommend">내 성적으로 대학 살펴보기 →</a>' : '<button id="home-start" class="primary">평균 내신 입력하고 시작 →</button>'}
          <a class="button" href="#find">${countLabel}</a>
        </div>
        <p class="hint">소수점 내신 입력 · 세부 성적은 선택 · 과거 입결과 비교</p>
      </div>
      <section id="home-slider" class="home-slider" aria-roledescription="carousel" aria-label="잡앤킬 진학설계 주요 안내">
        <article class="home-slide is-active" data-slide aria-hidden="false">
          <img src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1500&q=85" alt="함께 학습하며 진학 계획을 세우는 학생들" fetchpriority="high">
          <div class="home-slide-copy"><p>성적부터 지원 전략까지</p><h2>내 성적을<br>비교의 근거로.</h2><a href="#recommend">입결 비교 시작 →</a></div>
        </article>
        <article class="home-slide" data-slide aria-hidden="true">
          <img src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1500&q=85" alt="졸업을 앞둔 학생들이 캠퍼스에 서 있는 모습" loading="lazy">
          <div class="home-slide-copy"><p>대학·학과·전형을 한곳에서</p><h2>지원 후보를<br>근거와 함께.</h2><a href="#find">${countLabel} →</a></div>
        </article>
        <article class="home-slide" data-slide aria-hidden="true">
          <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1500&q=85" alt="노트북으로 학습 자료를 확인하는 학생" loading="lazy">
          <div class="home-slide-copy"><p>논술·면접까지 이어지는 준비</p><h2>찾은 뒤에는<br>직접 연습해요.</h2><a href="#prepare/essay">논술 문제 풀기 →</a></div>
        </article>
        <div class="home-slider-controls">
          <div class="home-slider-dots" aria-label="슬라이드 선택"><button type="button" class="is-active" data-slide-to="0" aria-label="1번 슬라이드" aria-current="true"></button><button type="button" data-slide-to="1" aria-label="2번 슬라이드"></button><button type="button" data-slide-to="2" aria-label="3번 슬라이드"></button></div>
          <div><button id="home-slide-prev" type="button" aria-label="이전 슬라이드">←</button><button id="home-slide-next" type="button" aria-label="다음 슬라이드">→</button><button id="home-slide-toggle" type="button" aria-pressed="false">자동 넘김 멈추기</button></div>
        </div>
      </section>
    </section>

    <section class="home-resume" aria-labelledby="home-next-title">
      <div class="home-resume-copy"><p class="eyebrow">${hasGrade ? '이어서 준비하기' : '처음이라면 여기부터'}</p><h2 id="home-next-title">${nextTitle}</h2><p>${nextDescription}</p></div>
      <div class="home-resume-actions"><a class="button primary" href="#recommend">${hasGrade ? '입결 비교·세부 성적 추가' : '성적 입력·평균 계산'}</a><a href="#saved">내 지원 후보 ${savedCount}개 보기 →</a></div>
    </section>

    <section class="home-section lifecycle-section" aria-labelledby="journey-title">
      <div class="section-head"><div><p class="eyebrow">나의 입시 준비 순서</p><h2 id="journey-title">지금 필요한 단계로 바로 가세요.</h2></div><p class="muted">순서에 얽매이지 않고 언제든 돌아올 수 있어요.</p></div>
      <ol class="lifecycle-list">
        <li><a href="#find"><span class="lifecycle-number" aria-hidden="true">01</span><div><h3>대학·학과 탐색</h3><p>지역과 관심 학과로 찾아보고, 학교의 지원 정보를 읽어요.</p></div><span class="lifecycle-state">${countLabel} <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#recommend"><span class="lifecycle-number" aria-hidden="true">02</span><div><h3>성적 정리·입결 비교</h3><p>평균을 계산하고, 같은 전형의 과거 입결을 비교해요.</p></div><span class="lifecycle-state">${hasGrade ? gradeLabel + ' 입력됨' : '성적 입력 가능'} <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#saved"><span class="lifecycle-number" aria-hidden="true">03</span><div><h3>지원 후보 좁히기</h3><p>담아 둔 대학의 전형, 일정, 준비 조건을 나란히 살펴봐요.</p></div><span class="lifecycle-state">후보 ${savedCount}개 <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#prepare/essay"><span class="lifecycle-number" aria-hidden="true">04</span><div><h3>논술·면접 실전 연습</h3><p>문제를 풀고 답변을 쓰면서, 보완할 근거를 찾아요.</p></div><span class="lifecycle-state">연습 시작 <b aria-hidden="true">↗</b></span></a></li>
        <li><a href="#prepare/plan"><span class="lifecycle-number" aria-hidden="true">05</span><div><h3>지원 전 마지막 점검</h3><p>모집요강, 제출서류, 접수·고사 일정을 다시 확인해요.</p></div><span class="lifecycle-state">준비 목록 확인 <b aria-hidden="true">↗</b></span></a></li>
      </ol>
    </section>

    <section class="home-practice" aria-labelledby="practice-title">
      <div><p class="eyebrow">반복할수록 구체적으로</p><h2 id="practice-title">오늘 연습할 한 가지를 골라보세요.</h2><p class="muted">읽기만 했던 문제를 직접 풀고,<br>생각해 둔 답변을 나의 말로 작성해 보세요.</p></div>
      <div class="home-practice-links"><a href="#prepare/writing"><strong>자기소개서 작성</strong><span>내 경험 작성 → 글 보완 → 면접 질문으로 연결</span><b aria-hidden="true">↗</b></a><a href="#prepare/essay"><strong>논술 문제 풀기</strong><span>문제 선택 → 시간 확인 → 답안 작성 → 피드백</span><b aria-hidden="true">↗</b></a><a href="#prepare/interview"><strong>면접 답변 연습</strong><span>학교·학과 선택 → 질문 확인 → 답변 보완</span><b aria-hidden="true">↗</b></a><a href="#prepare/exams"><strong>공식 논술 자료 찾기</strong><span>학교·연도·계열별 자료와 원문 확인</span><b aria-hidden="true">↗</b></a></div>
    </section>
    <section class="home-note"><h2>선택의 근거를 함께 확인하세요.</h2><p>과거 입결은 올해의 합격을 보장하지 않으며 실제 결과와 다를 수 있습니다. 대학별 성적 반영 방식과 전형 변경을 함께 확인하고, 공식 자료와 자체 연습 피드백을 구분해 안내합니다.</p><a href="#history">연도별 입결 자료 살펴보기 →</a></section>`;

  const start = root.querySelector('#home-start');
  if (start) start.onclick = onStart;
  const slider = root.querySelector('#home-slider');
  const slides = [...root.querySelectorAll('[data-slide]')];
  const dots = [...root.querySelectorAll('[data-slide-to]')];
  const previous = root.querySelector('#home-slide-prev');
  const next = root.querySelector('#home-slide-next');
  const toggle = root.querySelector('#home-slide-toggle');
  let index = 0;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let interval = null;
  const show = nextIndex => {
    index = (nextIndex + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-current', active ? 'true' : 'false');
    });
  };
  const schedule = () => {
    if (interval) clearInterval(interval);
    interval = paused ? null : setInterval(() => show(index + 1), 6500);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? '자동 넘김 재생' : '자동 넘김 멈추기';
  };
  previous.onclick = () => show(index - 1);
  next.onclick = () => show(index + 1);
  dots.forEach(dot => dot.onclick = () => show(Number(dot.dataset.slideTo)));
  toggle.onclick = () => { paused = !paused; schedule(); };
  slider.onmouseenter = () => { if (!paused && interval) clearInterval(interval); };
  slider.onmouseleave = () => { if (!paused) schedule(); };
  show(0);
  schedule();
}
