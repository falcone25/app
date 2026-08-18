const $=(sel,root=document)=>root.querySelector(sel);
const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];

const feed=$('#feed');
const tpl=$('#cardTemplate');
const chips=$('#chips');
const notesScreen=$('#notesScreen');
const reflectionScreen=$('#reflectionScreen');
const noteDialog=$('#noteDialog');
const repeatDialog=$('#repeatDialog');

const memoryStore={};
function storageGet(key,fallback){
  try{const raw=localStorage.getItem(key);return raw===null?fallback:JSON.parse(raw)}
  catch(e){return key in memoryStore?memoryStore[key]:fallback}
}
function storageSet(key,value){
  try{localStorage.setItem(key,JSON.stringify(value))}
  catch(e){memoryStore[key]=value}
}

const today=()=>new Date().toISOString().slice(0,10);
const nowISO=()=>new Date().toISOString();
const addDays=(days)=>{const d=new Date();d.setDate(d.getDate()+Number(days));return d.toISOString()};
const escapeHTML=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const normalize=(s)=>String(s||'').toLowerCase().trim().replace(/[“”‘’]/g,"'").replace(/[.!?]+$/,'').replace(/\s+/g,' ');

let cards=[];
let filter='all';
let mode='feed';
let saved=new Set(storageGet('peacefeed-saved',[]));
let notes=storageGet('peacefeed-notes',[]);
let viewed=storageGet('peacefeed-view-history',{}); // {cardId:{lastViewed, count}}
let viewedByDay=storageGet('peacefeed-viewed-by-day',{});
let repeats=storageGet('peacefeed-repeats',{}); // {cardId:{dueAt, scheduledAt}}
let observer=null;

async function loadCards(){
  try{
    if(Array.isArray(window.PEACEFEED_EMBEDDED_CARDS)){cards=window.PEACEFEED_EMBEDDED_CARDS;return}
    const response=await fetch(`./data/cards.json?v=${Date.now()}`,{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data.cards)) throw new Error('cards.json has no cards array');
    cards=data.cards;
  }catch(err){
    console.error('Could not load cards.json',err);
    feed.innerHTML=`<div class="empty"><strong>Не удалось загрузить карточки.</strong><br><br>Если сайт открыт через GitHub Pages, просто обнови страницу. Если проблема повторяется — проверь, что <code>data/cards.json</code> загружен в репозиторий.</div>`;
    throw err;
  }
}

function isDue(id){const r=repeats[id];return Boolean(r&&new Date(r.dueAt)<=new Date())}
function unseen(id){return !viewed[id]}
function cardScore(c){
  if(isDue(c.id)) return 0;
  if(unseen(c.id)) return 1;
  const last=viewed[c.id]?.lastViewed||'1970-01-01';
  return 2+new Date(last).getTime()/1e15;
}
function sortedCards(list){
  return [...list].sort((a,b)=>{
    const da=isDue(a.id), db=isDue(b.id);
    if(da!==db) return da?-1:1;
    const ua=unseen(a.id), ub=unseen(b.id);
    if(ua!==ub) return ua?-1:1;
    return new Date(viewed[a.id]?.lastViewed||0)-new Date(viewed[b.id]?.lastViewed||0);
  });
}

function markViewed(id){
  const d=today();
  const daySet=new Set(viewedByDay[d]||[]);
  daySet.add(id); viewedByDay[d]=[...daySet];
  const prev=viewed[id]||{count:0};
  viewed[id]={count:(prev.count||0)+1,lastViewed:nowISO()};
  if(isDue(id)){delete repeats[id];storageSet('peacefeed-repeats',repeats)}
  storageSet('peacefeed-viewed-by-day',viewedByDay);
  storageSet('peacefeed-view-history',viewed);
}
function setupObserver(){
  if(observer) observer.disconnect();
  observer=new IntersectionObserver(entries=>entries.forEach(e=>{
    if(e.isIntersecting&&e.intersectionRatio>.55) markViewed(e.target.dataset.id)
  }),{root:feed,threshold:[.55]});
  $$('.card',feed).forEach(c=>observer.observe(c));
}

