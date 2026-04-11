const STORAGE_KEY = 'potm_data_v1';
const DEVICE_VOTER_KEY = 'potm_device_voter_id';

const initialPlayers = [
  [2, 'Posmac Veaceslav'], [3, 'Simba William'], [4, 'Koy Lupano Danny'], [6, 'Ghimp Ion'],
  [7, 'LISU DANIEL'], [9, 'COBEȚ ANDREI'], [11, 'Chele Sorin'], [13, 'Luchiță Vasile'],
  [17, 'Bulmaga Leonardo'], [18, 'Yoda Abdoul Said Razack'], [20, 'Souza De Carvalho Igor'],
  [21, 'Izountouemoi Samouil'], [24, 'Muringen Dehninio Ismael'], [27, 'Keita Sibiry'],
  [29, 'Asmelash Hennos'], [30, 'Takyi Frederick'], [31, 'Dujmovic Filip'],
  [33, 'Fonkeu Njomgang William'], [34, 'Iosipoi Marius'], [35, 'Vornic Denis'],
  [14, 'Odubia Philip Kehinde'], [15, 'Sîrbu David'], [28, 'Kalabatama Kabamba Tumba'],
  [8, 'Rommens Olivier'], [10, 'Gînsari Radu'], [1, 'Lefter Alex']
];

let cropSourceImage = null;

let supabaseClient = null;
let remoteSyncEnabled = false;
let remoteSyncTimer = null;
let remotePollTimer = null;

function initRemoteSync() {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.url || !cfg.anonKey || !window.supabase?.createClient) return;

  supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
  remoteSyncEnabled = true;
}

async function pullRemoteState() {
  if (!remoteSyncEnabled) return;
  const { data, error } = await supabaseClient
    .from('potm_state')
    .select('state')
    .eq('id', 1)
    .maybeSingle();

  if (error) return;
  if (data?.state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.state));
  }
}

async function pushRemoteState(state) {
  if (!remoteSyncEnabled) return;
  await supabaseClient.from('potm_state').upsert({ id: 1, state }, { onConflict: 'id' });
}

function pushRemoteStateDebounced(state) {
  if (!remoteSyncEnabled) return;
  if (remoteSyncTimer) clearTimeout(remoteSyncTimer);
  remoteSyncTimer = setTimeout(() => {
    pushRemoteState(state).catch(() => {});
  }, 250);
}


function startRemotePolling() {
  if (!remoteSyncEnabled || remotePollTimer) return;
  if (qs('adminSection')) return;
  remotePollTimer = setInterval(async () => {
    await pullRemoteState();
    renderAll();
  }, 8000);
}


function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function ensureDeviceVoterId() {
  let id = localStorage.getItem(DEVICE_VOTER_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(DEVICE_VOTER_KEY, id);
  }
  return id;
}

function getData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const data = JSON.parse(raw);

    if (!data.matches) data.matches = [];
    if (!Array.isArray(data.votes)) data.votes = [];

    if (!data.activeMatchId && data.matches.length > 0) {
      data.activeMatchId = data.matches[0].id;
      setData(data);
    }

    return data;
  }

  const players = initialPlayers.map(([number, name]) => ({
    id: uid(),
    number,
    name,
    position: '',
    photoDataUrl: ''
  }));

  const data = {
    users: [{ id: uid(), email: 'admin@club.ro', password: 'admin123', role: 'superadmin' }],
    players,
    matches: [],
    activeMatchId: null,
    votes: []
  };

  setData(data);
  return data;
}

function setData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  pushRemoteStateDebounced(data);
}

function getSession() {
  return JSON.parse(sessionStorage.getItem('potm_session') || 'null');
}

function setSession(session) {
  if (session) sessionStorage.setItem('potm_session', JSON.stringify(session));
  else sessionStorage.removeItem('potm_session');
}

function qs(id) { return document.getElementById(id); }

function renderAll() {
  const data = getData();
  if (qs('voteGrid')) renderVoteSection(data);
  if (qs('playersTable')) renderPlayersAdmin(data);
  if (qs('matchPlayersSelect')) renderMatchesAdmin(data);
  if (qs('resultsMatchSelect')) renderResults(data);
  if (qs('adminSection')) renderAuthUI();
}

