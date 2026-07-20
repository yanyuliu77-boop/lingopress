const catalog = window.LINGOPRESS_DATA || { articles: [] };
const publicationTime = Date.now();
const publishedArticles = catalog.articles
  .filter(item => new Date(item.publishAt).getTime() <= publicationTime)
  .sort((a, b) => new Date(b.publishAt) - new Date(a.publishAt));

let article = publishedArticles[0] || catalog.articles[0];
let dictionary = article?.dictionary || {};
let quizzes = article?.quizzes || [];

const state = {
  mode: 'focus', speed: 1, speechIndex: 0, speaking: false,
  words: JSON.parse(localStorage.getItem('lingopress-words') || '[]'),
  notes: article ? localStorage.getItem(`lingopress-notes-${article.id}`) || '' : ''
};

const licenseHashes = new Set([
  'c1e0d2dc078d3088296dbab9928382cb73b33f8a9ed4a716937cada3a3f45e50', '921e41296fe2d65b5ee96635d186475ee2b29587f83a2d354c8862f8bb2bae8b',
  'c7e1850853bd85a98ad82a7151a2d853b507f4c3296d07e6db1ede99c7843feb', 'cb4ce3840137bfd365b8538e1bb8989561ac822aebd30742166c253c68b15b1a',
  '6fc52a31747045d433d7fde3744648440550671d42ee2894939426033dc49b37', 'bb0f34aee1deb25b265da4d33872075bd8842af171763afb8f5554a6a19142d7',
  'd43fbcc264de97e029a9329201a359c49f31ec2187ace64b7406e58dafff3f7e', 'd4f77423012255b9c5a19cf3f6bfcfd18395e8c686b4c8ceebb4ed3d7291ff76',
  '1d597c010197cf69544dfd5303ab59fdd388d109b3f5d98066b9441f76602fb3', 'dcb5964c0e47c22abb88e6a3a5f0b30f8c44ba3752a9d11867e37b847bcd79b0',
  '3d0cd7e4948fb33fdd2bb63038c49a105f94acd5dd2fa6bb99202732b4b39cdc', '790c76d5cd9bd16f9895ce14a266200e986dfe43a513b5889a712b51a8f5ddc6',
  '7ba585ef00305e1bd1857f850f82876faef3c3efa6770e32556483298a50c154', 'c89654ba87662d7dcf34fd597a384b813e33893d3a37e4d3ed025afb9502f7a9',
  '335b14bcb29b96575dcedd989b8699f2f67e2bccd554710ec190752f6fdcab6b', '65392ddd5a7d052a6d3ba2b8e547377c8915566a5539f5e0ffef71516d29bfb4',
  '3a299c05742569ec517b8a84e2fcf0f002a812b3f0e01f1652a0c84021d15623', '9f8922be996f159146f5f08c6a932f4a8fd58fdfa92da6da9222dd14e02aa261',
  'c02a9f40428cabdf23c1f17557c56e82bbe8340ecd065dae1c9ba13b761845e2', 'd7f95d0ffc62988fc877420d6947277e088748e680d7910b2fd548bee73b9c7a'
]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function articleWordCount(item = article) {
  return item.paragraphs.reduce((total, paragraph) => total + paragraph.en.trim().split(/\s+/).length, 0);
}

function formatEditionDate(value, style = 'short') {
  const date = new Date(value);
  if (style === 'ticker') {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Shanghai' }).format(date).toUpperCase();
    const stamp = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).format(date).replaceAll('-', '.');
    return `${stamp} · ${day}`;
  }
  return new Intl.DateTimeFormat('en-US', { month: style === 'long' ? 'long' : 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Shanghai' }).format(date).toUpperCase();
}

function findWordData(word) {
  return dictionary[word] || catalog.articles.map(item => item.dictionary?.[word]).find(Boolean);
}

function renderEdition() {
  if (!article) return;
  const words = articleWordCount();
  const issue = String(article.issue).padStart(3, '0');
  $('#gateEdition').textContent = `DAILY ENGLISH · ISSUE ${issue}`;
  $('#tickerDate').textContent = formatEditionDate(article.publishAt, 'ticker');
  $('#tickerCategory').textContent = article.category;
  $('#tickerDuration').textContent = `约 ${article.readingMinutes} 分钟`;
  $('#homeSource').textContent = article.source;
  $('#homeTopic').textContent = article.topic;
  $('#homeTitle').textContent = article.homeTitle;
  $('#homeDek').textContent = article.dek;
  $('#homeDate').textContent = formatEditionDate(article.publishAt);
  $('#homeLevelWords').textContent = `${article.level} · ${words} WORDS`;
  $('#homeImage').src = article.heroImage;
  $('#homeImage').alt = article.heroImageAlt;
  $('#homeIssue').textContent = String(article.issue).padStart(2, '0');
  $('#homeImageCredit').textContent = article.imageCredit || article.source;
  $('#summaryPoints').innerHTML = article.summaryPoints.map((point, index) => `<div><span class="snapshot-num">${String(index + 1).padStart(2, '0')}</span><p>${escapeHtml(point)}</p></div>`).join('');
  $('#routeParagraphs').textContent = `${article.paragraphs.length} 段 · ${Math.max(4, Math.round(words / 130))} 分钟`;
  $('#routeWords').textContent = `${Object.keys(dictionary).length} 个核心词组`;
  $('#phraseTerm').textContent = article.phrase.term;
  $('#phrasePhonetic').textContent = article.phrase.phonetic;
  $('#phraseMeaning').textContent = article.phrase.meaning;
  $('#phraseExample').textContent = article.phrase.example;
  const sourceLink = $('#readerSource');
  sourceLink.textContent = article.source;
  sourceLink.href = article.sourceUrl || '#';
  sourceLink.toggleAttribute('aria-disabled', !article.sourceUrl);
  $('#readerCategory').textContent = `今日精读 · ${article.category}`;
  $('#readerTitle').textContent = article.title;
  $('#readerStandfirst').textContent = article.standfirst;
  $('#readerDate').textContent = formatEditionDate(article.publishAt, 'long');
  $('#readerWords').textContent = `${words} WORDS`;
  $('#readerLevel').textContent = `${article.level} ADVANCED`;
  $('#keyTakeaway').textContent = article.keyTakeaway;
  $('#syntaxSentence').textContent = article.syntax.sentence;
  $('#syntaxExplanation').textContent = article.syntax.explanation;
  document.title = `${article.homeTitle} · LingoPress`;
}

function renderArchive() {
  const archive = $('#archiveList');
  const items = publishedArticles.map(item => {
    const date = new Date(item.publishAt);
    const month = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'Asia/Shanghai' }).format(date).toUpperCase();
    const day = new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'Asia/Shanghai' }).format(date);
    return `<button class="archive-item" data-article-id="${escapeHtml(item.id)}"><span class="archive-date">${month}<br><b>${day}</b></span><img src="${escapeHtml(item.heroImage)}" alt=""><span class="archive-copy"><small>${escapeHtml(item.source)} · ${escapeHtml(item.category)}</small><b>${escapeHtml(item.title)}</b><em>${item.readingMinutes} min · ${escapeHtml(item.level)}</em></span><span>→</span></button>`;
  }).join('');
  archive.innerHTML = `${items}<div class="coming-soon"><span>07</span><p><b>下一篇将在明日 07:00 发布</b><small>内容会自动生成并准时切换，无需人工上传。</small></p><button id="notifyButton">开启提醒</button></div>`;
}

