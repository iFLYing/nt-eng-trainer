/* 南通中考英语模拟训练 · 前端逻辑（原生 JS，消费 papers.json） */
"use strict";

/* 当前登录用户与 token（登录态走后端，未登录回退 localStorage guest） */
const LS = {
  token: "nt_token_v1",
  curUser: "nt_current_user_v1",
  accounts: "nt_accounts_v1",
  guest: "nt_guest_v1",
  adminToken: "nt_admin_token_v1",
  wrong: u => "nt_wrong_v1_" + (u || "guest"),
  history: u => "nt_history_v1_" + (u || "guest"),
};
function getAdminToken() { try { return localStorage.getItem(LS.adminToken); } catch (e) { return null; } }
function setAdminToken(t) { try { t ? localStorage.setItem(LS.adminToken, t) : localStorage.removeItem(LS.adminToken); } catch (e) {} }
function getToken() { try { return localStorage.getItem(LS.token); } catch (e) { return null; } }
function setToken(t) { try { t ? localStorage.setItem(LS.token, t) : localStorage.removeItem(LS.token); } catch (e) {} }
function currentUser() { try { return localStorage.getItem(LS.curUser); } catch (e) { return null; } }
function setCurrentUser(u) { try { u ? localStorage.setItem(LS.curUser, u) : localStorage.removeItem(LS.curUser); } catch (e) {} }
function isAuthed() { return !!getToken(); }
function getGuest() { try { return localStorage.getItem(LS.guest) === "1"; } catch (e) { return false; } }
function setGuest(on) { try { on ? localStorage.setItem(LS.guest, "1") : localStorage.removeItem(LS.guest); } catch (e) {} }
function isGuest() { return getGuest(); }

/* 统一网络层（带 Bearer token） */
async function api(method, path, body) {
  const headers = {};
  const t = getToken();
  if (t) headers["Authorization"] = "Bearer " + t;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ("请求失败(" + r.status + ")");
    throw new Error(msg);
  }
  return data;
}

/* ---------- 本地兜底（未登录 guest） ---------- */
function loadAccounts() { try { return JSON.parse(localStorage.getItem(LS.accounts)) || {}; } catch (e) { return {}; } }
function saveAccounts(a) { localStorage.setItem(LS.accounts, JSON.stringify(a)); }
function loadWrongSync() { const u = currentUser(); try { return JSON.parse(localStorage.getItem(LS.wrong(u))) || []; } catch (e) { return []; } }
function saveWrongSync(arr) { localStorage.setItem(LS.wrong(currentUser()), JSON.stringify(arr)); }
function loadHistorySync() { const u = currentUser(); try { return JSON.parse(localStorage.getItem(LS.history(u))) || []; } catch (e) { return []; } }
function saveHistorySync(arr) { localStorage.setItem(LS.history(currentUser()), JSON.stringify(arr)); }

/* ---------- 错题本（登录走后端 / 未登录走本地） ---------- */
async function loadWrong() {
  if (isAuthed()) {
    try { const r = await api("GET", "/api/wrong"); if (r && r.items) return r.items; } catch (e) {}
  }
  return loadWrongSync();
}
async function saveWrong(arr) {
  if (isAuthed()) {
    try { await api("PUT", "/api/wrong", { items: arr }); return; } catch (e) {}
  }
  saveWrongSync(arr);
}
async function persistWrong(newItems) {
  if (isAuthed()) {
    const arr = await loadWrong();
    await api("PUT", "/api/wrong", { items: arr.concat(newItems) });
  } else {
    const arr = loadWrongSync(); arr.push(...newItems); saveWrongSync(arr);
  }
}
async function refreshWrongBadge() {
  let n = 0;
  if (isAuthed()) { try { const r = await api("GET", "/api/wrong"); n = (r && r.items) ? r.items.length : 0; } catch (e) {} }
  else { n = loadWrongSync().length; }
  const el = $("#wrongCount");
  if (el) { el.textContent = n; el.style.display = n ? "inline-block" : "none"; }
}

function hashPw(pw) { let h = 0; for (let i = 0; i < (pw || "").length; i++) h = (h * 31 + pw.charCodeAt(i)) >>> 0; return "h" + h; }
function doLogin(name) {
  setCurrentUser(name); updateAuthUI(); refreshWrongBadge();
  if (state.mode === "home") renderHome();
}
async function registerUser(name, pw) {
  name = (name || "").trim();
  if (!name) { toast("请输入用户名"); return false; }
  if (!pw || pw.length < 3) { toast("密码至少 3 位"); return false; }
  try {
    const r = await api("POST", "/api/auth/register", { username: name, password: pw });
    if (r && r.token) { setToken(r.token); setGuest(false); resetFilters(); doLogin(name); toast("注册成功，已登录：" + name); return true; }
  } catch (e) { toast(e.message || "注册失败"); }
  return false;
}
async function loginUser(name, pw) {
  name = (name || "").trim();
  try {
    const r = await api("POST", "/api/auth/login", { username: name, password: pw });
    if (r && r.token) { setToken(r.token); setGuest(false); resetFilters(); doLogin(name); toast("登录成功：" + name); return true; }
  } catch (e) { toast(e.message || "登录失败"); }
  return false;
}
function logoutUser() {
  if (isAuthed()) { api("POST", "/api/auth/logout").catch(() => {}); }
  setToken(null); setCurrentUser(null); setGuest(false); resetFilters();
  updateAuthUI(); refreshWrongBadge(); toast("已退出登录");
  if (state.mode === "home") renderHome();
}
function updateAuthUI() {
  const el = document.getElementById("authArea");
  if (!el) return;
  if (isGuest()) {
    el.innerHTML = `<span class="user">👤 游客</span><button class="btn ghost sm" id="logoutGuestBtn">退出游客</button>`;
    const lb = document.getElementById("logoutGuestBtn");
    if (lb) lb.onclick = logoutGuest;
    return;
  }
  const u = currentUser();
  if (u) {
    const prof = (loadAccounts()[u] && loadAccounts()[u].profile) || {};
    const av = prof.avatar || "🧑‍🎓";
    el.innerHTML = `<span class="user">${av} ${esc(u)}</span><button class="btn ghost sm" id="logoutBtn">退出</button>`;
    const lb = document.getElementById("logoutBtn");
    if (lb) lb.onclick = logoutUser;
  } else {
    el.innerHTML = `<button class="btn sm" id="loginBtn">登录 / 注册</button>`;
    const lb = document.getElementById("loginBtn");
    if (lb) lb.onclick = () => openAuth("login");
  }
}
function openAuth(mode) {
  const mask = document.getElementById("authModal");
  if (!mask) return;
  mask.style.display = "flex";
  setAuthMode(mode || "login");
}
function setAuthMode(mode) {
  window.__authMode = mode;
  const t = document.getElementById("authTitle");
  const s = document.getElementById("authSubmit");
  if (t) t.textContent = mode === "reg" ? "注册账号" : "登录账号";
  if (s) s.textContent = mode === "reg" ? "注册并登录" : "登录";
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.auth === mode));
  const u = document.getElementById("authUser"); const p = document.getElementById("authPw");
  if (u) u.value = ""; if (p) p.value = "";
  if (u) u.focus();
}
function closeAuth() { const m = document.getElementById("authModal"); if (m) m.style.display = "none"; }
function submitAuth() {
  const name = document.getElementById("authUser").value;
  const pw = document.getElementById("authPw").value;
  if (window.__authMode === "reg") { if (registerUser(name, pw)) closeAuth(); }
  else { if (loginUser(name, pw)) closeAuth(); }
}
function wireAuthModal() {
  const mask = document.getElementById("authModal");
  if (!mask) return;
  mask.addEventListener("click", e => { if (e.target === mask) closeAuth(); });
  document.querySelectorAll(".seg-btn").forEach(b => b.onclick = () => setAuthMode(b.dataset.auth));
  const sub = document.getElementById("authSubmit"); if (sub) sub.onclick = submitAuth;
  const cancel = document.getElementById("authCancel"); if (cancel) cancel.onclick = closeAuth;
  const pw = document.getElementById("authPw");
  if (pw) pw.addEventListener("keydown", e => { if (e.key === "Enter") submitAuth(); });
  const un = document.getElementById("authUser");
  if (un) un.addEventListener("keydown", e => { if (e.key === "Enter" && pw) pw.focus(); });
}