function renderAuthUI() {
  const session = getSession();
  if (qs('adminSection')) qs('adminSection').classList.toggle('hidden', !session);
  if (qs('logoutBtn')) qs('logoutBtn').classList.toggle('hidden', !session);
}

function getActiveMatch(data) {
  return data.matches.find(m => m.id === data.activeMatchId) || null;
}

function matchDisplayTitle(match) {
  if (!match) return "";
  return match.opponent ? `${match.title} vs ${match.opponent}` : match.title;
}

function getVoteMode() {
  return document.body?.dataset?.voteMode === 'unlimited' ? 'unlimited' : 'limited';
}

function avatar(player) {
  return player.photoDataUrl || 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
      <rect width='100%' height='100%' fill='#ddd'/><text x='50%' y='53%' text-anchor='middle' font-size='16' fill='#555'>Fără poză</text>
    </svg>`
  );
}

function applyVoteGridFit(count) {
  const grid = qs('voteGrid');
  if (!grid || !count) return;

  const vw = window.innerWidth || 390;
  const vh = window.innerHeight || 800;
  const availableW = Math.max(220, vw - 14);
  const availableH = Math.max(180, vh - 130);
  const gap = 6;

  // Estimate card height as media + label block; keeps all cards inside viewport.
  const cardAspect = 1.35;
  let best = { cols: Math.min(count, 4), rows: Math.ceil(count / Math.min(count, 4)), edge: 80 };

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellW = (availableW - (cols - 1) * gap) / cols;
    const cellH = (availableH - (rows - 1) * gap) / rows;
    const edge = Math.min(cellW, cellH / cardAspect);
    if (edge > best.edge) best = { cols, rows, edge };
  }

  const edge = Math.max(56, Math.floor(best.edge));
  grid.style.setProperty('--fit-cols', String(best.cols));
  grid.style.setProperty('--fit-rows', String(best.rows));
  grid.style.setProperty('--fit-card-pad', `${Math.max(2, Math.floor(edge * 0.035))}px`);
  grid.style.setProperty('--fit-media', `${Math.max(26, Math.floor(edge * 0.56))}px`);
  grid.style.setProperty('--fit-name', `${Math.max(8, Math.floor(edge * 0.12))}px`);
  grid.style.setProperty('--fit-number', `${Math.max(9, Math.floor(edge * 0.14))}px`);
  grid.style.setProperty('--fit-gap', `${gap}px`);
}


function renderVoteSection(data) {
  const active = getActiveMatch(data);
  const grid = qs('voteGrid');
  const info = qs('activeMatchInfo');
  const msg = qs('voteMessage');
  msg.textContent = '';

  if (!active) {
    info.textContent = 'Nu este setat încă un meci activ pentru vot.';
    grid.innerHTML = '';
    return;
  }

  const votePlayers = data.players.filter(p => active.playerIds.includes(p.id));
  applyVoteGridFit(votePlayers.length);
  info.textContent = `${matchDisplayTitle(active)} (${active.date})`;

  const mode = getVoteMode();
  const voterId = ensureDeviceVoterId();
  const existingVote = mode === 'limited'
    ? data.votes.find(v => v.matchId === active.id && v.voterId === voterId && v.source !== 'stadium')
    : null;

  grid.innerHTML = votePlayers.map(player => {
    const hasPhoto = Boolean(player.photoDataUrl);
    const media = hasPhoto
      ? `<img src="${avatar(player)}" alt="${player.name}" class="vote-media" />`
      : `<div class="vote-media vote-media-placeholder">${player.number}</div>`;

    const selectedClass = existingVote?.playerId === player.id ? 'selected' : '';

    return `
      <article class="player-card ${selectedClass}">
        <a href="#" class="vote-link ${existingVote ? 'disabled' : ''}" data-vote-player-id="${player.id}">
          <div class="vote-media-wrap">${media}</div>
          <div class="vote-label"><strong>#${player.number}</strong><br/>${player.name}</div>
        </a>
      </article>
    `;
  }).join('');

  if (mode === 'limited' && existingVote) {
    msg.textContent = 'Ai votat deja pentru acest meci de pe acest dispozitiv.';
  } else if (mode === 'unlimited') {
    msg.textContent = 'Mod stadion activ: fiecare persoană poate vota pe același dispozitiv.';
  }
}

function renderPlayersAdmin(data) {
  const root = qs('playersTable');
  const cards = data.players
    .sort((a, b) => a.number - b.number)
    .map(p => {
      const media = p.photoDataUrl
        ? `<img src="${avatar(p)}" class="admin-player-avatar" alt="${p.name}"/>`
        : `<div class="admin-player-avatar placeholder">${p.number}</div>`;

      return `
        <article class="admin-player-card">
          <div class="admin-player-media">${media}</div>
          <div class="admin-player-name">${p.name}</div>
          <div class="admin-player-meta">#${p.number} - ${p.position || 'Poziție nealeasă'}</div>
          <div class="admin-player-actions">
            <button data-edit-player-id="${p.id}" class="tiny">Editează</button>
            <button data-delete-player-id="${p.id}" class="tiny danger">Șterge</button>
          </div>
        </article>
      `;
    }).join('');

  root.innerHTML = `<div class="admin-player-grid">${cards}</div>`;
}

function renderMatchesAdmin(data) {
  const selector = qs('matchPlayersSelect');
  selector.innerHTML = data.players
    .sort((a, b) => a.number - b.number)
    .map(p => `<label class="match-pill"><input type="checkbox" value="${p.id}" class="match-player-check"/><span>#${p.number} ${p.name}</span></label>`)
    .join('');

  const list = qs('matchesList');
  list.innerHTML = data.matches.map(m => {
    const names = data.players.filter(p => m.playerIds.includes(p.id)).map(p => `#${p.number} ${p.name}`).join(', ');
    return `
      <div class="panel match-item-card">
        <strong>${matchDisplayTitle(m)}</strong> - ${m.date}<br/>
        <small>Jucători: ${names || '-'}</small><br/>
        <button data-edit-match-id="${m.id}">Editează</button>
        <button data-set-active-match-id="${m.id}" ${data.activeMatchId === m.id ? 'disabled' : ''}>Setează activ</button>
      </div>
    `;
  }).join('');
}

