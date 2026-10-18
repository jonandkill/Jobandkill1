'use strict';
(() => {
  // Never cache private pages or credentials in the service worker.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  let installEvent;
  const installBtn = document.getElementById('install-app');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvent=e;
    if (installBtn) installBtn.hidden=false;
  });
  installBtn?.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt(); await installEvent.userChoice; installEvent=undefined;
    installBtn.hidden=true;
  });
  const uploads=document.querySelectorAll('[data-upload-mode]');
  const photosInput=document.getElementById('photos-input');
  const zipInput=document.getElementById('zip-input');
  const photosWrap=document.getElementById('photos-wrap');
  const zipWrap=document.getElementById('zip-wrap');
  const photoMessage=document.getElementById('photo-message');
  const photoReview=document.getElementById('photo-review');
  const orderInput=document.getElementById('media-order');
  const zipMessage=document.getElementById('zip-message');
  const uploadForm=document.getElementById('upload-form');
  let mode='photos';
  let selected=[];
  let order=[];
  let urls=[];
  function clearGallery(){ urls.forEach(u=>URL.revokeObjectURL(u)); urls=[]; selected=[]; order=[]; if(photoReview) photoReview.replaceChildren(); if(orderInput)orderInput.value=''; }
  function setMode(next){
    mode=next;
    for(const b of uploads){ const yes=b.dataset.uploadMode===mode; b.classList.toggle('selected',yes); b.setAttribute('aria-pressed',String(yes)); }
    if(photosWrap) photosWrap.hidden=mode!=='photos';
    if(zipWrap)zipWrap.hidden=mode!=='zip';
    if(mode==='photos' && zipInput) zipInput.value='';
    if(mode==='zip' && photosInput){photosInput.value='';clearGallery();}
  }
  uploads.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.uploadMode)));
  zipInput?.addEventListener('change',()=>{ const f=zipInput.files?.[0];if(zipMessage)zipMessage.textContent=f?`${f.name} · ${(f.size/1048576).toFixed(1)}MB`:'선택한 ZIP 없음'; });
  async function photoInfo(file){
    const url=URL.createObjectURL(file);urls.push(url);
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>resolve({url,good:img.naturalWidth===1080&&img.naturalHeight===1350,dims:`${img.naturalWidth}×${img.naturalHeight}`});
      img.onerror=()=>resolve({url,good:false,dims:'열기 실패'});
      img.src=url;
    });
  }
  function paintGallery(){
    if(!photoReview)return;
    photoReview.replaceChildren();
    order.forEach((original,i)=>{
      const item=selected[original],li=document.createElement('li'),label=document.createElement('div');
      label.className='photo-index';label.textContent=`${i+1}번째 · ${item.dims}`;
      const pic=document.createElement('img');pic.src=item.url;pic.alt=`${i+1}번 이미지 미리보기`;
      const control=document.createElement('div');control.className='photo-controls';
      [[-1,'위로'],[1,'아래로']].forEach(([step,title])=>{
        const b=document.createElement('button');b.type='button';b.textContent=step<0?'↑':'↓';b.setAttribute('aria-label',`${i+1}번 사진 ${title}`);
        b.disabled=(i+step<0||i+step>=order.length);
        b.addEventListener('click',()=>{[order[i],order[i+step]]=[order[i+step],order[i]];paintGallery();});control.append(b);
      });
      li.append(pic,label,control);photoReview.append(li);
    });
    if(orderInput) orderInput.value=JSON.stringify(order);
  }
  photosInput?.addEventListener('change', async ()=>{
    const files=Array.from(photosInput.files||[]);clearGallery();
    if(files.length!==6){if(photoMessage){photoMessage.textContent=`${files.length}장 선택됨 · PNG 6장이 필요합니다.`;photoMessage.className='file-help invalid';}return;}
    const wrong=files.find(f=>!f.name.toLowerCase().endsWith('.png')||f.size>15*1048576);
    const total=files.reduce((a,f)=>a+f.size,0);
    selected=await Promise.all(files.map(async f=>({...await photoInfo(f),filename:f.name})));
    order=files.map((_,i)=>i);
    // Preserve clearly numbered slide ordering when selecting a ZIP-extracted gallery.
    const nums=files.map(f=>f.name.match(/(?:^|[_-])0?([1-6])\.png$/i)?.[1]);
    if(nums.every(Boolean)&&new Set(nums).size===6)order.sort((a,b)=>Number(nums[a])-Number(nums[b]));
    const valid=!wrong&&total<=30*1048576&&selected.every(f=>f.good);
    if(photoMessage){photoMessage.textContent=valid?'사진 6장 확인 완료 · 순서가 맞는지 확인하세요.':'파일 형식·용량 또는 1080×1350 규격을 확인하세요.';photoMessage.className='file-help '+(valid?'valid':'invalid');}
    paintGallery();
  });
  uploadForm?.addEventListener('submit',e=>{
    if(mode==='photos'){
      if(selected.length!==6||selected.some(f=>!f.good)||Array.from(photosInput.files).some(f=>f.size>15*1048576)||Array.from(photosInput.files).reduce((a,f)=>a+f.size,0)>30*1048576){
        e.preventDefault();photoMessage.textContent='PNG 6장과 1080×1350 규격을 확인하세요.';photoMessage.className='file-help invalid';photoMessage.scrollIntoView({block:'center',behavior:'smooth'});return;
      }
      orderInput.value=JSON.stringify(order);
    } else if(!zipInput.files?.length){ e.preventDefault();zipMessage.textContent='ZIP 파일을 선택하세요.';zipMessage.className='file-help invalid';return; }
    const b=document.getElementById('upload-submit');if(b){b.disabled=true;b.textContent='등록 중입니다…';}
  });
  // Client filters only change visibility; server access rules remain authoritative.
  const filters=document.querySelectorAll('.filter');
  const cards=Array.from(document.querySelectorAll('.post-card'));
  const filterEmpty=document.getElementById('filter-empty');
  filters.forEach(button=>button.addEventListener('click',()=>{
    const status=button.dataset.status;let count=0;
    filters.forEach(b=>{ const on=b===button;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on)); });
    cards.forEach(card=>{const match=status==='all'||card.dataset.status===status||(status==='attention'&&['failed','uncertain','processing','submitting'].includes(card.dataset.status));card.hidden=!match;if(match)count++;});
    if(filterEmpty)filterEmpty.hidden=count>0||cards.length===0;
  }));
  document.querySelectorAll('[data-mobile-nav]').forEach(a=>a.addEventListener('click',()=>{
    document.querySelectorAll('[data-mobile-nav]').forEach(x=>x.classList.toggle('active',x===a));
  }));
  const dialog=document.getElementById('carousel-dialog');
  const image=document.getElementById('dialog-img');
  const title=document.getElementById('dialog-title');
  const pageNumber=document.getElementById('dialog-page');
  const prev=document.getElementById('dialog-prev');
  const next=document.getElementById('dialog-next');
  let pid=0,page=1,startX=null;
  function paintDialog(){ if(!dialog||!image)return;image.src=`/preview/${pid}/${page}`;image.alt=`캐러셀 ${page} / 6`;pageNumber.textContent=`${page} / 6`;prev.disabled=page===1;next.disabled=page===6; }
  document.querySelectorAll('.preview-open').forEach(b=>b.addEventListener('click',()=>{
    pid=Number(b.dataset.postId);page=1;title.textContent=b.dataset.title||'캐러셀 미리보기';paintDialog();dialog.showModal();
  }));
  document.getElementById('dialog-close')?.addEventListener('click',()=>dialog.close());
  prev?.addEventListener('click',()=>{page=Math.max(1,page-1);paintDialog();});
  next?.addEventListener('click',()=>{page=Math.min(6,page+1);paintDialog();});
  image?.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;},{passive:true});
  image?.addEventListener('touchend',e=>{if(startX===null)return;const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>48){page=Math.max(1,Math.min(6,page+(dx<0?1:-1)));paintDialog();}startX=null;},{passive:true});
  dialog?.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){page=Math.min(6,page+1);paintDialog();}else if(e.key==='ArrowLeft'){page=Math.max(1,page-1);paintDialog();}});
  dialog?.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
})();