function selectArticle(id) {
  const selected = publishedArticles.find(item => item.id === id);
  if (!selected) return;
  article = selected;
  dictionary = article.dictionary || {};
  quizzes = article.quizzes || [];
  state.notes = localStorage.getItem(`lingopress-notes-${article.id}`) || '';
  renderEdition();
  renderArticle();
  renderQuiz();
  $('#notes').value = state.notes;
  showView('reader');
}

async function hashKey(value) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function unlockSite() {
  document.body.classList.remove('locked');
  $('#accessGate').hidden = true;
}

$('#accessKey').addEventListener('input', event => {
  const raw = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  event.target.value = [raw.slice(0, 2), raw.slice(2, 6), raw.slice(6, 10)].filter(Boolean).join('-');
});

$('#accessForm').addEventListener('submit', async event => {
  event.preventDefault();
  const message = $('#gateMessage');
  const blockedUntil = Number(localStorage.getItem('lingopress-blocked-until') || 0);
  if (Date.now() < blockedUntil) { message.textContent = '尝试次数过多，请稍后再试。'; message.classList.add('error'); return; }
  const hash = await hashKey($('#accessKey').value);
  if (licenseHashes.has(hash)) {
    localStorage.setItem('lingopress-license', hash);
    localStorage.removeItem('lingopress-access-attempts');
    message.classList.remove('error'); message.textContent = '验证成功，正在进入…';
    setTimeout(unlockSite, 250); return;
  }
  const attempts = Number(localStorage.getItem('lingopress-access-attempts') || 0) + 1;
  localStorage.setItem('lingopress-access-attempts', attempts);
  if (attempts >= 5) { localStorage.setItem('lingopress-blocked-until', Date.now() + 30000); localStorage.setItem('lingopress-access-attempts', 0); }
  message.textContent = '密钥无效，请核对店铺发货消息中的字符。'; message.classList.add('error');
});