/* ---------- 游客登录（受限体验模式） ---------- */
function loginGuest() {
  setGuest(true); setCurrentUser("guest"); resetFilters();
  updateAuthUI(); refreshWrongBadge(); renderHome();
  toast("已进入游客模式（限部分内容，登录后解锁全部）");
}
function logoutGuest() {
  setGuest(false); setCurrentUser(null); setToken(null); resetFilters();
  updateAuthUI(); refreshWrongBadge(); renderHome();
  toast("已退出游客模式");
}

/* ---------- 练习历史 & 成绩记录（按用户隔离） ---------- */
const HIST_KEY = "nt_history_v1";
function histKey() {
  const u = currentUser();
  return u ? (HIST_KEY + "_" + u) : (HIST_KEY + "_guest");
}
async function loadHistory() {
  try { return JSON.parse(localStorage.getItem(histKey())) || []; }
  catch (e) { return []; }
}
function saveHistory(arr) { localStorage.setItem(histKey(), JSON.stringify(arr)); }
function addHistoryRecord(rec) {
  const arr = loadHistory();
  arr.push(rec);
  if (arr.length > 200) arr = arr.slice(arr.length - 200); // 最多保留 200 条
  saveHistory(arr);
}

/* ---------- 用户画像（存储在账号记录中） ---------- */
async function getProfile() {
  const u = currentUser();
  if (!u) return null;
  const a = loadAccounts();
  return (a[u] && a[u].profile) || null;
}
async function saveProfile(patch) {
  const u = currentUser();
  if (!u) { toast("请先登录后再完善画像"); return false; }
  const a = loadAccounts();
  if (!a[u]) return false;
  a[u].profile = Object.assign({}, a[u].profile || {}, patch);
  saveAccounts(a);
  return true;
}

const state = {
  papers: [],
  allQ: [],
  mode: "home",
  session: null, // {title, questions, userAnswers, review, score}
  filters: { questionType: [], knowledge: [], topic: [], skill: [], difficulty: [] },
};

const TYPE_CN = {
  single_choice: "单项选择", cloze: "完形填空", reading: "阅读理解",
  vocabulary: "词汇运用", blank_filling: "短文填空",
  task_reading: "阅读与回答问题", writing: "书面表达",
};

/* ---------- 工具 ---------- */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function norm(s) {
  return String(s == null ? "" : s).trim().toLowerCase().replace(/\s+/g, " ");
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
}
function $(sel, root = document) { return root.querySelector(sel); }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- 数据加载与扁平化 ---------- */
async function loadData() {
  let data = null;
  for (const url of ["/api/questions", "./papers.json", "/papers.json"]) {
    try {
      const r = await fetch(url);
      if (r.ok) { data = await r.json(); break; }
    } catch (e) { /* 尝试下一个 */ }
  }
  if (!data) throw new Error("题库加载失败，请用本地服务器打开（见说明）。");
  state.papers = data.papers;
  state.allQ = flatten(data.papers);
  return state.allQ.length;
}

function flatten(papers) {
  const out = [];
  for (const p of papers) {
    for (const sec of p.sections) {
      const t = sec.type;
      if (t === "reading") {
        for (const ps of sec.passages || []) {
          for (const q of ps.questions || []) {
            const opts = (q.options && q.options.length) ? q.options : (ps.options || null);
            out.push({
              qid: q.id, paperId: p.id, paperTitle: p.title,
              sectionType: t, sectionName: sec.name, genre: ps.genre || "",
              stem: q.stem, options: opts, answer: q.answer,
              analysis: q.analysis, knowledgePoint: q.knowledgePoint || "",
              difficulty: q.difficulty, topic: (q.tags && q.tags.topic) || "",
              tags: q.tags, passageBody: ps.body, passageTitle: ps.title,
            });
          }
        }
      } else if (t === "writing") {
        out.push({
          qid: sec.id || (p.id + "-W"), paperId: p.id, paperTitle: p.title,
          sectionType: t, sectionName: sec.name,
          stem: sec.prompt, options: null, answer: sec.referenceVersion || "",
          analysis: sec.analysis, knowledgePoint: "",
          difficulty: 3, topic: (sec.tags && sec.tags.topic) || "",
          tags: sec.tags,
          prompt: sec.prompt, requirements: sec.requirements || [],
          referenceOutline: sec.referenceOutline || "",
          referenceVersion: sec.referenceVersion || "",
        });
      } else {
        for (const q of sec.questions || []) {
          const opts = q.options && q.options.length ? q.options : null;
          out.push({
            qid: q.id, paperId: p.id, paperTitle: p.title,
            sectionType: t, sectionName: sec.name,
            stem: q.stem, options: opts, answer: q.answer,
            analysis: q.analysis, knowledgePoint: q.knowledgePoint || "",
            difficulty: q.difficulty, topic: (q.tags && q.tags.topic) || "",
            tags: q.tags, passageBody: sec.passage || "",
          });
        }
      }
    }
  }
  return out;
}

/* ---------- 标签取值收集 ---------- */
function tagValues() {
  const sets = { questionType: new Set(), knowledge: new Set(), topic: new Set(), skill: new Set() };
  const diffs = new Set();
  for (const q of state.allQ) {
    const tg = q.tags || {};
    if (tg.questionType) sets.questionType.add(tg.questionType);
    if (tg.knowledge) sets.knowledge.add(tg.knowledge);
    if (tg.topic) sets.topic.add(tg.topic);
    if (tg.skill) sets.skill.add(tg.skill);
    if (q.difficulty) diffs.add(q.difficulty);
  }
  const order = { questionType: Object.values(TYPE_CN), knowledge: null, topic: null, skill: null };
  const r = {};
  for (const k of Object.keys(sets)) {
    let arr = [...sets[k]];
    if (order[k]) arr.sort((a, b) => order[k].indexOf(a) - order[k].indexOf(b));
    else arr.sort();
    r[k] = arr;
  }
  r.difficulty = [...diffs].sort((a, b) => a - b);
  return r;
}

/* ---------- 渲染：导航 ---------- */
function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === mode));
  if (mode === "home") renderHome();
  else if (mode === "mock") renderMockList();
  else if (mode === "practice") renderPracticeSetup();
  else if (mode === "wrong") renderWrongBook();
  else if (mode === "profile") renderProfile();
}

