const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** Render official PDF bytes through the server's ID allowlist; no remote iframe. */
export async function renderDocument(container, { resourceId, title, initialPage = 1, originalUrl = '' }) {
  const source = `/api/documents/${encodeURIComponent(resourceId)}`;
  const official = /^https:\/\//.test(originalUrl) ? originalUrl : '';
  let pdf, destroyed = false, task, pageNumber = 1, requestedPage = initialPage, sequence = 0;
  container.innerHTML = `<section class="document-reader" aria-label="공식 자료 읽기"><p class="document-status" role="status">공식 PDF를 불러오고 있어요.</p><div class="pagination" aria-label="PDF 페이지"><button type="button" data-prev disabled>← 이전</button><label>쪽 <input data-page type="number" min="1" value="1" aria-label="PDF 페이지 번호" style="width:76px;display:inline-block" disabled></label><span data-total>/ — 쪽</span><button type="button" data-next disabled>다음 →</button></div><div data-canvas-wrap style="max-width:100%;overflow:auto;background:#eee;border:1px solid #dedfd5"><canvas role="img" aria-label="${escape(title)} PDF 본문" style="display:block;max-width:100%;height:auto;margin:auto" hidden></canvas></div><div class="actions"><a class="button" href="${source}?download=1">PDF 내려받기</a>${official ? `<a class="button" href="${escape(official)}" target="_blank" rel="noopener">대학 원본 열기 ↗</a>` : ''}</div></section>`;
  const status = container.querySelector('.document-status'), canvas = container.querySelector('canvas'), input = container.querySelector('[data-page]'), prev = container.querySelector('[data-prev]'), next = container.querySelector('[data-next]');
  async function show(number) {
    requestedPage = Math.max(1, Number(number) || 1);
    if (!pdf || destroyed) return;
    const ticket = ++sequence;
    task?.cancel();
    pageNumber = Math.min(pdf.numPages, requestedPage);
    input.value = pageNumber;
    input.max = pdf.numPages;
    prev.disabled = pageNumber <= 1;
    next.disabled = pageNumber >= pdf.numPages;
    status.textContent = `${pageNumber} / ${pdf.numPages}쪽을 표시하고 있어요.`;
    try {
      const page = await pdf.getPage(pageNumber);
      if (destroyed || ticket !== sequence) return;
      const plain = page.getViewport({ scale: 1 });
      const width = Math.min(1100, Math.max(240, container.clientWidth - 2));
      const density = Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: width / plain.width * density });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${width}px`;
      canvas.hidden = false;
      canvas.setAttribute('aria-label', `${title}, ${pageNumber} / ${pdf.numPages}쪽. 원본 PDF 내려받기로 텍스트를 읽을 수 있습니다.`);
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
      await task.promise;
      if (!destroyed && ticket === sequence) status.textContent = `${pageNumber} / ${pdf.numPages}쪽`;
    } catch (error) {
      if (!destroyed && ticket === sequence && error?.name !== 'RenderingCancelledException') {
        canvas.hidden = true;
        status.textContent = '이 쪽을 표시하지 못했습니다. PDF 내려받기 또는 대학 원본 열기를 이용해 주세요.';
      }
    }
  }
  input.onchange = () => show(input.value);
  input.onkeydown = event => { if (event.key === 'Enter') show(input.value); };
  prev.onclick = () => show(pageNumber - 1);
  next.onclick = () => show(pageNumber + 1);
  const control = { goTo: show, destroy() { destroyed = true; sequence++; task?.cancel(); pdf?.destroy(); } };
  try {
    const pdfjs = await import('/vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';
    const loaded = await pdfjs.getDocument({ url: source, isEvalSupported: false, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/' }).promise;
    if (destroyed || !container.isConnected) { loaded.destroy(); return control; }
    pdf = loaded;
    input.disabled = false;
    container.querySelector('[data-total]').textContent = `/ ${pdf.numPages} 쪽`;
    await show(requestedPage);
  } catch {
    if (!destroyed && container.isConnected) {
      status.innerHTML = '이 자료의 본문을 현재 불러오지 못했습니다. 아래 <strong>대학 원본 열기</strong>를 이용하거나 다른 자료를 선택해 주세요. 빈 화면을 정상 열람으로 처리하지 않습니다.';
      container.querySelector('[data-canvas-wrap]').hidden = true;
      container.querySelector('.pagination').hidden = true;
    }
  }
  return control;
}