function annotate(text) {
  const terms = Object.keys(dictionary).sort((a, b) => b.length - a.length);
  const safeText = escapeHtml(text);
  if (!terms.length) return safeText;
  const pattern = new RegExp(`\\b(${terms.map(escapeRegex).join('|')})\\b`, 'gi');
  return safeText.replace(pattern, match => `<span class="vocab-word" data-word="${escapeHtml(match.toLowerCase())}">${match}</span>`);
}

function sentenceMarkup(text, paragraphIndex) {
  const sentences = text.match(/[^.!?]+[.!?][””']?|[^.!?]+$/g) || [text];
  return sentences.map((sentence, index) => `<span class="sentence" data-p="${paragraphIndex}" data-s="${index}">${annotate(sentence.trim())}</span>`).join(' ');
}

function renderArticle() {
  $('#articleBody').innerHTML = article.paragraphs.map((p, i) => `
    <section class="paragraph-block" id="paragraph-${i}">
      <span class="paragraph-number">0${i + 1}</span>
      <p class="english-text">${sentenceMarkup(p.en, i)}</p>
      <p class="translation">${escapeHtml(p.zh)}</p>
      <div class="paragraph-note">${escapeHtml(p.note.replace(/<\/?b>/gi, ''))}</div>
    </section>`).join('');
  $('#sectionDots').innerHTML = article.paragraphs.map((_, i) => `<button data-target="paragraph-${i}" aria-label="第 ${i + 1} 段"></button>`).join('');
}

function renderQuiz() {
  $('#quizList').innerHTML = quizzes.map((item, i) => `<div class="quiz-question"><b>${i + 1}. ${escapeHtml(item.q)}</b><div class="quiz-options">${item.options.map((option, j) => `<label><input type="radio" name="q${i}" value="${j}"> ${escapeHtml(option)}</label>`).join('')}</div></div>`).join('');
}

function showView(name) {
  speechSynthesis.cancel(); state.speaking = false; updatePlayButton();
  $$('.view').forEach(view => view.classList.remove('active-view'));
  $(`#${name}View`).classList.add('active-view');
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.action === name));
  window.scrollTo(0, 0);
  if (name === 'vocabulary') renderVocabulary();
}

function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function saveWord(word) {
  if (!findWordData(word)) return;
  if (!state.words.includes(word)) { state.words.push(word); localStorage.setItem('lingopress-words', JSON.stringify(state.words)); showToast(`已收藏 ${word}`); }
  else showToast(`${word} 已在生词本`);
  updateCounts(); showWord(word);
}

function showWord(word) {
  const data = findWordData(word); if (!data) return;
  $('#wordInspector').innerHTML = `<div class="study-heading"><span>单词解析</span><small>WORD INSPECTOR</small></div><div class="word-card"><h3>${escapeHtml(word)}</h3><span class="phonetic">${escapeHtml(data.phonetic)}</span><div class="meaning">${escapeHtml(data.meaning)}</div><p class="example">${escapeHtml(data.example)}</p><button data-save-word="${escapeHtml(word)}">${state.words.includes(word) ? '✓ 已收藏' : '＋ 加入生词本'}</button></div>`;
}