/* ---------- 渲染：首页 ---------- */
function renderHome() {
  const q = state.allQ;
  const papers = state.papers.length;
  const app = $("#app");

  // 顶部欢迎 / 登录注册 / 游客 三种状态
  let topCard = "";
  if (isGuest()) {
    topCard = `
    <div class="card guest-hero">
      <h2>👤 游客模式</h2>
      <p>已为您开放体验：整卷模考·模拟试卷（一）｜专项训练·单项选择。登录后可解锁全部 ${papers} 套卷与全部题型筛选。</p>
      <button class="btn ghost" id="exitGuest">退出游客模式</button>
    </div>`;
  } else if (currentUser()) {
    const prof = (loadAccounts()[currentUser()] && loadAccounts()[currentUser()].profile) || {};
    topCard = `
    <div class="card hero">
      <h2>${esc(prof.avatar || "🧑‍🎓")} 欢迎回来，${esc(currentUser())}</h2>
      <p>账号已与云端同步，错题本、练习历史与学习画像会跟着你走。</p>
    </div>`;
  } else {
    topCard = `
    <div class="card login-card">
      <h2>登录 / 注册</h2>
      <p class="meta">注册账号后，错题本、练习历史、学习画像将随账号云端保存、多设备同步。</p>
      <div class="seg" style="margin:8px 0">
        <button class="seg-btn active" id="homeLoginTab">登录</button>
        <button class="seg-btn" id="homeRegTab">注册</button>
      </div>
      <input id="homeUser" class="auth-input" placeholder="用户名" autocomplete="username" />
      <input id="homePw" class="auth-input" type="password" placeholder="密码（至少 3 位）" autocomplete="current-password" />
      <button class="btn wide" id="homeSubmit">登录</button>
      <button class="btn ghost wide" id="homeGuest">🚪 游客登录（免注册，限部分内容）</button>
    </div>`;
  }

  const statsCard = `
    <div class="card">
      <h2>题库概览</h2>
      <div class="stat-row">
        <div class="stat"><b>${papers}</b><span>模拟套卷</span></div>
        <div class="stat"><b>${q.length}</b><span>训练小题</span></div>
        <div class="stat"><b>7</b><span>覆盖题型</span></div>
        <div class="stat"><b>5</b><span>筛选维度</span></div>
      </div>
    </div>`;

  const tilesCard = `
    <div class="card">
      <h2>选择训练方式</h2>
      <p class="meta">整卷模考用于综合演练；专项训练按标签精准突破薄弱点；错题本自动沉淀错漏。</p>
      <div class="grid" style="margin-top:14px">
        <button class="tile" data-go="mock"><b>整卷模考</b><span>完整套卷限时演练</span></button>
        <button class="tile" data-go="random"><b>随机组卷</b><span>十套卷随机抽取组卷</span></button>
        <button class="tile" data-go="practice"><b>专项训练</b><span>按题型/知识点/话题筛</span></button>
        <button class="tile" data-go="wrong"><b>错题本</b><span>复习错漏、重练</span></button>
      </div>
    </div>`;

  const tipCard = `
    <div class="card tip-card">
      <h2>☕ 支持作者</h2>
      <p class="tip-desc">如果这个系统对你有帮助，欢迎打赏支持持续维护与更新</p>
      <div class="tip-qrcode-wrap">
        <img src="./tip-qrcode.png" alt="微信打赏二维码" />
      </div>
      <p class="tip-thanks">感谢你的支持 ❤️</p>
    </div>`;

  app.innerHTML = topCard + statsCard + tilesCard + tipCard;

  app.querySelectorAll("[data-go]").forEach(b =>
    b.onclick = () => {
      if (b.dataset.go === "random") {
        if (isGuest()) { toast("游客模式暂不支持随机组卷，登录后解锁"); return; }
        startRandom("home");
      } else {
        switchMode(b.dataset.go);
      }
    });

  const eg = $("#exitGuest"); if (eg) eg.onclick = logoutGuest;

  if (!currentUser() && !isGuest()) {
    const ht = $("#homeLoginTab"), hrt = $("#homeRegTab");
    const setHomeMode = m => {
      window.__homeMode = m;
      ht.classList.toggle("active", m === "login");
      hrt.classList.toggle("active", m === "reg");
      $("#homeSubmit").textContent = m === "reg" ? "注册并登录" : "登录";
    };
    window.__homeMode = "login";
    ht.onclick = () => setHomeMode("login");
    hrt.onclick = () => setHomeMode("reg");
    $("#homeSubmit").onclick = async () => {
      const name = $("#homeUser").value, pw = $("#homePw").value;
      if (window.__homeMode === "reg") { if (await registerUser(name, pw)) renderHome(); }
      else { if (await loginUser(name, pw)) renderHome(); }
    };
    $("#homeGuest").onclick = loginGuest;
    const pw = $("#homePw");
    if (pw) pw.addEventListener("keydown", e => { if (e.key === "Enter") $("#homeSubmit").click(); });
    const un = $("#homeUser");
    if (un) un.addEventListener("keydown", e => { if (e.key === "Enter" && pw) pw.focus(); });
  }
}

/* ---------- 渲染：整卷列表 ---------- */
function renderMockList() {
  const app = $("#app");
  const isG = isGuest();
  const papers = isG ? state.papers.slice(0, 1) : state.papers;
  const guestNote = isG
    ? `<p class="meta warn">游客模式：整卷模考仅开放 <b>模拟试卷（一）</b>。登录后解锁全部 ${state.papers.length} 套卷。</p>`
    : "";
  const tiles = papers.map(p => {
    const n = p.sections.reduce((s, sec) => {
      if (sec.type === "reading") return s + sec.passages.reduce((a, x) => a + x.questions.length, 0);
      if (sec.type === "writing") return s + 1;
      return s + (sec.questions ? sec.questions.length : 0);
    }, 0);
    return `<button class="tile" data-paper="${p.id}"><b>${esc(p.title)}</b>
      <span>主题：${esc(p.theme || "")} · ${n} 题 · ${p.totalScore}分</span></button>`;
  }).join("");
  const randBtn = isG
    ? `<button class="btn wide" id="randBtn" disabled title="游客模式暂不支持">🎲 随机组卷（登录后解锁）</button>`
    : `<button class="btn wide" id="randBtn">🎲 随机组卷（从十套卷随机抽取，题型同整卷）</button>`;
  app.innerHTML = `
    <div class="card">
      <h2>选择一套试卷</h2>
      <p class="meta">点击进入整卷答题，提交后显示得分与逐题解析。</p>
      ${guestNote}
      ${randBtn}
      <div class="grid" style="margin-top:14px">${tiles}</div>
    </div>`;
  const rb = $("#randBtn");
  if (rb && !isG) rb.onclick = () => startRandom("mock");
  app.querySelectorAll("[data-paper]").forEach(b =>
    b.onclick = () => startMock(b.dataset.paper));
}

function startMock(paperId) {
  const p = state.papers.find(x => x.id === paperId);
  const qs = state.allQ.filter(q => q.paperId === paperId);
  startSession(`${p.title}（主题：${p.theme || ""}）`, qs, "mock", "mock");
}