function renderResults(data) {
  const select = qs('resultsMatchSelect');
  const previouslySelectedId = select.value;
  select.innerHTML = data.matches.map(m => `<option value="${m.id}">${matchDisplayTitle(m)} (${m.date})</option>`).join('');

  const existsPrevious = data.matches.some(m => m.id === previouslySelectedId);
  if (existsPrevious) {
    select.value = previouslySelectedId;
  } else if (data.activeMatchId && data.matches.some(m => m.id === data.activeMatchId)) {
    select.value = data.activeMatchId;
  }

  const currentMatchId = select.value;

  if (!currentMatchId) {
    qs('resultsTable').innerHTML = '<p class="muted">Nu există meciuri.</p>';
    return;
  }

  const match = data.matches.find(m => m.id === currentMatchId);
  if (!match) return;

  const votes = data.votes.filter(v => v.matchId === currentMatchId);
  const totals = new Map();
  match.playerIds.forEach(pid => totals.set(pid, 0));
  votes.forEach(v => totals.set(v.playerId, (totals.get(v.playerId) || 0) + 1));

  const ranking = [...totals.entries()].map(([pid, count]) => {
    const player = data.players.find(p => p.id === pid);
    const percent = votes.length ? (count * 100 / votes.length) : 0;
    return { player, count, percent };
  }).sort((a, b) => b.count - a.count);

  qs('resultsTable').innerHTML = `
    <section class="results-dashboard">
      <div class="results-total-card">
        <div class="results-total-number">${votes.length}</div>
        <div class="results-total-label">Total voturi</div>
      </div>

      <div class="results-list">
        ${ranking.map((r, idx) => {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
          const pct = r.percent.toFixed(0);
          return `
            <article class="result-row">
              <div class="result-rank">${medal}</div>
              <img src="${avatar(r.player || {})}" alt="${r.player?.name || 'N/A'}" class="result-avatar" />
              <div class="result-player-info">
                <div class="result-player-name">${r.player?.name || 'N/A'}</div>
                <div class="result-player-number">#${r.player?.number || '?'}</div>
              </div>
              <div class="result-score">
                <div class="result-votes">${r.count}</div>
                <div class="result-percent">${pct}%</div>
              </div>
              <div class="result-bar-wrap">
                <div class="result-bar" style="width:${pct}%"></div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      btn.classList.add('active');
      qs(btn.dataset.tab).classList.remove('hidden');
    });
  });
}