function renderVocabulary() {
  $('#vocabSummary').textContent = `${state.words.length} 个待复习`;
  const cards = state.words.map(word => ({ word, data: findWordData(word) })).filter(item => item.data);
  $('#vocabGrid').innerHTML = cards.length ? cards.map(({ word, data }) => `<article class="vocab-card"><h3>${escapeHtml(word)}</h3><small>${escapeHtml(data.phonetic)}</small><p><b>${escapeHtml(data.meaning)}</b><br>${escapeHtml(data.example)}</p><button data-remove-word="${escapeHtml(word)}">移出生词本</button></article>`).join('') : '<div class="empty-state">还没有收藏的词。进入今日精读，点击带下划线的表达开始积累。</div>';
}

function updateCounts() { $('#navWordCount').textContent = state.words.length; }

function createWaveform() {
  $('#waveform').innerHTML = Array.from({ length: 52 }, (_, i) => `<i style="height:${8 + ((i * 17) % 37)}px"></i>`).join('');
}

function updatePlayButton() { $('#playButton').textContent = state.speaking ? 'Ⅱ' : '▶'; $('#audioStatus').textContent = state.speaking ? '正在朗读' : '全文朗读'; }

function speakFrom(paragraph = state.speechIndex) {
  speechSynthesis.cancel(); state.speechIndex = paragraph; state.speaking = true; updatePlayButton();
  const utterance = new SpeechSynthesisUtterance(article.paragraphs.slice(paragraph).map(p => p.en).join(' '));
  utterance.lang = 'en-GB'; utterance.rate = state.speed; utterance.pitch = 1;
  utterance.onboundary = event => { if (event.name !== 'word') return; const bars = $$('#waveform i'); const progress = Math.min(bars.length - 1, Math.floor(event.charIndex / Math.max(1, utterance.text.length) * bars.length)); bars.forEach((bar, i) => bar.classList.toggle('active', i <= progress)); };
  utterance.onend = () => { state.speaking = false; updatePlayButton(); $$('.sentence').forEach(s => s.classList.remove('speaking')); };
  speechSynthesis.speak(utterance);
}

function updateProgress() {
  if (!$('#readerView').classList.contains('active-view')) return;
  const articleEl = $('.article-column');
  const top = articleEl.getBoundingClientRect().top + window.scrollY;
  const total = articleEl.offsetHeight - window.innerHeight;
  const percent = Math.max(0, Math.min(100, Math.round((window.scrollY - top + 100) / Math.max(1, total) * 100)));
  $('#progressBar').style.height = `${percent}%`; $('#progressText').textContent = `${percent}%`;
  $$('.paragraph-block').forEach((block, i) => $$('#sectionDots button')[i]?.classList.toggle('seen', block.getBoundingClientRect().top < window.innerHeight * .65));
  localStorage.setItem('lingopress-progress', percent);
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'home') showView('home');
  if (action === 'archive') showView('archive');
  if (action === 'vocabulary') showView('vocabulary');
  if (action === 'start-reading') showView('reader');
  if (action === 'quick-listen') { showView('reader'); setTimeout(() => speakFrom(0), 150); }
  if (action === 'save-phrase') saveWord(article.phrase.term.toLowerCase());
  const archiveItem = event.target.closest('[data-article-id]');
  if (archiveItem) selectArticle(archiveItem.dataset.articleId);
  const sourceLink = event.target.closest('#readerSource[aria-disabled="true"]');
  if (sourceLink) event.preventDefault();
  const word = event.target.closest('.vocab-word')?.dataset.word;
  if (word) showWord(word);
  const save = event.target.closest('[data-save-word]')?.dataset.saveWord;
  if (save) saveWord(save);
  const remove = event.target.closest('[data-remove-word]')?.dataset.removeWord;
  if (remove) { state.words = state.words.filter(w => w !== remove); localStorage.setItem('lingopress-words', JSON.stringify(state.words)); updateCounts(); renderVocabulary(); }
  const dot = event.target.closest('[data-target]');
  if (dot) document.getElementById(dot.dataset.target).scrollIntoView();
  const sentence = event.target.closest('.sentence');
  if (sentence && !word) { $$('.sentence').forEach(s => s.classList.remove('speaking')); sentence.classList.add('speaking'); speakFrom(Number(sentence.dataset.p)); }
  if (event.target.closest('#notifyButton')) enableNotifications();
});