/* ---------- 随机组卷（从十套卷抽取，题型结构同整卷模考） ---------- */
function sectionsOfType(type) {
  const res = [];
  for (const p of state.papers)
    for (const s of p.sections)
      if (s.type === type) res.push({ p, s });
  return res;
}
function passagesOfGenre(genre) {
  const res = [];
  for (const p of state.papers)
    for (const s of p.sections)
      if (s.type === "reading")
        for (const ps of s.passages)
          if (ps.genre === genre) res.push(ps);
  return res;
}
function buildRandomPaper() {
  const synth = {
    id: "RAND", title: "南通中考英语 · 随机组卷", theme: "智能组合（十套卷抽取）",
    sections: [],
  };
  // 单项选择：10 题（按小题抽取）
  const sc = [];
  sectionsOfType("single_choice").forEach(({ s }) => s.questions.forEach(q => sc.push(q)));
  synth.sections.push({ type: "single_choice", name: "单项选择", questions: shuffle(sc).slice(0, 10) });

  // 完形填空：整篇 8 题（保证语篇连贯）
  const cloze = shuffle(sectionsOfType("cloze"))[0];
  synth.sections.push({ type: "cloze", name: "完形填空", passage: cloze.s.passage, questions: cloze.s.questions });

  // 阅读理解：应用文 / 记叙文 / 七选五 各 1 篇 = 11 题
  const reading = { type: "reading", name: "阅读理解", passages: [] };
  for (const g of ["应用文", "记叙文", "七选五"]) {
    const ps = shuffle(passagesOfGenre(g))[0];
    reading.passages.push(ps);
  }
  synth.sections.push(reading);

  // 词汇运用：6 题（按小题抽取）
  const voc = [];
  sectionsOfType("vocabulary").forEach(({ s }) => s.questions.forEach(q => voc.push(q)));
  synth.sections.push({ type: "vocabulary", name: "词汇运用", questions: shuffle(voc).slice(0, 6) });

  // 短文填空：整篇 6 题
  const bf = shuffle(sectionsOfType("blank_filling"))[0];
  synth.sections.push({ type: "blank_filling", name: "短文填空", passage: bf.s.passage, questions: bf.s.questions });

  // 阅读与回答问题：整篇 4 题
  const tr = shuffle(sectionsOfType("task_reading"))[0];
  synth.sections.push({ type: "task_reading", name: "阅读与回答问题", passage: tr.s.passage, questions: tr.s.questions });

  // 书面表达：1 篇
  const wr = shuffle(sectionsOfType("writing"))[0];
  synth.sections.push({ type: "writing", name: "书面表达", ...wr.s });

  return flatten([synth]);
}

function startRandom(backMode) {
  if (isGuest()) { toast("游客模式暂不支持随机组卷，登录后解锁"); return; }
  const qs = buildRandomPaper();
  if (!qs.length) { toast("题库为空，无法组卷"); return; }
  startSession(`随机组卷（题型同整卷 · 共 ${qs.length} 题）`, qs, backMode || "home", "random");
}

/* ---------- 渲染：专项训练筛选 ---------- */
function renderPracticeSetup() {
  const v = tagValues();
  const app = $("#app");
  const dims = [
    { key: "questionType", label: "题型", cls: "" },
    { key: "knowledge", label: "知识点", cls: "k" },
    { key: "topic", label: "语篇话题", cls: "t" },
    { key: "skill", label: "能力技能", cls: "s" },
    { key: "difficulty", label: "难度", cls: "d" },
  ];
  const isG = isGuest();
  if (isG) state.filters.questionType = ["单项选择"]; // 游客锁定单项选择
  const guestNote = isG
    ? `<p class="meta warn">游客模式：专项训练仅开放 <b>单项选择</b> 题型。登录后解锁全部题型筛选。</p>`
    : "";
  const groups = dims.map(d => {
    if (isG && d.key === "questionType") {
      return `<div class="filter-group"><h4>题型</h4><div class="chips">
        <span class="chip on locked" data-dim="questionType" data-val="单项选择">单项选择</span>
        <span class="chip locked" data-dim="questionType" data-val="__locked">🔒 其他题型（登录解锁）</span>
      </div></div>`;
    }
    const chips = v[d.key].map(val => {
      const on = state.filters[d.key].includes(val) ? "on" : "";
      const txt = d.key === "difficulty" ? `${val} 星` : esc(val);
      return `<span class="chip ${on}" data-dim="${d.key}" data-val="${esc(val)}">${txt}</span>`;
    }).join("");
    const starNote = d.key === "difficulty" ? `<span class="muted" style="font-size:12px">（1=易 … 5=难）</span>` : "";
    return `<div class="filter-group"><h4>${d.label} ${starNote}</h4><div class="chips">${chips}</div></div>`;
  }).join("");

  const matched = applyFilters().length;
  app.innerHTML = `
    <div class="card">
      ${guestNote}
      <h2>专项训练 · 条件筛选</h2>
      <p class="meta">维度内多选为「或」，维度间为「且」。当前匹配 <b id="matchN">${matched}</b> 题。</p>
      <div class="filters" style="margin-top:14px">${groups}</div>
      <div class="row" style="margin-top:18px">
        <label>抽取题数：</label>
        <input type="number" id="numN" min="1" value="20" />
        <label class="muted">（留空或大于匹配数则取全部）</label>
      </div>
      <button class="btn wide" id="startP">开始专项练习</button>
      <button class="btn ghost wide" id="resetF">清空筛选条件</button>
    </div>`;

  app.querySelectorAll(".chip").forEach(c => c.onclick = () => {
    if (c.classList.contains("locked")) return; // 锁定项不可切换
    const dim = c.dataset.dim, val = c.dataset.val;
    const arr = state.filters[dim];
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1); else arr.push(val);
    c.classList.toggle("on");
    $("#matchN").textContent = applyFilters().length;
  });
  $("#startP").onclick = () => {
    const n = parseInt($("#numN").value, 10);
    let pool = applyFilters();
    if (!pool.length) { toast("没有符合条件的题目"); return; }
    pool = shuffle(pool);
    if (n && n > 0 && n < pool.length) pool = pool.slice(0, n);
    startSession(`专项训练（匹配 ${state.allQ.length} 题库 / 抽 ${pool.length} 题）`, pool, "practice", "practice");
  };
  $("#resetF").onclick = () => {
    state.filters = { questionType: [], knowledge: [], topic: [], skill: [], difficulty: [] };
    renderPracticeSetup();
  };
}

function applyFilters() {
  const f = state.filters;
  return state.allQ.filter(q => {
    const tg = q.tags || {};
    if (f.questionType.length && !f.questionType.includes(tg.questionType)) return false;
    if (f.knowledge.length && !f.knowledge.includes(tg.knowledge)) return false;
    if (f.topic.length && !f.topic.includes(tg.topic)) return false;
    if (f.skill.length && !f.skill.includes(tg.skill)) return false;
    if (f.difficulty.length && !f.difficulty.includes(String(q.difficulty))) return false;
    return true;
  });
}
function resetFilters() {
  state.filters = { questionType: [], knowledge: [], topic: [], skill: [], difficulty: [] };
}

/* ---------- 渲染：答题会话 ---------- */
function startSession(title, questions, backMode, kind) {
  state.session = {
    title, questions, userAnswers: {}, review: false, score: null,
    backMode: backMode || state.mode, kind: kind || backMode || "practice",
    startedAt: Date.now(),
  };
  renderExam();
}