function drawCropPreview() {
  if (!cropSourceImage) return;
  const canvas = qs('cropCanvas');
  const ctx = canvas.getContext('2d');
  const z = parseFloat(qs('cropZoom').value);
  const ox = parseInt(qs('cropX').value, 10);
  const oy = parseInt(qs('cropY').value, 10);
  const minSide = Math.min(cropSourceImage.width, cropSourceImage.height) / z;
  const sx = (cropSourceImage.width - minSide) / 2 + (ox / 100) * ((cropSourceImage.width - minSide) / 2);
  const sy = (cropSourceImage.height - minSide) / 2 + (oy / 100) * ((cropSourceImage.height - minSide) / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cropSourceImage, sx, sy, minSide, minSide, 0, 0, canvas.width, canvas.height);
}

function getCroppedDataUrl() {
  if (!cropSourceImage) return '';
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  const z = parseFloat(qs('cropZoom').value);
  const ox = parseInt(qs('cropX').value, 10);
  const oy = parseInt(qs('cropY').value, 10);
  const minSide = Math.min(cropSourceImage.width, cropSourceImage.height) / z;
  const sx = (cropSourceImage.width - minSide) / 2 + (ox / 100) * ((cropSourceImage.width - minSide) / 2);
  const sy = (cropSourceImage.height - minSide) / 2 + (oy / 100) * ((cropSourceImage.height - minSide) / 2);
  ctx.drawImage(cropSourceImage, sx, sy, minSide, minSide, 0, 0, 400, 400);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function setupEvents() {
  if (qs('showLoginBtn')) qs('showLoginBtn').addEventListener('click', () => qs('loginSection').classList.toggle('hidden'));
  if (qs('logoutBtn')) qs('logoutBtn').addEventListener('click', () => { setSession(null); renderAll(); });

  if (qs('loginForm')) qs('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = getData();
    const user = data.users.find(u => u.email === qs('loginEmail').value.trim() && u.password === qs('loginPassword').value);
    if (!user) return alert('Date de autentificare invalide.');
    setSession({ userId: user.id, role: user.role });
    qs('loginSection').classList.add('hidden');
    renderAll();
  });

  if (qs('playerPhoto')) qs('playerPhoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        cropSourceImage = img;
        qs('cropWrapper').classList.remove('hidden');
        ['cropZoom', 'cropX', 'cropY'].forEach(id => {
          qs(id).value = id === 'cropZoom' ? '1' : '0';
        });
        drawCropPreview();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  ['cropZoom', 'cropX', 'cropY'].forEach(id => { if (qs(id)) qs(id).addEventListener('input', drawCropPreview); });

  if (qs('playerForm')) qs('playerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = getData();
    const id = qs('playerId').value;
    const payload = {
      number: parseInt(qs('playerNumber').value, 10),
      name: qs('playerName').value.trim(),
      position: qs('playerPosition').value,
    };

    if (id) {
      const player = data.players.find(p => p.id === id);
      Object.assign(player, payload);
      if (cropSourceImage) player.photoDataUrl = getCroppedDataUrl();
    } else {
      data.players.push({ id: uid(), ...payload, photoDataUrl: cropSourceImage ? getCroppedDataUrl() : '' });
    }

    setData(data);
    resetPlayerForm();
    renderAll();
  });

  if (qs('cancelEditPlayerBtn')) qs('cancelEditPlayerBtn').addEventListener('click', resetPlayerForm);

  if (qs('playersTable')) qs('playersTable').addEventListener('click', (e) => {
    const editBtn = e.target.closest('button[data-edit-player-id]');
    const deleteBtn = e.target.closest('button[data-delete-player-id]');
    const data = getData();

    if (editBtn) {
      const p = data.players.find(x => x.id === editBtn.dataset.editPlayerId);
      if (!p) return;
      qs('playerId').value = p.id;
      qs('playerNumber').value = p.number;
      qs('playerName').value = p.name;
      qs('playerPosition').value = p.position;
      qs('cancelEditPlayerBtn').classList.remove('hidden');
      return;
    }

    if (deleteBtn) {
      if (!confirm('Ștergi jucătorul selectat?')) return;
      const id = deleteBtn.dataset.deletePlayerId;
      data.players = data.players.filter(p => p.id !== id);
      data.matches.forEach(m => m.playerIds = m.playerIds.filter(pid => pid !== id));
      data.votes = data.votes.filter(v => v.playerId !== id);
      setData(data);
      renderAll();
    }
  });

  if (qs('matchForm')) qs('matchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = getData();
    const id = qs('matchId').value;
    const selectedPlayerIds = [...document.querySelectorAll('.match-player-check:checked')].map(i => i.value);
    const payload = {
      title: qs('matchTitle').value.trim(),
      opponent: qs('matchOpponent') ? qs('matchOpponent').value.trim() : '',
      date: qs('matchDate').value,
      playerIds: selectedPlayerIds
    };

    if (id) {
      const match = data.matches.find(m => m.id === id);
      Object.assign(match, payload);
    } else {
      const newMatch = { id: uid(), ...payload };
      data.matches.push(newMatch);
      if (!data.activeMatchId) data.activeMatchId = newMatch.id;
    }

    setData(data);
    resetMatchForm();
    renderAll();
  });

  if (qs('cancelEditMatchBtn')) qs('cancelEditMatchBtn').addEventListener('click', resetMatchForm);

  if (qs('matchesList')) qs('matchesList').addEventListener('click', (e) => {
    const editBtn = e.target.closest('button[data-edit-match-id]');
    const activeBtn = e.target.closest('button[data-set-active-match-id]');
    const data = getData();

    if (editBtn) {
      const match = data.matches.find(m => m.id === editBtn.dataset.editMatchId);
      if (!match) return;
      qs('matchId').value = match.id;
      qs('matchTitle').value = match.title;
      qs('matchDate').value = match.date;
      if (qs('matchOpponent')) qs('matchOpponent').value = match.opponent || '';
      document.querySelectorAll('.match-player-check').forEach(c => {
        c.checked = match.playerIds.includes(c.value);
      });
      qs('cancelEditMatchBtn').classList.remove('hidden');
    }

    if (activeBtn) {
      data.activeMatchId = activeBtn.dataset.setActiveMatchId;
      setData(data);
      renderAll();
    }
  });

  if (qs('resultsMatchSelect')) qs('resultsMatchSelect').addEventListener('change', () => renderResults(getData()));

  if (qs('voteGrid')) qs('voteGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-vote-player-id]');
    if (!btn) return;
    if (btn.tagName === 'A') e.preventDefault();
    const data = getData();
    const active = getActiveMatch(data);
    if (!active) return;
    const mode = getVoteMode();
    const voterId = ensureDeviceVoterId();
    if (mode === 'limited') {
      const already = data.votes.find(v => v.matchId === active.id && v.voterId === voterId && v.source !== 'stadium');
      if (already) return;
    }
    data.votes.push({
      id: uid(),
      matchId: active.id,
      playerId: btn.dataset.votePlayerId,
      voterId: mode === 'limited' ? voterId : `stadium_${uid()}`,
      source: mode === 'limited' ? 'online' : 'stadium',
      at: new Date().toISOString()
    });
    setData(data);

    if (mode === 'unlimited') {
      const card = btn.closest('.player-card');
      if (card) {
        card.classList.remove('vote-success');
        void card.offsetWidth;
        card.classList.add('vote-success');
      }
      setTimeout(() => renderAll(), 950);
      return;
    }

    renderAll();
  });
}

function resetPlayerForm() {
  qs('playerForm').reset();
  qs('playerId').value = '';
  cropSourceImage = null;
  qs('cropWrapper').classList.add('hidden');
  qs('cancelEditPlayerBtn').classList.add('hidden');
}

function resetMatchForm() {
  qs('matchForm').reset();
  qs('matchId').value = '';
  qs('cancelEditMatchBtn').classList.add('hidden');
  document.querySelectorAll('.match-player-check').forEach(c => c.checked = false);
}

(async function init() {
  initRemoteSync();
  if (remoteSyncEnabled) {
    await pullRemoteState();
  }

  const initialData = getData();
  if (remoteSyncEnabled && !initialData.activeMatchId) {
    await pullRemoteState();
  }

  initTabs();
  setupEvents();
  window.addEventListener('resize', () => {
    if (qs('voteGrid')) renderVoteSection(getData());
  });
  startRemotePolling();
  renderAll();
})();