$$('[data-mode]').forEach(button => button.addEventListener('click', () => {
  $$('[data-mode]').forEach(b => b.classList.remove('active')); button.classList.add('active');
  state.mode = button.dataset.mode; $('#articleBody').dataset.mode = state.mode;
}));

$('#playButton').addEventListener('click', () => { if (state.speaking) { speechSynthesis.cancel(); state.speaking = false; updatePlayButton(); } else speakFrom(); });
$('#speedButton').addEventListener('click', () => { const speeds = [.75, 1, 1.25]; state.speed = speeds[(speeds.indexOf(state.speed) + 1) % speeds.length]; $('#speedButton').textContent = `${state.speed}×`; if (state.speaking) speakFrom(); });
$('#fontButton').addEventListener('click', () => $('#articleBody').classList.toggle('large-text'));
$('#bookmarkArticle').addEventListener('click', event => { const active = event.currentTarget.textContent === '★'; event.currentTarget.textContent = active ? '☆' : '★'; showToast(active ? '已取消收藏' : '文章已收藏'); });
$('#themeToggle').addEventListener('click', () => { document.body.classList.toggle('dark'); localStorage.setItem('lingopress-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); });
$('#notes').addEventListener('input', event => {
  state.notes = event.target.value;
  localStorage.setItem(`lingopress-notes-${article.id}`, event.target.value);
});
$('#submitQuiz').addEventListener('click', () => {
  let score = 0; quizzes.forEach((item, i) => { const picked = $(`input[name="q${i}"]:checked`); if (picked && Number(picked.value) === item.answer) score++; });
  const result = $('#quizResult'); result.hidden = false; result.textContent = score === quizzes.length ? `${score} / ${quizzes.length} · 全部正确，今日精读完成。` : `${score} / ${quizzes.length} · 回到原文找依据，再试一次。`; result.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
async function enableNotifications() {
  if (!('Notification' in window)) return showToast('当前浏览器不支持通知');
  const permission = await Notification.requestPermission();
  showToast(permission === 'granted' ? '已开启每日更新提醒' : '未获得通知权限');
}

$('#reviewWords').addEventListener('click', () => {
  if (!state.words.length) return showToast('先收藏几个词吧');
  const word = state.words[Math.floor(Math.random() * state.words.length)];
  const data = findWordData(word);
  showToast(data ? `${word} · ${data.meaning}` : '该词条已随旧内容归档');
});
window.addEventListener('scroll', updateProgress, { passive: true });

function schedulePublicationRefresh() {
  const next = catalog.articles
    .map(item => new Date(item.publishAt).getTime())
    .filter(time => time > Date.now())
    .sort((a, b) => a - b)[0];
  if (!next) return;
  const delay = Math.min(next - Date.now() + 1500, 2147483647);
  setTimeout(() => location.reload(), delay);
}

function init() {
  if (!article) {
    $('#gateMessage').textContent = '今日内容暂未完成发布，请稍后刷新。';
    return;
  }
  renderEdition(); renderArticle(); renderQuiz(); renderArchive(); createWaveform(); updateCounts(); schedulePublicationRefresh();
  $('#notes').value = state.notes;
  if (localStorage.getItem('lingopress-theme') === 'dark') document.body.classList.add('dark');
  const today = new Date().toISOString().slice(0, 10); const last = localStorage.getItem('lingopress-last-visit');
  let streak = Number(localStorage.getItem('lingopress-streak') || 1);
  if (last && last !== today) { const gap = (new Date(today) - new Date(last)) / 86400000; streak = gap === 1 ? streak + 1 : 1; }
  localStorage.setItem('lingopress-last-visit', today); localStorage.setItem('lingopress-streak', streak); $('#streakCount').textContent = streak;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (licenseHashes.has(localStorage.getItem('lingopress-license'))) unlockSite();
}

init();