function tagHtml(q) {
  const tg = q.tags || {};
  const d = tg.difficulty;
  const dcls = d <= 2 ? "d1" : d === 3 ? "d3" : "d4";
  return `
    ${tg.questionType ? `<span class="tag">${esc(tg.questionType)}</span>` : ""}
    ${tg.knowledge ? `<span class="tag k">${esc(tg.knowledge)}</span>` : ""}
    ${tg.topic ? `<span class="tag t">${esc(tg.topic)}</span>` : ""}
    ${tg.skill ? `<span class="tag s">${esc(tg.skill)}</span>` : ""}
    ${d ? `<span class="tag ${dcls}">难度 ${d}</span>` : ""}`;
}

function renderExam() {
  const s = state.session;
  const app = $("#app");
  const total = s.questions.length;
  const answered = Object.keys(s.userAnswers).filter(k => s.userAnswers[k] !== "").length;
  const prog = total ? Math.round(answered / total * 100) : 0;

  const head = s.review
    ? `<div class="card"><h2>${esc(s.title)}</h2>
         <p class="meta">已提交 · 得分 ${s.score.correct}/${s.score.counted}（自动判分题）· 点击「查看解析」核对</p></div>`
    : `<div class="card">
         <div style="display:flex;justify-content:space-between;align-items:center">
           <h2>${esc(s.title)}</h2>
           <button class="btn ghost" id="submitBtn">提交并判分</button>
         </div>
         <div class="progress"><i style="width:${prog}%"></i></div>
         <p class="meta">已答 ${answered} / ${total} 题</p>
       </div>`;

  const body = s.questions.map((q, i) => renderQuestion(q, i, s.review)).join("");
  app.innerHTML = head + body;

  if (s.review) {
    app.querySelectorAll(".toggle-ana").forEach(b => b.onclick = () => {
      const el = document.getElementById(b.dataset.tid);
      if (el) el.classList.toggle("open");
    });
    const back = document.createElement("button");
    back.className = "btn ghost wide"; back.textContent = "返回上一级";
    back.onclick = () => switchMode(s.backMode || "home");
    app.appendChild(back);
  } else {
    app.querySelectorAll(".opt").forEach(o => o.onclick = () => {
      const idx = +o.dataset.idx;
      const val = o.dataset.val;
      s.userAnswers[idx] = val;
      const grp = o.parentElement;
      grp.querySelectorAll(".opt").forEach(x => x.classList.remove("sel"));
      o.classList.add("sel");
      updateProgress();
    });
    app.querySelectorAll(".fill-input").forEach(inp => inp.oninput = () => {
      s.userAnswers[+inp.dataset.idx] = inp.value;
      updateProgress();
    });
    $("#submitBtn").onclick = submitSession;
  }
}

function updateProgress() {
  const s = state.session;
  const total = s.questions.length;
  const answered = Object.keys(s.userAnswers).filter(k => s.userAnswers[k] !== "").length;
  const bar = $(".progress > i");
  if (bar) bar.style.width = (total ? Math.round(answered / total * 100) : 0) + "%";
  const m = $(".container .meta");
  // 更新"已答 N / M"
  const card = $(".container .card:first-child .meta");
  if (card) card.textContent = `已答 ${answered} / ${total} 题`;
}

function renderQuestion(q, idx, review) {
  const sa = state.session.userAnswers[idx] || "";
  const isChoice = !!q.options;
  let inner = "";

  // 阅读/完形/填空语篇
  if (q.passageBody) {
    inner += `<div class="passage">${esc(q.passageBody)}</div>`;
  }
  if (q.sectionType === "writing") {
    inner += `<div class="q-stem"><b>题目：</b>${esc(q.prompt)}</div>`;
    if (q.requirements && q.requirements.length)
      inner += `<div class="meta">要求：${q.requirements.map(esc).join("；")}</div>`;
  } else {
    inner += `<div class="q-stem">${esc(q.stem)}</div>`;
  }

  if (isChoice) {
    inner += `<div class="options">` + q.options.map(o => {
      const val = String(o).trim().charAt(0);
      let cls = "opt";
      let mark = "";
      if (review) {
        const correct = String(q.answer).trim().charAt(0);
        if (val === correct) cls += " correct";
        else if (val === String(sa).trim().charAt(0) && sa !== "") cls += " wrong";
      } else if (String(sa).trim().charAt(0) === val) {
        cls += " sel";
      }
      return `<div class="${cls}" data-idx="${idx}" data-val="${esc(val)}">
        <span>${esc(o)}</span>${mark}</div>`;
    }).join("") + `</div>`;
  } else if (q.sectionType === "writing") {
    const disabled = review ? "disabled" : "";
    const val = (review ? (sa || "") : (sa || ""));
    inner += `<textarea class="fill-input" data-idx="${idx}" ${disabled} placeholder="在此作答…">${esc(val)}</textarea>`;
    if (review && q.referenceVersion) {
      inner += `<div class="analysis open"><b>参考范文：</b><br>${esc(q.referenceVersion)}</div>`;
      if (q.referenceOutline) inner += `<div class="analysis open"><b>写作框架：</b>${esc(q.referenceOutline)}</div>`;
    }
  } else {
    const disabled = review ? "disabled" : "";
    const placeholder = q.sectionType === "vocabulary" ? "填写单词" :
      (q.sectionType === "blank_filling" ? "填写单词/短语" : "简答");
    const val = (review ? (sa || q.answer || "") : (sa || ""));
    inner += `<input class="fill-input" data-idx="${idx}" ${disabled} placeholder="${placeholder}" value="${esc(val)}" />`;
    if (review) {
      inner += `<div class="analysis open"><span class="answer-line"><b>参考答案：</b>${esc(q.answer)}</span></div>`;
    }
  }

  // 解析（review 模式可展开）
  if (review && q.sectionType !== "writing") {
    inner += `<div style="margin-top:10px">
      <button class="btn ghost toggle-ana" data-tid="ana${idx}" style="padding:6px 12px;font-size:13px">查看解析</button>
      <div class="analysis" id="ana${idx}">
        <span class="answer-line"><b>正确答案：</b>${esc(q.answer)}</span>
        ${q.knowledgePoint ? `<span class="answer-line"><b>考点：</b>${esc(q.knowledgePoint)}</span>` : ""}
        <div>${esc(q.analysis)}</div>
      </div></div>`;
  }

  return `<div class="q">
    <div class="q-head">
      <span class="q-no">第 ${idx + 1} 题</span>${tagHtml(q)}
    </div>
    ${inner}
  </div>`;
}

