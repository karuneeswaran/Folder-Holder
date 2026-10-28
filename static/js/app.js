const $ = (sel) => document.querySelector(sel);

const fileInput = $('#fileInput');
const uploadBtn = $('#uploadBtn');
const askBtn = $('#askBtn');
const chip = $('#fileChip');
const workspace = $('#workspace');
const messages = $('#messages');
const question = $('#question');
const sendBtn = $('#send');
const drop = $('#drop');

let docId = null;
let history = [];
let busy = false;

/* ---------- helpers ---------- */
async function api(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error('Cannot reach the server. Is app.py running?');
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Server error (${res.status})`);
  }
  return data;
}

function addMsg(kind, text) {
  const div = document.createElement('div');
  div.className = `msg ${kind}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function setBusy(state) {
  busy = state;
  sendBtn.disabled = state;
  document.querySelectorAll('.chip').forEach((b) => (b.disabled = state));
}

/* ---------- upload ---------- */
async function upload(file) {
  chip.hidden = false;
  chip.className = 'file-chip';
  chip.textContent = `Reading ${file.name}…`;

  const fd = new FormData();
  fd.append('file', file);

  try {
    const d = await api('/api/upload', { method: 'POST', body: fd });
    docId = d.doc_id;
    history = [];
    messages.innerHTML = '';
    chip.textContent = `${d.name} · ${d.chars.toLocaleString()} characters` +
      (d.truncated ? ' (trimmed to fit)' : '');
    askBtn.disabled = false;
    workspace.hidden = false;
    addMsg('ai', 'Your document is ready. Choose Summarize or Key points, or ask me anything about it.');
    workspace.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    chip.className = 'file-chip error';
    chip.textContent = e.message;
  }
}

/* ---------- ask ---------- */
async function ask(mode, text = '') {
  if (!docId || busy) return;

  const label =
    mode === 'summarize' ? 'Summarize this document' :
    mode === 'keypoints' ? 'List the key points' : text;

  setBusy(true);
  addMsg('user', label);
  const typing = addMsg('ai typing', 'Thinking…');

  try {
    const d = await api('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_id: docId, mode, question: text, history }),
    });
    typing.remove();
    addMsg('ai', d.answer);
    history.push({ role: 'user', content: label }, { role: 'assistant', content: d.answer });
  } catch (e) {
    typing.remove();
    addMsg('error', e.message);
  } finally {
    setBusy(false);
  }
}

/* ---------- events ---------- */
uploadBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) upload(fileInput.files[0]);
  fileInput.value = '';
});

askBtn.addEventListener('click', () => {
  workspace.scrollIntoView({ behavior: 'smooth' });
  question.focus({ preventScroll: true });
});

document.querySelectorAll('.chip').forEach((b) =>
  b.addEventListener('click', () => ask(b.dataset.mode))
);

function sendQuestion() {
  const text = question.value.trim();
  if (!text) return;
  question.value = '';
  ask('question', text);
}
sendBtn.addEventListener('click', sendQuestion);
question.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendQuestion();
});

/* drag and drop */
['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragging'); })
);
['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragging'); })
);
drop.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) upload(file);
});