function interactionHTML(inter){
  if(!inter) return '';
  if(inter.kind==='reveal') return `<button class="reveal primary">${escapeHTML(inter.label||'показать')}</button><div class="answer">${inter.answer||''}</div>`;
  if(inter.kind==='open') return `<div class="micro"><strong>${escapeHTML(inter.prompt||'')}</strong></div><textarea class="answer-box" placeholder="${escapeHTML(inter.placeholder||'напиши ответ')}"></textarea><button class="open-check primary">${escapeHTML(inter.label||'сравнить')}</button><div class="answer"><strong>Один хороший вариант:</strong><br>${inter.model||''}${inter.check?`<ul class="checklist">${inter.check.map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>`:''}</div>`;
  if(inter.kind==='exact') return `<div class="micro"><strong>${escapeHTML(inter.prompt||'')}</strong></div><input class="answer-box exact-input" placeholder="${escapeHTML(inter.placeholder||'твой ответ')}"><button class="exact-check primary">${escapeHTML(inter.label||'проверить')}</button><div class="feedback"></div><div class="answer"><strong>Вариант:</strong><br>${inter.model||''}</div>`;
  return '';
}

function currentCards(){
  let list=cards.filter(c=>filter==='all'||c.cats?.includes(filter));
  if(mode==='saved') list=list.filter(c=>saved.has(c.id));
  return sortedCards(list);
}

function renderFeed(){
  feed.innerHTML='';
  const shown=currentCards();
  if(!shown.length){
    const msg=mode==='saved'?'Здесь пока пусто. Нажми «♡ сохранить» на карточке — она появится здесь.':'В этой вкладке пока нет карточек.';
    feed.innerHTML=`<div class="empty">${msg}</div>`;
    return;
  }
  shown.forEach(c=>{
    const el=tpl.content.firstElementChild.cloneNode(true);
    el.dataset.id=c.id;
    $('.pill',el).textContent=c.type||'CARD';
    $('.time',el).textContent=(isDue(c.id)?'↻ пора повторить · ':'')+(c.time||'');
    $('h2',el).textContent=c.title||'';
    $('.body',el).innerHTML=c.bodyHtml||'';

    const inter=$('.interactive',el);
    inter.innerHTML=interactionHTML(c.interaction);
    if(c.interaction?.kind==='reveal') $('.reveal',inter)?.addEventListener('click',()=>$('.answer',inter)?.classList.toggle('show'));
    if(c.interaction?.kind==='open') $('.open-check',inter)?.addEventListener('click',()=>$('.answer',inter)?.classList.add('show'));
    if(c.interaction?.kind==='exact') $('.exact-check',inter)?.addEventListener('click',()=>{
      const input=$('.exact-input',inter);const feedback=$('.feedback',inter);const val=normalize(input.value);
      const ok=(c.interaction.answers||[]).map(normalize).includes(val);
      feedback.innerHTML=ok?'✓ <strong>Да, этот вариант подходит.</strong>':'Формулировка отличается от варианта, который я проверяю автоматически. Сравни с примером ниже: хороший альтернативный ответ тоже может не совпасть дословно.';
      feedback.style.color=ok?'#315b2b':'#8E2947';
      $('.answer',inter)?.classList.add('show');
    });

    const src=$('.source',el);
    if(c.source?.url) src.innerHTML=`<span class="source-label">SOURCE / READ MORE</span><a target="_blank" rel="noopener" href="${escapeHTML(c.source.url)}">${escapeHTML(c.source.title||'Источник')} ↗</a>`;
    else src.innerHTML='<span class="source-label">SHITPOST</span>Это шутка, не factual claim.';

    const saveBtn=$('.save-btn',el); updateSaveButton(saveBtn,c.id);
    saveBtn.addEventListener('click',()=>toggleSaved(c.id,saveBtn,el));
    const repeatBtn=$('.repeat-btn',el); updateRepeatButton(repeatBtn,c.id);
    repeatBtn.addEventListener('click',()=>openRepeatDialog(c.id));
    $('.note-btn',el).addEventListener('click',()=>openNoteDialog(c.id));
    feed.appendChild(el);
  });
  requestAnimationFrame(()=>{feed.scrollTop=0;setupObserver()});
  $('#savedToggle').textContent=mode==='saved'?'♥':'♡';
}

function updateSaveButton(btn,id){
  btn.classList.toggle('saved',saved.has(id));
  btn.textContent=saved.has(id)?'♥ сохранено':'♡ сохранить';
}
function toggleSaved(id,btn,cardEl){
  saved.has(id)?saved.delete(id):saved.add(id);
  storageSet('peacefeed-saved',[...saved]);updateSaveButton(btn,id);
  if(mode==='saved'&&!saved.has(id)){cardEl.remove();if(!$('.card',feed))feed.innerHTML='<div class="empty">Здесь пока пусто.</div>'}
  renderTodayStats();
}
function updateRepeatButton(btn,id){
  const r=repeats[id];
  if(!r){btn.textContent='↻ повторить';btn.classList.remove('scheduled');return}
  const due=new Date(r.dueAt);
  const label=due.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
  btn.textContent=isDue(id)?'↻ повторить сейчас':`↻ ${label}`;
  btn.classList.add('scheduled');
}
function openRepeatDialog(cardId){
  $('#repeatCardId').value=cardId;
  if(typeof repeatDialog.showModal==='function')repeatDialog.showModal();
}
$$('.repeat-option').forEach(btn=>btn.addEventListener('click',(e)=>{
  e.preventDefault();
  const id=$('#repeatCardId').value; const days=Number(btn.value);
  repeats[id]={scheduledAt:nowISO(),dueAt:addDays(days)};
  storageSet('peacefeed-repeats',repeats);
  repeatDialog.close(); renderFeed();
}));

function setFilter(next){
  filter=next;
  $$('.chip').forEach(x=>x.classList.toggle('active',x.dataset.filter===filter));
  renderFeed();
}
$$('.chip').forEach(b=>b.addEventListener('click',()=>setFilter(b.dataset.filter)));
$('#savedToggle').addEventListener('click',()=>switchScreen(mode==='saved'?'feed':'saved'));

function switchScreen(next){
  mode=next;
  const showingFeed=next==='feed'||next==='saved';
  feed.hidden=!showingFeed; chips.hidden=!showingFeed;
  notesScreen.hidden=next!=='notes'; reflectionScreen.hidden=next!=='reflection';
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.screen===next));
  if(showingFeed)renderFeed();
  if(next==='notes')renderNotes();
  if(next==='reflection'){loadReflection();renderTodayStats()}
  window.scrollTo({top:0,behavior:'auto'});
}
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>switchScreen(b.dataset.screen)));