/* ---------- 提交判分 ---------- */
async function submitSession() {
  const s = state.session;
  let correct = 0, counted = 0;
  const wrong = [];
  const breakdown = {};
  const weakCount = {};
  s.questions.forEach((q, i) => {
    if (q.sectionType === "writing") return; // 写作不自动判分
    const t = q.sectionType;
    if (!breakdown[t]) breakdown[t] = { correct: 0, total: 0 };
    breakdown[t].total++;
    const ua = (s.userAnswers[i] || "").toString().trim();
    const correctAns = String(q.answer).trim().charAt(0);
    const ok = q.options
      ? (ua.toUpperCase().charAt(0) === correctAns.toUpperCase())
      : (norm(ua) === norm(q.answer));
    if (ok) { correct++; breakdown[t].correct++; }
    else {
      wrong.push({ q, i, ua });
      const k = (q.tags && q.tags.knowledge) || "综合";
      weakCount[k] = (weakCount[k] || 0) + 1;
    }
    counted++;
  });
  s.score = { correct, counted };
  s.review = true;

  // 错题入库（登录走后端 / 未登录走本地，含兜底）
  const newWrong = wrong.map(w => ({
    qid: w.q.qid, paperId: w.q.paperId, sectionType: w.q.sectionType,
    stem: w.q.stem, answer: w.q.answer, userAnswer: w.ua,
    analysis: w.q.analysis, knowledgePoint: w.q.knowledgePoint,
    tags: w.q.tags, ts: Date.now(), user: currentUser() || "guest",
  }));
  try { await persistWrong(newWrong); }
  catch (e) { const a = loadWrongSync(); a.push(...newWrong); saveWrongSync(a); }

  // 成绩记录 / 练习历史
  const accuracy = counted ? Math.round(correct / counted * 100) : 0;
  const durationSec = s.startedAt ? Math.max(1, Math.round((Date.now() - s.startedAt) / 1000)) : 0;
  const weakTags = Object.entries(weakCount).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, c]) => ({ knowledge: k, count: c }));
  const rec = {
    id: "h" + Date.now(), ts: Date.now(),
    kind: s.kind || "practice", title: s.title,
    total: counted, correct: correct, accuracy: accuracy,
    durationSec: durationSec, breakdown: breakdown, weakTags: weakTags,
  };
  try { await persistHistory(rec); }
  catch (e) { const a = loadHistorySync(); a.push(rec); if (a.length > 200) a = a.slice(-200); saveHistorySync(a); }

  renderExam();
  toast(`提交成功：答对 ${correct} / ${counted}`);
  refreshWrongBadge();
}

/* ---------- 错题本（存储逻辑见顶部 store 区块） ---------- */

