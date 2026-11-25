/* ==========================================================================
   함쌤의 정보 LAB — 공통 웹 교안 엔진 & 교사 편집기 (deck-editor.js)
   이 파일 하나만 수정하면 연결된 모든 차시 교안에 기능이 일괄 반영됩니다.
   ========================================================================== */

(function () {
  const TEACHER_PASSCODE_HASH = '85d6385b945c0d602103db39b0b654b2af93b5127938e26a959c123f0789b948';
  const GH_TOKEN_KEY = 'hamssam_gh_session_token';

  const bodyEl = document.body;
  const FILE_NAME = bodyEl.dataset.filename || (location.pathname.split('/').pop() || 'lesson_deck.html');
  const HOME_HREF = bodyEl.dataset.home || './ponybot_main.html';
  const DECK_TITLE = bodyEl.dataset.deckTitle || '슬라이드 목록';
  const GH_META_KEY = 'hamssam_gh_meta_' + FILE_NAME.replace(/[^a-zA-Z0-9_-]/g, '_');

  const AI_COLORS_LIGHT = [
    { name: '기본 잉크', hex: '#141414' },
    { name: '핵심 강조', hex: '#C84B31' },
    { name: '신뢰 네이비', hex: '#1D4ED8' },
    { name: '안정 그린', hex: '#15803D' },
    { name: '보조 그레이', hex: '#6B6A65' },
    { name: '딥 퍼플', hex: '#6D28D9' }
  ];

  const AI_COLORS_DARK = [
    { name: '기본 화이트', hex: '#FFFFFF' },
    { name: '코랄 강조', hex: '#FF7B61' },
    { name: '네온 민트', hex: '#5EEAD4' },
    { name: '소프트 옐로', hex: '#FDE047' },
    { name: '스카이 블루', hex: '#7DD3FC' },
    { name: '보조 실버', hex: '#CBD5E1' }
  ];

  const SHAPE_RADII = ['50%', '18px', '4px'];
  const SHAPE_ICONS = ['◯', '▢', '▭'];
  const EMOJI_PRESETS = [
    '🤖', '🚗', '🛞', '👁️', '🧠', '⚡',
    '💡', '🧩', '💻', '🌐', '🔌', '⬇️',
    '⬆️', '⚠️', '✅', '❌', '🎯', '🔥',
    '✨', '📌', '🔍', '📡', '📷', '🛠️',
    '⚙️', '📊', '📝', '🏆', '🚀', '🛑',
    '🚦', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'
  ];
  let activeEmojiEl = null;

  let slides = [];
  let currentIndex = 0;
  let penActive = false;
  let isTeacherAuthenticated = false;
  let editMode = false;
  let selectedSlot = null;
  let activeEditableEl = null;
  let revealTimers = [];
  let toastTimer = null;
  let dockIdleTimer = null;

  /* ================= 1. INJECT SHARED UI CHROME ================= */
  function injectSharedUI() {
    const uiHtml = `
      <canvas id="drawCanvas" data-injected-ui></canvas>
      <div id="toastNotice" data-injected-ui></div>

      <header id="editToolbar" data-injected-ui onmousedown="if(event.target.tagName !== 'SELECT' && event.target.tagName !== 'INPUT') event.preventDefault()">
        <div class="tb-group">
          <span class="edit-status-badge"><span class="edit-status-dot"></span>편집 모드</span>
        </div>

        <div class="tb-group">
          <button class="tb-btn" data-cmd="bold" title="굵게 (Ctrl/Cmd+B)"><strong>B</strong></button>
          <button class="tb-btn" id="btnHighlight" title="형광펜 강조">🖍 형광펜</button>

          <select id="fontSelect" class="tb-select" title="서체 변경">
            <option value="'Noto Sans KR', sans-serif">고딕 (기본)</option>
            <option value="'Noto Serif KR', serif">명조체</option>
            <option value="'JetBrains Mono', monospace">코딩 고정폭</option>
          </select>

          <div class="color-wrap">
            <button class="tb-btn" id="btnColorToggle" title="글자 색 변경">🎨 색상 ▾</button>
            <div id="colorPopover">
              <div class="cp-section-title">
                <span>✨ AI 추천 색</span>
                <span id="cpBgBadge" style="font-weight:600; color:var(--accent);">밝은 배경용</span>
              </div>
              <div id="cpAiGrid" class="cp-ai-grid"></div>
              <div class="cp-custom-row">
                <span style="font-size:12px; font-weight:700;">직접 선택</span>
                <div style="display:flex; align-items:center; gap:6px;">
                  <input id="customColorInput" type="color" value="#141414" />
                  <button class="tb-btn" id="btnColorClose" style="background:#141414;">닫기</button>
                </div>
              </div>
            </div>
          </div>

          <div class="tb-sep"></div>

          <div class="tb-stepper" title="선택한 글자·문단의 크기 조절">
            <span class="tb-step-label">크기</span>
            <button class="tb-step-btn" id="btnFsDown">−</button>
            <span id="fsVal" class="tb-step-val" style="min-width:36px;">16px</span>
            <button class="tb-step-btn" id="btnFsUp">+</button>
          </div>

          <div class="tb-stepper" title="선택한 문단의 줄간격 조절">
            <span class="tb-step-label">줄간격</span>
            <button class="tb-step-btn" id="btnLhDown">−</button>
            <span id="lhVal" class="tb-step-val">1.5</span>
            <button class="tb-step-btn" id="btnLhUp">+</button>
          </div>

          <div class="tb-stepper" title="선택한 문단의 글자간격 조절">
            <span class="tb-step-label">자간</span>
            <button class="tb-step-btn" id="btnLsDown">−</button>
            <span id="lsVal" class="tb-step-val">-0.02</span>
            <button class="tb-step-btn" id="btnLsUp">+</button>
          </div>
        </div>

        <div class="tb-group">
          <button id="btnGithubPush" class="tb-btn github" title="공유 중인 GitHub 페이지에 바로 반영">☁️ GitHub 반영</button>
          <button id="btnGithubConfig" class="tb-btn" title="GitHub 저장소·토큰 설정">⚙️</button>
          <button id="btnLocalSave" class="tb-btn save" title="로컬 PC에 HTML 파일로 백업">💾 저장</button>
          <button id="btnExitEdit" class="tb-btn">종료</button>
        </div>
      </header>

      <div id="teacherAuthModal" class="modal-backdrop" data-injected-ui>
        <div id="authCard" class="auth-card">
          <div style="font-size: 12px; font-weight: 800; color: var(--accent); letter-spacing: 0.1em; margin-bottom: 6px;">TEACHER ONLY</div>
          <div style="font-size: 20px; font-weight: 800;">교사 인증 코드 입력</div>
          <p style="font-size: 13px; color: var(--ink-sub); margin-top: 6px;">편집 모드를 열려면 4자리 코드를 입력하세요.</p>
          <input id="authCodeInput" class="auth-input" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off" />
          <div id="authErrorMsg" class="auth-error"></div>
          <div class="auth-actions">
            <button class="auth-btn" id="btnAuthCancel">취소</button>
            <button class="auth-btn primary" id="btnAuthVerify">확인</button>
          </div>
        </div>
      </div>

      <div id="githubConfigModal" class="modal-backdrop" data-injected-ui>
        <div class="auth-card" style="max-width: 420px;">
          <div style="font-size: 12px; font-weight: 800; color: #2563eb; letter-spacing: 0.08em; margin-bottom: 4px;">GITHUB AUTO-SYNC</div>
          <div style="font-size: 19px; font-weight: 800;">GitHub 연동 설정</div>
          <div class="gh-form">
            <div class="gh-field">
              <label>GitHub 아이디 (Owner)</label>
              <input id="ghOwner" type="text" placeholder="예: hamssam-lab" />
            </div>
            <div class="gh-field">
              <label>저장소 이름 (Repository)</label>
              <input id="ghRepo" type="text" placeholder="예: INFORMATICS-LAB" />
            </div>
            <div class="gh-field" style="display:grid; grid-template-columns: 1fr 1.6fr; gap:8px;">
              <div>
                <label>브랜치</label>
                <input id="ghBranch" type="text" placeholder="main" />
              </div>
              <div>
                <label>파일 경로</label>
                <input id="ghPath" type="text" placeholder="${FILE_NAME}" />
              </div>
            </div>
            <div class="gh-field">
              <label>Personal Access Token (창 닫으면 자동 삭제)</label>
              <input id="ghToken" type="password" placeholder="github_pat_..." autocomplete="off" />
            </div>
            <div class="gh-note">
              🔒 보안 강화: 토큰은 현재 브라우저 탭(sessionStorage)에만 임시 보관되며, 탭을 닫으면 자동 삭제되고 HTML 파일에는 절대 저장되지 않습니다.
            </div>
          </div>
          <div class="auth-actions">
            <button class="auth-btn" id="btnGhCancel">취소</button>
            <button class="auth-btn primary" id="btnGhSave">설정 저장</button>
          </div>
          <button class="auth-btn danger" id="btnGhClear">🗑️ 저장된 토큰 즉시 삭제</button>
        </div>
      </div>

      <div id="curtainOverlay" data-injected-ui>
        <div style="font-size: 12px; letter-spacing: 0.16em; opacity: 0.55;">SCREEN HIDDEN</div>
        <div style="font-size: 24px; font-weight: 800;">화면을 가렸습니다</div>
        <div style="font-size: 13px; opacity: 0.6; margin-top: 6px;">B 키를 누르거나 화면을 클릭하면 돌아갑니다</div>
      </div>

      <div id="indexModal" data-injected-ui>
        <div class="index-sheet">
          <div class="index-header">
            <strong style="font-size: 17px;">${DECK_TITLE}</strong>
            <button id="btnIndexClose" style="border:none; background:none; font-size:18px; cursor:pointer;">✕</button>
          </div>
          <div id="indexList" class="index-list"></div>
        </div>
      </div>

      <div id="emojiPopover" data-injected-ui onmousedown="if(event.target.tagName !== 'INPUT') event.preventDefault()">
        <div class="ep-header">
          <span>✨ 이모지 · 아이콘 변경</span>
          <button class="ep-close" id="btnEmojiClose" title="닫기">✕</button>
        </div>
        <div class="ep-input-row">
          <input id="emojiCustomInput" class="ep-input" type="text" placeholder="이모지·글자 직접 입력" autocomplete="off" />
          <button class="ep-clear-btn" id="btnEmojiClear" title="아이콘 비우기">비우기</button>
        </div>
        <div class="ep-size-row">
          <span>아이콘 크기</span>
          <div class="ep-size-btns">
            <button class="ep-size-btn" id="btnEmojiSm">−</button>
            <span id="emojiSizeVal" style="min-width:36px; text-align:center;">28px</span>
            <button class="ep-size-btn" id="btnEmojiLg">+</button>
          </div>
        </div>
        <div id="emojiPresetGrid" class="ep-grid"></div>
      </div>

      <nav id="floatingDock" class="floating-dock" aria-label="슬라이드 컨트롤" data-injected-ui>
        <a href="${HOME_HREF}" class="dock-btn" title="메인 포털로 돌아가기 (H)">
          <span class="dock-label">🏠 메인</span>
          <span class="dock-key">H</span>
        </a>
        <div class="dock-divider"></div>
        <div class="dock-nav">
          <button class="dock-btn" id="btnPrev" title="이전 슬라이드 (←)">
            <span class="dock-label">◀</span><span class="dock-key">←</span>
          </button>
          <span id="slideCounter" class="dock-counter">1 / 1</span>
          <button class="dock-btn" id="btnNext" title="다음 슬라이드 (→)">
            <span class="dock-label">▶</span><span class="dock-key">→</span>
          </button>
        </div>
        <div class="dock-divider"></div>
        <button id="btnPen" class="dock-btn" title="펜 판서 (D)"><span class="dock-label">펜</span><span class="dock-key">D</span></button>
        <button id="btnClear" class="dock-btn" title="판서 지우기 (C)"><span class="dock-label">지우기</span><span class="dock-key">C</span></button>
        <button id="btnIndex" class="dock-btn" title="슬라이드 목록 (G)"><span class="dock-label">목록</span><span class="dock-key">G</span></button>
        <button id="btnCurtain" class="dock-btn" title="화면 가리기 (B)"><span class="dock-label">가리기</span><span class="dock-key">B</span></button>
        <button id="btnEdit" class="dock-btn" title="교사 편집 모드 (E)"><span class="dock-label">편집</span><span class="dock-key">E</span></button>
        <button id="btnFullscreen" class="dock-btn" title="전체 화면 (F)"><span class="dock-label">전체 화면</span><span class="dock-key">F</span></button>
      </nav>
    `;
    bodyEl.insertAdjacentHTML('beforeend', uiHtml);
  }

  /* ================= 2. SHA-256 & TOAST ================= */
  async function sha256Hex(message) {
    if (window.crypto && window.crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32);
    let result = '', words = [], bitLen = message.length * 8;
    const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    message += '\x80';
    while (message.length % 64 - 56) message += '\x00';
    for (let i = 0; i < message.length; i++) words[i >> 2] |= message.charCodeAt(i) << ((3 - i) % 4) * 8;
    words.push((bitLen / maxWord) | 0, bitLen);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16), old = hash.slice(0);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        const t1 = hash[7] + (rr(e,6)^rr(e,11)^rr(e,25)) + ((e&hash[5])^((~e)&hash[6])) + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i-16] + (rr(w15,7)^rr(w15,18)^(w15>>>3)) + w[i-7] + (rr(w2,17)^rr(w2,19)^(w2>>>10))) | 0);
        const t2 = (rr(a,2)^rr(a,13)^rr(a,22)) + ((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
        hash.unshift((t1 + t2) | 0); hash[4] = (hash[4] + t1) | 0; hash.pop();
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? '0' : '') + b.toString(16); }
    return result;
  }

  function showToast(msg, duration = 3000) {
    const el = document.getElementById('toastNotice');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  function rgbToHex(rgb) {
    if (!rgb || rgb.startsWith('#')) return rgb || '#ffffff';
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return '#ffffff';
    return '#' + m.slice(0, 3).map(x => parseInt(x, 10).toString(16).padStart(2, '0')).join('');
  }

  /* ================= 3. UNIVERSAL SHAPE / CARD / LIST CONTROLS ================= */
  function attachResizeHandle(el, opts = {}) {
    if (!el || el.querySelector(':scope > .resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.setAttribute('data-injected-ui', '');
    handle.title = '드래그하여 크기 조절';

    handle.addEventListener('pointerdown', (e) => {
      if (!isTeacherAuthenticated || !editMode) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = rect.width;
      const startH = rect.height;
      const minW = opts.minW || 72;
      const minH = opts.minH || 72;

      handle.setPointerCapture(e.pointerId);

      function onMove(ev) {
        const nextW = Math.max(minW, Math.round(startW + (ev.clientX - startX)));
        const nextH = Math.max(minH, Math.round(startH + (ev.clientY - startY)));
        el.style.width = nextW + 'px';
        el.style.height = nextH + 'px';
        if (opts.clearAspect) el.style.aspectRatio = 'auto';
        if (opts.gridItem) {
          el.style.maxWidth = '100%';
          el.style.alignSelf = 'start';
          el.style.justifySelf = 'center';
        }
      }

      function onUp(ev) {
        handle.releasePointerCapture(ev.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      }

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });

    el.appendChild(handle);
  }

  function openEmojiPopover(targetEl) {
    if (!isTeacherAuthenticated || !editMode || !targetEl) return;
    activeEmojiEl = targetEl;
    const pop = document.getElementById('emojiPopover');
    const input = document.getElementById('emojiCustomInput');
    const sizeVal = document.getElementById('emojiSizeVal');

    // Read current text excluding resize handle
    const clone = targetEl.cloneNode(true);
    clone.querySelectorAll('[data-injected-ui]').forEach(n => n.remove());
    input.value = clone.textContent.trim();

    const fs = Math.round(parseFloat(window.getComputedStyle(targetEl).fontSize) || 28);
    sizeVal.textContent = fs + 'px';

    pop.classList.add('open');

    // Position near targetEl safely inside viewport
    const rect = targetEl.getBoundingClientRect();
    const popW = pop.offsetWidth || 288;
    const popH = pop.offsetHeight || 300;
    let left = rect.left + (rect.width / 2) - (popW / 2);
    let top = rect.bottom + 10;
    if (left < 14) left = 14;
    if (left + popW > window.innerWidth - 14) left = window.innerWidth - popW - 14;
    if (top + popH > window.innerHeight - 14) top = Math.max(60, rect.top - popH - 10);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function closeEmojiPopover() {
    document.getElementById('emojiPopover')?.classList.remove('open');
    activeEmojiEl = null;
  }

  function setEmojiText(el, text) {
    if (!el) return;
    const handle = el.querySelector(':scope > .resize-handle');
    el.textContent = text;
    if (handle) el.appendChild(handle);
  }

  function adjustEmojiSize(delta) {
    if (!activeEmojiEl) return;
    const cur = Math.round(parseFloat(window.getComputedStyle(activeEmojiEl).fontSize) || 28);
    const next = Math.min(84, Math.max(16, cur + delta));
    activeEmojiEl.style.fontSize = next + 'px';
    document.getElementById('emojiSizeVal').textContent = next + 'px';
  }

  function attachBlockControls() {
    // 1) Flow Steps (.circle-flow > .flow-node)
    document.querySelectorAll('.circle-flow').forEach(flow => {
      flow.querySelectorAll('.flow-node').forEach(attachFlowNodeControls);
      if (!flow.nextElementSibling || !flow.nextElementSibling.classList.contains('edit-add-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'edit-add-wrap';
        wrap.setAttribute('data-injected-ui', '');
        const btn = document.createElement('button');
        btn.className = 'edit-add-btn';
        btn.textContent = '+ 단계 추가';
        btn.onclick = () => {
          const count = flow.querySelectorAll('.flow-node').length + 1;
          const node = document.createElement('div');
          node.className = 'flow-node anim-node visible';
          node.innerHTML = `
            <div class="flow-circle editable-text" contenteditable="true">✨</div>
            <div class="flow-label editable-text" contenteditable="true">${count}. 새 단계</div>
            <p class="flow-desc editable-text" contenteditable="true">단계 설명을 입력하세요</p>
          `;
          flow.appendChild(node);
          attachFlowNodeControls(node);
          showToast(`✨ ${count}번째 단계가 추가되었습니다.`);
        };
        wrap.appendChild(btn);
        flow.insertAdjacentElement('afterend', wrap);
      }
    });

    // 2) Cards (.cards-grid-2, .cards-grid-3 > .ed-card)
    document.querySelectorAll('.cards-grid-2, .cards-grid-3').forEach(grid => {
      const cards = Array.from(grid.children).filter(c => c.classList.contains('ed-card'));
      if (cards.length === 0) return;
      cards.forEach(attachCardControls);
      if (!grid.nextElementSibling || !grid.nextElementSibling.classList.contains('edit-add-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'edit-add-wrap';
        wrap.setAttribute('data-injected-ui', '');
        const btn = document.createElement('button');
        btn.className = 'edit-add-btn';
        btn.textContent = '+ 카드 추가';
        btn.onclick = () => {
          const card = document.createElement('div');
          card.className = 'ed-card anim-node visible';
          card.innerHTML = `
            <div class="ed-icon editable-text" contenteditable="true">💡</div>
            <div class="ed-card-title editable-text" contenteditable="true">새 카드 제목</div>
            <p class="ed-card-text editable-text" contenteditable="true">핵심 내용을 입력하세요.</p>
          `;
          grid.appendChild(card);
          attachCardControls(card);
          showToast('✨ 새 카드가 추가되었습니다.');
        };
        wrap.appendChild(btn);
        grid.insertAdjacentElement('afterend', wrap);
      }
    });

    // 3) Hardware / Step Lists (.hw-list > li)
    document.querySelectorAll('.hw-list').forEach(list => {
      list.querySelectorAll('li').forEach(li => attachListItemControls(list, li));
      if (!list.nextElementSibling || !list.nextElementSibling.classList.contains('edit-add-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'edit-add-wrap';
        wrap.setAttribute('data-injected-ui', '');
        const btn = document.createElement('button');
        btn.className = 'edit-add-btn';
        btn.textContent = '+ 항목 추가';
        btn.onclick = () => {
          const count = list.querySelectorAll('li').length + 1;
          const li = document.createElement('li');
          li.className = 'anim-node visible';
          li.innerHTML = `<span class="hw-badge">${count}</span><span class="editable-text" contenteditable="true"><strong>새 항목:</strong> 설명을 입력하세요</span>`;
          list.appendChild(li);
          attachListItemControls(list, li);
          renumberListBadges(list);
        };
        wrap.appendChild(btn);
        list.insertAdjacentElement('afterend', wrap);
      }
    });

    // 4) Image Slots (.img-slot)
    document.querySelectorAll('.img-slot').forEach(slot => {
      attachResizeHandle(slot, { minW: 160, minH: 120, clearAspect: true });
    });
  }

  function attachFlowNodeControls(node) {
    const circle = node.querySelector('.flow-circle');
    if (circle) circle.classList.add('editable-text');
    if (node.querySelector('.edit-node-controls')) return;

    const bar = document.createElement('div');
    bar.className = 'edit-node-controls';
    bar.setAttribute('data-injected-ui', '');
    bar.onmousedown = (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); };

    // Shape toggle
    const shapeBtn = document.createElement('button');
    shapeBtn.className = 'enc-btn';
    shapeBtn.title = '도형 모양 변경 (원형 / 둥근 사각형 / 사각형)';
    let shapeIdx = 0;
    if (circle && circle.style.borderRadius) {
      const idx = SHAPE_RADII.indexOf(circle.style.borderRadius);
      if (idx !== -1) shapeIdx = idx;
    }
    shapeBtn.textContent = SHAPE_ICONS[shapeIdx];
    shapeBtn.onclick = () => {
      if (!circle) return;
      shapeIdx = (shapeIdx + 1) % SHAPE_RADII.length;
      circle.style.borderRadius = SHAPE_RADII[shapeIdx];
      shapeBtn.textContent = SHAPE_ICONS[shapeIdx];
    };

    // Background color picker
    const bgInput = document.createElement('input');
    bgInput.type = 'color';
    bgInput.className = 'enc-color';
    bgInput.title = '도형 배경색 변경';
    bgInput.value = circle ? rgbToHex(window.getComputedStyle(circle).backgroundColor) : '#ffffff';
    bgInput.oninput = () => {
      if (circle) circle.style.backgroundColor = bgInput.value;
    };

    // Border color picker
    const borderInput = document.createElement('input');
    borderInput.type = 'color';
    borderInput.className = 'enc-color';
    borderInput.title = '도형 테두리색 변경';
    borderInput.value = circle ? rgbToHex(window.getComputedStyle(circle).borderColor) : '#2b2b2b';
    borderInput.oninput = () => {
      if (circle) circle.style.borderColor = borderInput.value;
    };

    // Delete step
    const delBtn = document.createElement('button');
    delBtn.className = 'enc-btn del';
    delBtn.title = '이 단계 삭제';
    delBtn.textContent = '✕';
    delBtn.onclick = () => {
      const parent = node.parentElement;
      if (parent.querySelectorAll('.flow-node').length <= 1) {
        showToast('⚠️ 최소 1개의 단계는 남겨두어야 합니다.');
        return;
      }
      node.remove();
      showToast('🗑️ 단계가 삭제되었습니다. (남은 단계 자동 정렬)');
    };

    const resetBtn = document.createElement('button');
    resetBtn.className = 'enc-btn';
    resetBtn.title = '도형 크기·색상 초기화';
    resetBtn.textContent = '↺';
    resetBtn.onclick = () => {
      if (!circle) return;
      circle.style.width = '';
      circle.style.height = '';
      circle.style.borderRadius = '';
      circle.style.backgroundColor = '';
      circle.style.borderColor = '';
      circle.style.fontSize = '';
      shapeIdx = 0;
      shapeBtn.textContent = SHAPE_ICONS[0];
      showToast('↺ 도형이 기본 크기로 초기화되었습니다.');
    };

    bar.append(shapeBtn, bgInput, borderInput, resetBtn, delBtn);
    node.prepend(bar);
    if (circle) attachResizeHandle(circle, { minW: 64, minH: 64 });
  }

  function attachCardControls(card) {
    const icon = card.querySelector('.ed-icon');
    if (icon) icon.classList.add('editable-text');
    if (card.querySelector('.edit-node-controls')) return;

    const bar = document.createElement('div');
    bar.className = 'edit-node-controls';
    bar.setAttribute('data-injected-ui', '');
    bar.onmousedown = (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); };

    const themeBtn = document.createElement('button');
    themeBtn.className = 'enc-btn';
    themeBtn.title = '다크 / 라이트 카드 전환';
    themeBtn.textContent = '🌓';
    themeBtn.onclick = () => {
      card.style.backgroundColor = '';
      card.classList.toggle('dark');
    };

    const bgInput = document.createElement('input');
    bgInput.type = 'color';
    bgInput.className = 'enc-color';
    bgInput.title = '카드 배경색 직접 변경';
    bgInput.value = rgbToHex(window.getComputedStyle(card).backgroundColor);
    bgInput.oninput = () => {
      card.style.backgroundColor = bgInput.value;
    };

    const delBtn = document.createElement('button');
    delBtn.className = 'enc-btn del';
    delBtn.title = '이 카드 삭제';
    delBtn.textContent = '✕';
    delBtn.onclick = () => {
      const parent = card.parentElement;
      if (parent.querySelectorAll('.ed-card').length <= 1) {
        showToast('⚠️ 최소 1개의 카드는 남겨두어야 합니다.');
        return;
      }
      card.remove();
      showToast('🗑️ 카드가 삭제되었습니다.');
    };

    const resetBtn = document.createElement('button');
    resetBtn.className = 'enc-btn';
    resetBtn.title = '카드 크기·배경 초기화';
    resetBtn.textContent = '↺';
    resetBtn.onclick = () => {
      card.style.width = '';
      card.style.height = '';
      card.style.maxWidth = '';
      card.style.alignSelf = '';
      card.style.justifySelf = '';
      card.style.backgroundColor = '';
      showToast('↺ 카드가 기본 크기로 초기화되었습니다.');
    };

    bar.append(themeBtn, bgInput, resetBtn, delBtn);
    card.prepend(bar);
    attachResizeHandle(card, { minW: 180, minH: 130, gridItem: true });
  }

  function attachListItemControls(list, li) {
    if (li.querySelector('.hw-del-btn')) return;
    const delBtn = document.createElement('button');
    delBtn.className = 'hw-del-btn';
    delBtn.setAttribute('data-injected-ui', '');
    delBtn.title = '항목 삭제';
    delBtn.textContent = '✕';
    delBtn.onclick = () => {
      if (list.querySelectorAll('li').length <= 1) {
        showToast('⚠️ 최소 1개의 항목은 남겨두어야 합니다.');
        return;
      }
      li.remove();
      renumberListBadges(list);
    };
    li.appendChild(delBtn);
  }

  function renumberListBadges(list) {
    list.querySelectorAll('li .hw-badge').forEach((badge, i) => {
      badge.textContent = String(i + 1);
    });
  }

  /* ================= 4. SLIDE NAVIGATION & REVEAL ================= */
  function clearRevealTimers() { revealTimers.forEach(t => clearTimeout(t)); revealTimers = []; }

  function animateSlideNodes(slide) {
    clearRevealTimers();
    const nodes = Array.from(slide.querySelectorAll('.anim-node'));
    nodes.forEach(n => n.classList.remove('visible'));
    nodes.forEach((node, i) => {
      const timer = setTimeout(() => node.classList.add('visible'), 90 + i * 150);
      revealTimers.push(timer);
    });
  }

  function updateSlideClasses() {
    slides.forEach((s, i) => {
      const isActive = i === currentIndex;
      s.classList.toggle('active', isActive);
      if (!isActive) s.querySelectorAll('.anim-node').forEach(n => n.classList.remove('visible'));
    });
    animateSlideNodes(slides[currentIndex]);
    document.getElementById('slideCounter').textContent = `${currentIndex + 1} / ${slides.length}`;
    history.replaceState(null, '', `#${currentIndex + 1}`);
    document.querySelectorAll('.index-item').forEach((item, i) => item.classList.toggle('current', i === currentIndex));
  }

  function goToSlide(index) {
    if (index < 0 || index >= slides.length) return;
    currentIndex = index;
    updateSlideClasses();
  }

  function nextSlide() { if (currentIndex < slides.length - 1) goToSlide(currentIndex + 1); }
  function prevSlide() { if (currentIndex > 0) goToSlide(currentIndex - 1); }

  /* ================= 5. TEACHER AUTH & EDIT MODE ================= */
  function requestEditMode() {
    if (editMode) { exitEditMode(); return; }
    if (isTeacherAuthenticated) { enterEditMode(); return; }
    openAuthModal();
  }

  function openAuthModal() {
    const modal = document.getElementById('teacherAuthModal');
    const input = document.getElementById('authCodeInput');
    document.getElementById('authErrorMsg').textContent = '';
    input.value = '';
    modal.classList.add('open');
    setTimeout(() => input.focus(), 50);
  }

  function closeAuthModal() { document.getElementById('teacherAuthModal').classList.remove('open'); }

  async function verifyTeacherCode() {
    const input = document.getElementById('authCodeInput');
    const err = document.getElementById('authErrorMsg');
    const card = document.getElementById('authCard');
    const enteredHash = await sha256Hex(input.value.trim());

    if (enteredHash === TEACHER_PASSCODE_HASH) {
      isTeacherAuthenticated = true;
      input.value = '';
      closeAuthModal();
      enterEditMode();
    } else {
      err.textContent = '인증 코드가 일치하지 않습니다.';
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      input.value = '';
      input.focus();
    }
  }

  function enterEditMode() {
    if (!isTeacherAuthenticated) return;
    editMode = true;
    attachBlockControls();
    bodyEl.classList.add('edit-mode');
    document.getElementById('btnEdit').classList.add('active');
    document.querySelectorAll('.editable-text').forEach(el => el.setAttribute('contenteditable', 'true'));
    wakeDock();
  }

  function exitEditMode() {
    editMode = false;
    bodyEl.classList.remove('edit-mode');
    document.getElementById('btnEdit').classList.remove('active');
    document.querySelectorAll('.editable-text').forEach(el => el.removeAttribute('contenteditable'));
    toggleColorPopover(false);
    closeEmojiPopover();
    closeGithubConfigModal();
    if (selectedSlot) { selectedSlot.classList.remove('selected'); selectedSlot = null; }
    activeEditableEl = null;
  }

  /* ================= 6. TEXT FORMATTING ================= */
  function syncToolbarWithElement(el) {
    const style = window.getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize) || 16;
    const fsValEl = document.getElementById('fsVal');
    if (fsValEl) fsValEl.textContent = Math.round(fontSize) + 'px';
    const lhPx = parseFloat(style.lineHeight);
    const lhRatio = isNaN(lhPx) ? 1.5 : +(lhPx / fontSize).toFixed(2);
    document.getElementById('lhVal').textContent = lhRatio.toFixed(1);

    const lsPx = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing);
    const lsEm = +(lsPx / fontSize).toFixed(2);
    document.getElementById('lsVal').textContent = lsEm.toFixed(2);
    renderAiColorSwatches(el);
  }

  function execFormat(cmd, value = null) {
    if (!isTeacherAuthenticated || !editMode) return;
    document.execCommand(cmd, false, value);
  }

  function toggleHighlightSelection() {
    if (!isTeacherAuthenticated || !editMode) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const hlSpan = (node.nodeType === 1 ? node : node.parentElement)?.closest('.hl');
    if (hlSpan) {
      const unwrapRange = document.createRange();
      unwrapRange.selectNode(hlSpan);
      sel.removeAllRanges();
      sel.addRange(unwrapRange);
      document.execCommand('insertHTML', false, hlSpan.innerHTML);
    } else {
      const fragment = range.cloneContents();
      const div = document.createElement('div');
      div.appendChild(fragment);
      document.execCommand('insertHTML', false, `<span class="hl">${div.innerHTML}</span>`);
    }
  }

  function applyFontFamily(fontValue) {
    if (!isTeacherAuthenticated || !editMode || !activeEditableEl) return;
    activeEditableEl.style.fontFamily = fontValue;
  }

  function renderAiColorSwatches(el) {
    const isDark = el && el.closest('.dark');
    const palette = isDark ? AI_COLORS_DARK : AI_COLORS_LIGHT;
    document.getElementById('cpBgBadge').textContent = isDark ? '어두운 카드용' : '밝은 배경용';
    const grid = document.getElementById('cpAiGrid');
    grid.innerHTML = '';
    palette.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'cp-swatch-btn';
      btn.innerHTML = `<span class="cp-dot" style="background:${item.hex}"></span><span>${item.name}</span>`;
      btn.onmousedown = (e) => { e.preventDefault(); applyTextColor(item.hex); };
      grid.appendChild(btn);
    });
  }

  function toggleColorPopover(force) {
    const pop = document.getElementById('colorPopover');
    const willOpen = typeof force === 'boolean' ? force : !pop.classList.contains('open');
    if (willOpen) renderAiColorSwatches(activeEditableEl);
    pop.classList.toggle('open', willOpen);
  }

  function applyTextColor(hex) {
    if (!isTeacherAuthenticated || !editMode) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) document.execCommand('foreColor', false, hex);
    else if (activeEditableEl) activeEditableEl.style.color = hex;
  }

  function adjustFontSize(delta) {
    if (!isTeacherAuthenticated || !editMode) return;
    const sel = window.getSelection();
    const hasPartialSel = sel && sel.rangeCount > 0 && !sel.isCollapsed && activeEditableEl &&
      activeEditableEl.contains(sel.anchorNode) && activeEditableEl.contains(sel.focusNode) &&
      sel.toString().trim() !== activeEditableEl.textContent.trim();

    if (hasPartialSel) {
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const existingSpan = (node.nodeType === 1 ? node : node.parentElement)?.closest('span[data-fs]');
      if (existingSpan && activeEditableEl.contains(existingSpan) && sel.toString().trim() === existingSpan.textContent.trim()) {
        const cur = parseFloat(window.getComputedStyle(existingSpan).fontSize) || 16;
        const next = Math.min(96, Math.max(10, Math.round(cur + delta)));
        existingSpan.style.fontSize = next + 'px';
        document.getElementById('fsVal').textContent = next + 'px';
        return;
      }
      const refEl = node.nodeType === 1 ? node : node.parentElement;
      const cur = parseFloat(window.getComputedStyle(refEl).fontSize) || 16;
      const next = Math.min(96, Math.max(10, Math.round(cur + delta)));
      const markerId = 'fs-tmp-' + Date.now();
      const div = document.createElement('div');
      div.appendChild(range.cloneContents());
      document.execCommand('insertHTML', false, `<span id="${markerId}" data-fs="1" style="font-size:${next}px">${div.innerHTML}</span>`);
      const inserted = document.getElementById(markerId);
      if (inserted) {
        inserted.removeAttribute('id');
        const newRange = document.createRange();
        newRange.selectNodeContents(inserted);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
      document.getElementById('fsVal').textContent = next + 'px';
      return;
    }

    if (!activeEditableEl) return;
    const cur = parseFloat(window.getComputedStyle(activeEditableEl).fontSize) || 16;
    const next = Math.min(96, Math.max(10, Math.round(cur + delta)));
    activeEditableEl.style.fontSize = next + 'px';
    document.getElementById('fsVal').textContent = next + 'px';
  }

  function adjustLineHeight(delta) {
    if (!isTeacherAuthenticated || !editMode || !activeEditableEl) return;
    const style = window.getComputedStyle(activeEditableEl);
    const fontSize = parseFloat(style.fontSize) || 16;
    const currentLh = parseFloat(activeEditableEl.style.lineHeight) || (parseFloat(style.lineHeight) / fontSize) || 1.5;
    const nextLh = Math.min(2.4, Math.max(0.9, +(currentLh + delta).toFixed(2)));
    activeEditableEl.style.lineHeight = String(nextLh);
    document.getElementById('lhVal').textContent = nextLh.toFixed(1);
  }

  function adjustLetterSpacing(delta) {
    if (!isTeacherAuthenticated || !editMode || !activeEditableEl) return;
    const style = window.getComputedStyle(activeEditableEl);
    const fontSize = parseFloat(style.fontSize) || 16;
    const lsPx = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing);
    const currentEm = activeEditableEl.style.letterSpacing ? parseFloat(activeEditableEl.style.letterSpacing) : (lsPx / fontSize);
    const nextEm = Math.min(0.25, Math.max(-0.08, +(currentEm + delta).toFixed(2)));
    activeEditableEl.style.letterSpacing = `${nextEm}em`;
    document.getElementById('lsVal').textContent = nextEm.toFixed(2);
  }

  /* ================= 7. IMAGE SLOTS ================= */
  function applyImageToSlot(slot, dataUrl) {
    if (!isTeacherAuthenticated || !editMode || !slot) return;
    const overlay = slot.querySelector('.edit-overlay');
    slot.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = '교안 이미지';
    slot.appendChild(img);
    if (overlay) slot.appendChild(overlay);
  }

  /* ================= 8. CLEAN HTML EXPORT & GITHUB SYNC ================= */
  function buildCleanHTML() {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelector('body').classList.remove('edit-mode');
    // Remove all runtime-injected UI chrome and edit controls
    clone.querySelectorAll('[data-injected-ui]').forEach(el => el.remove());
    clone.querySelectorAll('.editable-text').forEach(el => el.removeAttribute('contenteditable'));
    clone.querySelectorAll('.img-slot').forEach(s => s.classList.remove('selected'));
    clone.querySelectorAll('[data-dots]').forEach(d => d.innerHTML = '');
    clone.querySelectorAll('.slide').forEach((s, i) => {
      s.classList.toggle('active', i === 0);
      s.querySelectorAll('.anim-node').forEach(n => n.classList.remove('visible'));
    });
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function exportCleanHTML() {
    if (!isTeacherAuthenticated || !editMode) return;
    const blob = new Blob([buildCleanHTML()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = FILE_NAME;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`💾 ${FILE_NAME} 파일이 저장되었습니다.`);
  }

  function getDefaultGithubConfig() {
    let owner = '', repo = '', path = FILE_NAME;
    if (location.hostname.endsWith('.github.io')) {
      owner = location.hostname.replace('.github.io', '');
      const parts = location.pathname.split('/').filter(Boolean);
      if (parts.length >= 1) repo = parts[0];
      if (parts.length >= 2) path = parts.slice(1).join('/');
    }
    return { owner, repo, branch: 'main', path, token: '' };
  }

  function loadGithubConfig() {
    try {
      const meta = JSON.parse(localStorage.getItem(GH_META_KEY) || 'null') || {};
      const token = sessionStorage.getItem(GH_TOKEN_KEY) || '';
      return { ...getDefaultGithubConfig(), ...meta, token };
    } catch { return getDefaultGithubConfig(); }
  }

  function openGithubConfigModal() {
    if (!isTeacherAuthenticated || !editMode) return;
    const cfg = loadGithubConfig();
    document.getElementById('ghOwner').value = cfg.owner;
    document.getElementById('ghRepo').value = cfg.repo;
    document.getElementById('ghBranch').value = cfg.branch || 'main';
    document.getElementById('ghPath').value = cfg.path || FILE_NAME;
    document.getElementById('ghToken').value = cfg.token;
    document.getElementById('githubConfigModal').classList.add('open');
  }

  function closeGithubConfigModal() { document.getElementById('githubConfigModal').classList.remove('open'); }

  function saveGithubConfig() {
    const meta = {
      owner: document.getElementById('ghOwner').value.trim(),
      repo: document.getElementById('ghRepo').value.trim(),
      branch: document.getElementById('ghBranch').value.trim() || 'main',
      path: document.getElementById('ghPath').value.trim().replace(/^\/+/, '') || FILE_NAME
    };
    const token = document.getElementById('ghToken').value.trim();
    if (!meta.owner || !meta.repo || !token) {
      showToast('⚠️ 아이디, 저장소 이름, 토큰을 모두 입력해 주세요.');
      return;
    }
    localStorage.setItem(GH_META_KEY, JSON.stringify(meta));
    sessionStorage.setItem(GH_TOKEN_KEY, token);
    closeGithubConfigModal();
    showToast('✅ 설정 저장 완료 (토큰은 탭을 닫으면 자동 삭제됩니다)');
  }

  function clearGithubToken() {
    sessionStorage.removeItem(GH_TOKEN_KEY);
    document.getElementById('ghToken').value = '';
    showToast('🗑️ 저장된 GitHub 토큰이 즉시 삭제되었습니다.');
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  async function pushToGitHub() {
    if (!isTeacherAuthenticated || !editMode) return;
    const cfg = loadGithubConfig();
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      openGithubConfigModal();
      showToast('먼저 GitHub 연동 설정과 토큰을 입력해 주세요.');
      return;
    }

    const btn = document.getElementById('btnGithubPush');
    btn.disabled = true;
    btn.textContent = '☁️ 반영 중...';

    const apiUrl = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;
    const headers = {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };

    try {
      let sha = undefined;
      const getRes = await fetch(`${apiUrl}?ref=${encodeURIComponent(cfg.branch)}`, { headers });
      if (getRes.ok) sha = (await getRes.json()).sha;
      else if (getRes.status !== 404) throw new Error(`조회 실패 (${getRes.status}) — 저장소명과 토큰 권한을 확인하세요.`);

      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: `${FILE_NAME} 업데이트 (${new Date().toLocaleString('ko-KR')})`,
          content: utf8ToBase64(buildCleanHTML()),
          branch: cfg.branch,
          ...(sha ? { sha } : {})
        })
      });

      if (!putRes.ok) {
        const errData = await putRes.json().catch(() => ({}));
        throw new Error(errData.message || `업로드 실패 (${putRes.status})`);
      }
      showToast('✅ GitHub에 반영 완료! 약 30~60초 후 공유 링크에 적용됩니다.', 4500);
    } catch (err) {
      showToast(`❌ 오류: ${err.message}`, 5000);
    } finally {
      btn.disabled = false;
      btn.textContent = '☁️ GitHub 반영';
    }
  }

  /* ================= 9. DOCK, MODALS & CANVAS ================= */
  function toggleIndex(force) {
    const modal = document.getElementById('indexModal');
    const willOpen = typeof force === 'boolean' ? force : !modal.classList.contains('open');
    modal.classList.toggle('open', willOpen);
    document.getElementById('btnIndex').classList.toggle('active', willOpen);
  }

  function toggleCurtain() {
    const overlay = document.getElementById('curtainOverlay');
    const willOpen = !overlay.classList.contains('open');
    overlay.classList.toggle('open', willOpen);
    document.getElementById('btnCurtain').classList.toggle('active', willOpen);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }

  function wakeDock() {
    const dock = document.getElementById('floatingDock');
    if (!dock) return;
    dock.classList.remove('dock-hidden');
    clearTimeout(dockIdleTimer);
    dockIdleTimer = setTimeout(() => {
      if (!penActive && !editMode && !document.getElementById('indexModal').classList.contains('open')) {
        dock.classList.add('dock-hidden');
      }
    }, 2400);
  }

  /* ================= 10. INITIALIZATION ================= */
  function initDeck() {
    injectSharedUI();
    slides = Array.from(document.querySelectorAll('.slide'));

    // Build Index Modal & Mini Dots
    const indexListEl = document.getElementById('indexList');
    slides.forEach((slide, idx) => {
      const btn = document.createElement('button');
      btn.className = 'index-item';
      btn.innerHTML = `<span class="index-num">${String(idx + 1).padStart(2, '0')}</span><span class="index-title">${slide.dataset.title || ('슬라이드 ' + (idx + 1))}</span>`;
      btn.onclick = () => { goToSlide(idx); toggleIndex(false); };
      indexListEl.appendChild(btn);

      const dotsWrap = slide.querySelector('[data-dots]');
      if (dotsWrap) {
        dotsWrap.innerHTML = '';
        slides.forEach((_, dIdx) => {
          const dot = document.createElement('span');
          dot.className = 'mini-dot' + (dIdx === idx ? ' active' : '');
          dotsWrap.appendChild(dot);
        });
        const label = document.createElement('span');
        label.style.marginLeft = '6px';
        label.textContent = `${idx + 1} / ${slides.length}`;
        dotsWrap.appendChild(label);
      }
    });

    // Bind Toolbar Events
    document.querySelector('[data-cmd="bold"]').onclick = () => execFormat('bold');
    document.getElementById('btnHighlight').onclick = toggleHighlightSelection;
    document.getElementById('fontSelect').onchange = (e) => applyFontFamily(e.target.value);
    document.getElementById('btnColorToggle').onclick = () => toggleColorPopover();
    document.getElementById('customColorInput').oninput = (e) => applyTextColor(e.target.value);
    document.getElementById('btnColorClose').onclick = () => toggleColorPopover(false);
    document.getElementById('btnFsDown').onclick = () => adjustFontSize(-2);
    document.getElementById('btnFsUp').onclick = () => adjustFontSize(2);
    document.getElementById('btnLhDown').onclick = () => adjustLineHeight(-0.1);
    document.getElementById('btnLhUp').onclick = () => adjustLineHeight(0.1);
    document.getElementById('btnLsDown').onclick = () => adjustLetterSpacing(-0.01);
    document.getElementById('btnLsUp').onclick = () => adjustLetterSpacing(0.01);
    document.getElementById('btnGithubPush').onclick = pushToGitHub;
    document.getElementById('btnGithubConfig').onclick = openGithubConfigModal;
    document.getElementById('btnLocalSave').onclick = exportCleanHTML;
    document.getElementById('btnExitEdit').onclick = exitEditMode;

    // Bind Emoji Picker Popover
    const emojiGrid = document.getElementById('emojiPresetGrid');
    EMOJI_PRESETS.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'ep-item';
      btn.textContent = em;
      btn.onclick = () => {
        if (!activeEmojiEl) return;
        setEmojiText(activeEmojiEl, em);
        document.getElementById('emojiCustomInput').value = em;
      };
      emojiGrid.appendChild(btn);
    });
    document.getElementById('btnEmojiClose').onclick = closeEmojiPopover;
    document.getElementById('btnEmojiClear').onclick = () => {
      if (!activeEmojiEl) return;
      setEmojiText(activeEmojiEl, '');
      document.getElementById('emojiCustomInput').value = '';
    };
    document.getElementById('emojiCustomInput').oninput = (e) => {
      if (!activeEmojiEl) return;
      setEmojiText(activeEmojiEl, e.target.value);
    };
    document.getElementById('btnEmojiSm').onclick = () => adjustEmojiSize(-4);
    document.getElementById('btnEmojiLg').onclick = () => adjustEmojiSize(4);

    // Open Emoji Picker on clicking .ed-icon or .flow-circle in edit mode
    document.addEventListener('click', (e) => {
      if (!isTeacherAuthenticated || !editMode) return;
      if (e.target.closest('#emojiPopover')) return;
      const iconTarget = e.target.closest('.ed-icon, .flow-circle');
      if (iconTarget && !e.target.closest('.resize-handle')) {
        e.stopPropagation();
        openEmojiPopover(iconTarget);
      } else {
        closeEmojiPopover();
      }
    });

    // Bind Modal Events
    document.getElementById('teacherAuthModal').onclick = (e) => { if (e.target.id === 'teacherAuthModal') closeAuthModal(); };
    document.getElementById('btnAuthCancel').onclick = closeAuthModal;
    document.getElementById('btnAuthVerify').onclick = verifyTeacherCode;
    document.getElementById('authCodeInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyTeacherCode();
      if (e.key === 'Escape') closeAuthModal();
    });

    document.getElementById('githubConfigModal').onclick = (e) => { if (e.target.id === 'githubConfigModal') closeGithubConfigModal(); };
    document.getElementById('btnGhCancel').onclick = closeGithubConfigModal;
    document.getElementById('btnGhSave').onclick = saveGithubConfig;
    document.getElementById('btnGhClear').onclick = clearGithubToken;

    document.getElementById('curtainOverlay').onclick = toggleCurtain;
    document.getElementById('indexModal').onclick = (e) => { if (e.target.id === 'indexModal') toggleIndex(); };
    document.getElementById('btnIndexClose').onclick = () => toggleIndex();

    // Bind Dock Events
    document.getElementById('btnPrev').onclick = prevSlide;
    document.getElementById('btnNext').onclick = nextSlide;
    document.getElementById('btnIndex').onclick = () => toggleIndex();
    document.getElementById('btnCurtain').onclick = toggleCurtain;
    document.getElementById('btnEdit').onclick = requestEditMode;
    document.getElementById('btnFullscreen').onclick = toggleFullscreen;

    // Focus tracking for any editable text (including newly added nodes)
    document.addEventListener('focusin', (e) => {
      if (!isTeacherAuthenticated || !editMode) return;
      const el = e.target.closest('.editable-text');
      if (el) {
        activeEditableEl = el;
        syncToolbarWithElement(el);
      }
    });

    // Image Slot Handlers
    document.querySelectorAll('.img-slot').forEach(slot => {
      slot.addEventListener('click', (e) => {
        if (!isTeacherAuthenticated || !editMode) return;
        e.stopPropagation();
        document.querySelectorAll('.img-slot').forEach(s => s.classList.remove('selected'));
        selectedSlot = slot;
        slot.classList.add('selected');
      });
      slot.addEventListener('dragover', (e) => { if (!isTeacherAuthenticated || !editMode) return; e.preventDefault(); slot.classList.add('selected'); });
      slot.addEventListener('dragleave', () => { if (!isTeacherAuthenticated || !editMode) return; if (slot !== selectedSlot) slot.classList.remove('selected'); });
      slot.addEventListener('drop', (e) => {
        if (!isTeacherAuthenticated || !editMode) return;
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => applyImageToSlot(slot, ev.target.result);
          reader.readAsDataURL(file);
        }
      });
    });

    window.addEventListener('paste', (e) => {
      if (!isTeacherAuthenticated || !editMode || !selectedSlot) return;
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (ev) => applyImageToSlot(selectedSlot, ev.target.result);
          reader.readAsDataURL(item.getAsFile());
          break;
        }
      }
    });

    // Pen Canvas
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#c84b31';
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function togglePen() {
      penActive = !penActive;
      canvas.classList.toggle('drawing', penActive);
      document.getElementById('btnPen').classList.toggle('active', penActive);
      wakeDock();
    }
    function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

    document.getElementById('btnPen').onclick = togglePen;
    document.getElementById('btnClear').onclick = clearCanvas;
    canvas.addEventListener('pointerdown', (e) => { if (!penActive) return; isDrawing = true; ctx.beginPath(); ctx.moveTo(e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', (e) => { if (!isDrawing || !penActive) return; ctx.lineTo(e.clientX, e.clientY); ctx.stroke(); });
    window.addEventListener('pointerup', () => { isDrawing = false; });

    // Dock auto-hide
    window.addEventListener('mousemove', wakeDock);
    window.addEventListener('click', wakeDock);
    wakeDock();

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (document.getElementById('teacherAuthModal').classList.contains('open')) return;
      if (document.getElementById('githubConfigModal').classList.contains('open')) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;

      wakeDock();
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); nextSlide(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prevSlide(); }
      else if (e.key.toLowerCase() === 'h') { location.href = HOME_HREF; }
      else if (e.key.toLowerCase() === 'd') togglePen();
      else if (e.key.toLowerCase() === 'c') clearCanvas();
      else if (e.key.toLowerCase() === 'g') toggleIndex();
      else if (e.key.toLowerCase() === 'b') toggleCurtain();
      else if (e.key.toLowerCase() === 'e') requestEditMode();
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (e.key === 'Escape') {
        toggleIndex(false);
        toggleColorPopover(false);
        closeEmojiPopover();
        document.getElementById('curtainOverlay').classList.remove('open');
        document.getElementById('btnCurtain').classList.remove('active');
      }
    });

    const initialHash = parseInt(location.hash.replace('#', ''), 10);
    if (!isNaN(initialHash) && initialHash >= 1 && initialHash <= slides.length) currentIndex = initialHash - 1;
    updateSlideClasses();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeck);
  } else {
    initDeck();
  }
})();