function openNoteDialog(cardId=''){
  $('#noteForm').reset();$('#noteCardId').value=cardId;
  const card=cards.find(c=>c.id===cardId);
  $('#noteDialogTitle').textContent=card?`заметка · ${card.title}`:'новая заметка';
  if(typeof noteDialog.showModal==='function')noteDialog.showModal();
}
$('#newNote').addEventListener('click',()=>openNoteDialog(''));
$('#noteForm').addEventListener('submit',(e)=>{
  if(e.submitter?.value==='cancel')return;
  e.preventDefault();
  const text=$('#noteText').value.trim();if(!text)return;
  const cardId=$('#noteCardId').value;
  notes.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:$('#noteTitle').value.trim(),text,link:$('#noteLink').value.trim(),cardId,createdAt:nowISO()});
  storageSet('peacefeed-notes',notes);noteDialog.close();if(mode==='notes')renderNotes();
});
function renderNotes(){
  const list=$('#notesList');
  if(!notes.length){list.innerHTML='<div class="empty">Пока пусто. Можно сохранять мысли прямо из карточек или добавить свободную заметку.</div>';return}
  list.innerHTML=notes.map(n=>{const card=cards.find(c=>c.id===n.cardId);return `<article class="note-card"><div class="note-meta">${new Date(n.createdAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${card?` · из карточки «${escapeHTML(card.title)}»`:''}</div>${n.title?`<h3>${escapeHTML(n.title)}</h3>`:''}<p>${escapeHTML(n.text)}</p>${n.link?`<a href="${escapeHTML(n.link)}" target="_blank" rel="noopener">${escapeHTML(n.link)} ↗</a>`:''}<div class="note-actions"><button data-delete="${n.id}">удалить</button></div></article>`}).join('');
  $$('[data-delete]',list).forEach(b=>b.addEventListener('click',()=>{notes=notes.filter(n=>n.id!==b.dataset.delete);storageSet('peacefeed-notes',notes);renderNotes()}));
}

function reflectionKey(){return `peacefeed-reflection-${today()}`}
function loadReflection(){const r=storageGet(reflectionKey(),{});$('#reflectionLearned').value=r.learned||'';$('#reflectionPractice').value=r.practice||'';$('#reflectionQuestion').value=r.question||'';$('#reflectionSaved').textContent=''}
$('#saveReflection').addEventListener('click',()=>{
  storageSet(reflectionKey(),{learned:$('#reflectionLearned').value,practice:$('#reflectionPractice').value,question:$('#reflectionQuestion').value,updatedAt:nowISO()});
  $('#reflectionSaved').textContent='сохранено для сегодняшнего дня ✓';setTimeout(()=>$('#reflectionSaved').textContent='',1800);
});
function renderTodayStats(){
  if(!$('#todayStats'))return;
  const dayViewed=(viewedByDay[today()]||[]).length;
  const todayNotes=notes.filter(n=>n.createdAt?.slice(0,10)===today()).length;
  const due=Object.keys(repeats).filter(isDue).length;
  $('#todayStats').innerHTML=`<div class="stat"><strong>${dayViewed}</strong><span>карточек сегодня</span></div><div class="stat"><strong>${saved.size}</strong><span>в избранном</span></div><div class="stat"><strong>${due}</strong><span>пора повторить</span></div>`;
}

async function init(){
  await loadCards();
  renderFeed();
  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn))}
}
init().catch(()=>{});