async function renderWrongBook() {
  const app = $("#app");
  const list = loadWrong();
  if (!list.length) {
    app.innerHTML = `<div class="card center">暂无错题。做错的题会自动沉淀到这里，方便针对性复习。</div>`;
    return;
  }
  const u = currentUser();
  const userLine = u
    ? `当前账号：<b>${esc(u)}</b> · 错题已归类至该账号（本地保存）`
    : `<span class="muted">未登录：错题仅保存在本机当前浏览器。登录后错题会自动归类到你的账号，多用户互不干扰。</span>`;
  const items = list.slice().reverse().map((w, i) => `
    <div class="q">
      <div class="q-head">
        <span class="q-no">#${list.length - i}</span>
        ${w.tags ? tagHtml({ tags: w.tags }) : ""}
        <span class="muted" style="font-size:12px">${esc(w.paperId)}</span>
      </div>
      <div class="q-stem">${esc(w.stem)}</div>
      <div class="analysis open">
        <span class="answer-line"><b>你的答案：</b><span style="color:var(--red)">${esc(w.userAnswer || "（空）")}</span></span>
        <span class="answer-line"><b>正确答案：</b><span style="color:var(--green)">${esc(w.answer)}</span></span>
        ${w.knowledgePoint ? `<span class="answer-line"><b>考点：</b>${esc(w.knowledgePoint)}</span>` : ""}
        <div>${esc(w.analysis)}</div>
      </div>
    </div>`).join("");
  app.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>错题本（${list.length} 题）</h2>
        <div>
          <button class="btn" id="rePrac">重练全部错题</button>
          <button class="btn ghost" id="clr">清空</button>
        </div>
      </div>
      <p class="meta">按时间倒序排列，含你的作答、正确答案与解析。</p>
      <p class="meta" style="margin-top:6px">${userLine}</p>
    </div>
    ${items}`;
  $("#rePrac").onclick = () => {
    const qs = list.map(w => ({
      qid: w.qid, paperId: w.paperId, paperTitle: "",
      sectionType: w.sectionType, sectionName: TYPE_CN[w.sectionType] || "",
      stem: w.stem, options: null, answer: w.answer,
      analysis: w.analysis, knowledgePoint: w.knowledgePoint,
      difficulty: (w.tags && w.tags.difficulty) || 2, topic: (w.tags && w.tags.topic) || "",
      tags: w.tags,
    }));
    startSession(`错题重练（${qs.length} 题）`, qs.filter(x => x.sectionType !== "writing"), "wrong", "wrong");
    state.session.fromWrong = true;
  };
  $("#clr").onclick = () => {
    if (confirm("确定清空全部错题？此操作不可恢复。")) {
      saveWrong([]); refreshWrongBadge(); renderWrongBook();
    }
  };
}

/* ---------- 我的 / 用户画像 / 成绩记录 ---------- */
const KIND_CN = { mock: "整卷模考", random: "随机组卷", practice: "专项训练", wrong: "错题重练" };

function accPill(a) {
  const cls = a >= 80 ? "good" : a >= 60 ? "mid" : "low";
  return `<span class="acc-pill ${cls}">${a}%</span>`;
}

async function renderProfile() {
  const app = $("#app");
  const u = currentUser();
  const isG = isGuest();
  const displayName = isG ? "游客（本机）" : u;
  if (!u) {
    app.innerHTML = `<div class="card center">
      <h2>我的学习中心</h2>
      <p class="muted">登录后可查看专属画像、练习历史与成绩记录。当前为访客模式，数据不会保存。</p>
      <button class="btn" id="goLogin">登录 / 注册</button>
    </div>`;
    const b = $("#goLogin");
    if (b) b.onclick = () => openAuth("login");
    return;
  }
  const prof = await getProfile() || {};
  const hist = await loadHistory();
  const totalSessions = hist.length;
  const totalQ = hist.reduce((s, h) => s + h.total, 0);
  const avgAcc = totalSessions ? Math.round(hist.reduce((s, h) => s + h.accuracy, 0) / totalSessions) : 0;
  const best = totalSessions ? Math.max(...hist.map(h => h.accuracy)) : 0;

  // 薄弱点累计聚合
  const weakAgg = {};
  hist.forEach(h => (h.weakTags || []).forEach(w => { weakAgg[w.knowledge] = (weakAgg[w.knowledge] || 0) + w.count; }));
  const weakTop = Object.entries(weakAgg).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxWeak = weakTop.length ? weakTop[0][1] : 1;

  const avatar = prof.avatar || "🧑‍🎓";
  const grade = prof.grade || "未设置";
  const target = prof.targetScore || "—";
  const goals = prof.goals || [];
  const weakSel = prof.weakAreas || [];

  const histRows = hist.slice().reverse().slice(0, 12).map(h => {
    const d = new Date(h.ts);
    const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const dur = h.durationSec ? `${Math.floor(h.durationSec / 60)}分${h.durationSec % 60}秒` : "—";
    return `<tr>
      <td>${when}</td>
      <td>${KIND_CN[h.kind] || h.kind}</td>
      <td class="truncate" title="${esc(h.title)}">${esc(h.title)}</td>
      <td><b>${h.correct}/${h.total}</b></td>
      <td>${accPill(h.accuracy)}</td>
      <td>${dur}</td>
    </tr>`;
  }).join("");

  const weakBars = weakTop.length ? weakTop.map(([k, c]) => `
    <div class="weak-row">
      <span class="weak-name">${esc(k)}</span>
      <span class="weak-bar"><i style="width:${Math.round(c / maxWeak * 100)}%"></i></span>
      <span class="weak-num">${c}</span>
    </div>`).join("") : `<p class="muted">暂无数据，完成练习后将自动统计。</p>`;

  app.innerHTML = `
    <div class="card profile-head">
      <div class="avatar">${avatar}</div>
      <div class="p-info">
        <h2>${esc(displayName)} 的学习中心</h2>
        <p class="meta">学段：${esc(grade)} · 目标分：<b>${esc(target)}</b> / 120</p>
        <div class="p-tags">
          ${goals.map(g => `<span class="tag s">${esc(g)}</span>`).join("")}
          ${weakSel.map(w => `<span class="tag k">薄弱·${esc(w)}</span>`).join("")}
          ${!goals.length && !weakSel.length ? `<span class="muted">${isG ? "游客数据保存在本机浏览器" : "尚未完善画像，点右侧按钮补充"}</span>` : ""}
        </div>
      </div>
      ${isG ? "" : `<button class="btn" id="editProf">完善画像</button>`}
    </div>

    <div class="stat-row plain">
      <div class="stat"><b>${totalSessions}</b><span>练习次数</span></div>
      <div class="stat"><b>${totalQ}</b><span>累计答题</span></div>
      <div class="stat"><b>${avgAcc}%</b><span>平均正确率</span></div>
      <div class="stat"><b>${best}%</b><span>最佳正确率</span></div>
    </div>

    <div class="card">
      <h2>成绩记录 / 练习历史</h2>
      <p class="meta">按时间倒序，最近 12 次练习。数据保存在本机，随账号隔离。</p>
      ${histRows ? `<div class="table-wrap"><table class="hist-table">
        <thead><tr><th>时间</th><th>类型</th><th>名称</th><th>得分</th><th>正确率</th><th>用时</th></tr></thead>
        <tbody>${histRows}</tbody></table></div>`
      : `<p class="muted" style="margin-top:10px">还没有练习记录，去「整卷模考」或「专项训练」开始吧。</p>`}
      ${hist.length ? `<button class="btn ghost" id="clrHist" style="margin-top:12px">清空我的练习历史</button>` : ""}
    </div>

    <div class="card">
      <h2>薄弱点分析</h2>
      <p class="meta">基于历史练习中答错的知识点累计统计，帮你定位主攻方向。</p>
      <div class="weak-list">${weakBars}</div>
    </div>`;

  const ep = $("#editProf");
  if (ep) ep.onclick = openProfileModal;
  const ch = $("#clrHist");
  if (ch) ch.onclick = () => {
    if (confirm("确定清空全部练习历史？此操作不可恢复。")) { saveHistory([]); renderProfile(); }
  };
}

/* ---------- 画像编辑弹窗 ---------- */
function applyPreset(p) {
  const map = {
    sprint: { target: 112, goals: ["冲刺高分", "专项突破"] },
    steady: { target: 100, goals: ["巩固基础", "专项突破"] },
    start: { target: 80, goals: ["巩固基础"] },
  };
  const cfg = map[p];
  if (!cfg) return;
  const tg = document.getElementById("pfTarget");
  if (tg) tg.value = cfg.target;
  document.querySelectorAll("#pfGoals .chip").forEach(c => c.classList.toggle("on", cfg.goals.includes(c.dataset.val)));
}
async function openProfileModal() {
  const u = currentUser();
  if (!u) { openAuth("login"); return; }
  const prof = getProfile() || {};
  const mask = document.getElementById("profileModal");
  if (!mask) return;
  mask.style.display = "flex";
  const av = document.getElementById("pfAvatar");
  if (av) av.value = prof.avatar || "🧑‍🎓";
  const gd = document.getElementById("pfGrade");
  if (gd) gd.value = prof.grade || "初三";
  const tg = document.getElementById("pfTarget");
  if (tg) tg.value = prof.targetScore || 108;
  const goals = prof.goals || [];
  const weak = prof.weakAreas || [];
  document.querySelectorAll("#pfGoals .chip").forEach(c => c.classList.toggle("on", goals.includes(c.dataset.val)));
  document.querySelectorAll("#pfWeak .chip").forEach(c => c.classList.toggle("on", weak.includes(c.dataset.val)));
  const box = document.getElementById("pfAvatars");
  if (box) box.querySelectorAll(".av-opt").forEach(x => x.classList.toggle("sel", x.dataset.av === (prof.avatar || "🧑‍🎓")));
}
function closeProfileModal() {
  const m = document.getElementById("profileModal");
  if (m) m.style.display = "none";
}
function submitProfile() {
  const avatar = document.getElementById("pfAvatar").value || "🧑‍🎓";
  const grade = document.getElementById("pfGrade").value;
  const targetScore = parseInt(document.getElementById("pfTarget").value, 10) || 0;
  const goals = [...document.querySelectorAll("#pfGoals .chip.on")].map(c => c.dataset.val);
  const weakAreas = [...document.querySelectorAll("#pfWeak .chip.on")].map(c => c.dataset.val);
  if (saveProfile({ avatar, grade, targetScore, goals, weakAreas })) {
    closeProfileModal();
    renderProfile();
    toast("画像已保存");
  }
}
function wireProfileModal() {
  const mask = document.getElementById("profileModal");
  if (!mask) return;
  mask.addEventListener("click", e => { if (e.target === mask) closeProfileModal(); });
  const avatars = ["🦊", "🐼", "🦁", "🐯", "🐨", "🦉", "🐱", "🚀", "🌟", "🧑‍🎓"];
  const box = document.getElementById("pfAvatars");
  if (box) {
    box.innerHTML = avatars.map(a => `<button type="button" class="av-opt" data-av="${a}">${a}</button>`).join("");
    box.querySelectorAll(".av-opt").forEach(b => b.onclick = () => {
      document.getElementById("pfAvatar").value = b.dataset.av;
      box.querySelectorAll(".av-opt").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
    });
  }
  const weakBox = document.getElementById("pfWeak");
  if (weakBox) {
    const ks = tagValues().knowledge;
    weakBox.innerHTML = ks.map(k => `<span class="chip" data-val="${esc(k)}">${esc(k)}</span>`).join("");
    weakBox.querySelectorAll(".chip").forEach(c => c.onclick = () => c.classList.toggle("on"));
  }
  document.querySelectorAll("#pfGoals .chip").forEach(c => c.onclick = () => c.classList.toggle("on"));
  document.querySelectorAll("#pfPresets .chip").forEach(c => c.onclick = () => applyPreset(c.dataset.preset));
  const sub = document.getElementById("pfSubmit");
  if (sub) sub.onclick = submitProfile;
  const cancel = document.getElementById("pfCancel");
  if (cancel) cancel.onclick = closeProfileModal;
}

/* ---------- 管理后台（管理员入口，见页脚「管理后台」） ---------- */
async function apiAdmin(method, path, body) {
  const headers = {};
  const t = getAdminToken();
  if (t) headers["Authorization"] = "Bearer " + t;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  let data = null;
  try { data = await r.json(); } catch (e) {}
  if (!r.ok) {
    if (r.status === 401) setAdminToken(null); // token 失效
    const msg = (data && data.error && data.error.message) || ("请求失败(" + r.status + ")");
    throw new Error(msg);
  }
  return data;
}
function openAdmin() {
  const ov = document.getElementById("adminOverlay");
  if (!ov) return;
  ov.style.display = "flex";
  if (!getAdminToken()) { renderAdminLogin(); return; }
  apiAdmin("GET", "/api/admin/users")
    .then(renderAdminPanel)
    .catch(e => renderAdminLogin(e.message));
}
function closeAdmin() {
  const ov = document.getElementById("adminOverlay");
  if (ov) ov.style.display = "none";
}
function renderAdminLogin(errMsg) {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;
  panel.innerHTML = `
    <h2>管理后台登录</h2>
    <p class="meta">请输入管理员密码（由部署环境变量 <code>ADMIN_PASSWORD</code> 设置）。</p>
    ${errMsg ? `<p class="meta warn">${esc(errMsg)}</p>` : ""}
    <input id="adminPw" class="auth-input" type="password" placeholder="管理员密码" autocomplete="current-password" />
    <button class="btn wide" id="adminLoginBtn">登录</button>
    <button class="btn ghost wide" id="adminCancelBtn">关闭</button>`;
  const submit = async () => {
    const pw = document.getElementById("adminPw").value;
    try {
      const r = await apiAdmin("POST", "/api/admin/login", { password: pw });
      if (r && r.token) { setAdminToken(r.token); const d = await apiAdmin("GET", "/api/admin/users"); renderAdminPanel(d); }
    } catch (e) { renderAdminLogin(e.message); }
  };
  const lb = document.getElementById("adminLoginBtn");
  if (lb) lb.onclick = submit;
  const pw = document.getElementById("adminPw");
  if (pw) pw.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  const cb = document.getElementById("adminCancelBtn");
  if (cb) cb.onclick = closeAdmin;
}
function renderAdminPanel(data) {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;
  const users = (data && data.users) || [];
  const stats = (data && data.stats) || {};
  const rows = users.length ? users.map(u => {
    const last = u.lastActive ? new Date(u.lastActive).toLocaleString("zh-CN") : "—";
    const created = u.createdAt ? new Date(u.createdAt).toLocaleDateString("zh-CN") : "—";
    return `<tr data-name="${esc(u.username)}" style="cursor:pointer">
      <td>${esc(u.username)}</td>
      <td>${created}</td>
      <td>${u.wrongCount}</td>
      <td>${u.historyCount}</td>
      <td>${u.targetScore || "—"}</td>
      <td class="muted">${last}</td>
      <td><button class="btn ghost sm del-user" data-name="${esc(u.username)}">删除</button></td>
    </tr>`;
  }).join("") : `<tr><td colspan="7" class="center">暂无用户</td></tr>`;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2>管理后台</h2>
      <button class="btn ghost sm" id="adminLogout">退出登录</button>
    </div>
    <div class="stat-row plain" style="margin:10px 0">
      <div class="stat"><b>${stats.userCount || 0}</b><span>注册用户</span></div>
      <div class="stat"><b>${stats.totalWrong || 0}</b><span>累计错题</span></div>
      <div class="stat"><b>${stats.totalHistory || 0}</b><span>练习次数</span></div>
    </div>
    <div class="table-wrap">
      <table class="hist-table admin-table">
        <thead><tr><th>用户名</th><th>注册</th><th>错题</th><th>练习</th><th>目标分</th><th>最近活跃</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const lo = document.getElementById("adminLogout");
  if (lo) lo.onclick = async () => {
    try { await apiAdmin("POST", "/api/admin/logout"); } catch (e) {}
    setAdminToken(null); renderAdminLogin();
  };
  panel.querySelectorAll("tbody tr[data-name]").forEach(tr => {
    tr.onclick = (e) => {
      if (e.target.closest(".del-user")) return; // 删除按钮单独处理
      openUserDetail(tr.dataset.name);
    };
  });
  panel.querySelectorAll(".del-user").forEach(b => {
    b.onclick = async (e) => {
      e.stopPropagation();
      const name = b.dataset.name;
      if (!confirm(`确定删除用户「${name}」？其错题本与练习记录将一并清除，不可恢复。`)) return;
      try {
        await apiAdmin("DELETE", "/api/admin/user?name=" + encodeURIComponent(name));
        toast("已删除：" + name);
        const d = await apiAdmin("GET", "/api/admin/users");
        renderAdminPanel(d);
      } catch (ex) { toast(ex.message); }
    };
  });
}
async function openUserDetail(name) {
  try {
    const d = await apiAdmin("GET", "/api/admin/user?name=" + encodeURIComponent(name));
    const panel = document.getElementById("adminPanel");
    if (!panel) return;
    const prof = d.profile || {};
    const hist = d.history || [];
    const histRows = hist.slice().reverse().slice(0, 10).map(h => {
      const acc = h.accuracy != null ? h.accuracy + "%" : "—";
      return `<tr><td>${KIND_CN[h.kind] || h.kind}</td><td>${h.correct}/${h.total}</td><td>${acc}</td></tr>`;
    }).join("");
    const wrongRows = (d.wrong || []).slice().reverse().slice(0, 15)
      .map(w => `<li>${esc(w.stem || "")}</li>`).join("");
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2>用户：${esc(name)}</h2>
        <button class="btn ghost sm" id="backAdmin">返回列表</button>
      </div>
      <div class="card" style="margin-top:10px">
        <h2 style="font-size:15px">画像</h2>
        <p class="meta">学段：${esc(prof.grade || "—")} ｜ 目标分：${prof.targetScore || "—"} ｜ 头像：${esc(prof.avatar || "🧑‍🎓")}</p>
        <p class="meta">目标：${(prof.goals || []).join("、") || "—"} ｜ 薄弱点：${(prof.weakAreas || []).join("、") || "—"}</p>
      </div>
      <div class="card">
        <h2 style="font-size:15px">练习历史（最近 ${hist.length} 条）</h2>
        ${histRows ? `<div class="table-wrap"><table class="hist-table"><thead><tr><th>类型</th><th>得分</th><th>正确率</th></tr></thead><tbody>${histRows}</tbody></table></div>` : '<p class="muted">暂无练习记录</p>'}
      </div>
      <div class="card">
        <h2 style="font-size:15px">错题本（${d.wrong.length} 题）</h2>
        ${wrongRows ? `<ul class="wrong-list-mini">${wrongRows}</ul>` : '<p class="muted">暂无错题</p>'}
      </div>`;
    const ba = document.getElementById("backAdmin");
    if (ba) ba.onclick = () => {
      apiAdmin("GET", "/api/admin/users").then(renderAdminPanel).catch(e => renderAdminLogin(e.message));
    };
  } catch (e) { toast(e.message); }
}

/* ---------- 启动 ---------- */
(async function init() {
  const app = $("#app");
  app.innerHTML = `<div class="center">正在加载题库…</div>`;
  try {
    const n = await loadData();
    refreshWrongBadge();
    wireAuthModal();
    wireProfileModal();
    updateAuthUI();
    switchMode("home");
    // 管理后台入口（页脚）与弹层关闭
    const ae = document.getElementById("adminEntry");
    if (ae) ae.onclick = openAdmin;
    const aov = document.getElementById("adminOverlay");
    if (aov) aov.addEventListener("click", e => { if (e.target === aov) closeAdmin(); });
  } catch (e) {
    app.innerHTML = `<div class="card center">
      <h2>题库加载失败</h2>
      <p class="muted">${esc(e.message)}</p>
      <p class="muted">提示：请在 <code>mock_papers/</code> 目录下启动本地服务器，例如：<br>
      <code>python3 -m http.server 8000</code><br>然后访问 <code>http://localhost:8000/app/</code></p>
    </div>`;
  }
  document.querySelectorAll(".tab").forEach(b =>
    b.onclick = () => switchMode(b.dataset.mode));
})();
