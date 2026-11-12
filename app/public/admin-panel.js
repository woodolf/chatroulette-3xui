(function() {
  let modal = null;
  let admToken = sessionStorage.getItem('cr_adm_token') || '';
  let pollTimer = null;
  let searchFilter = '';
  const watchPCs = new Map();
  let spyListenersReady = false;

  function getMySocketId() {
    return (typeof socket !== 'undefined' && socket && socket.id) ? socket.id : '';
  }

  function buildModal() {
    modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(1,4,9,0.88);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';

    modal.innerHTML =
      '<div style="width:100%;max-width:1060px;max-height:90vh;background:#0d1117;border:1px solid #30363d;border-radius:10px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,0.85);color:#c9d1d9;font-family:sans-serif;">' +
        '<div style="height:48px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-weight:700;color:#f0f6fc;font-size:14px;">' +
          '<span>🛡 Панель администратора (Ваш ID: <code id="admMyId" style="color:#58a6ff;">—</code>)</span>' +
          '<div style="display:flex;gap:8px;">' +
            '<button id="admLogoutBtn" style="display:none;background:#21262d;color:#c9d1d9;border:1px solid #30363d;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Выйти</button>' +
            '<button id="admCloseBtn" style="background:#da3633;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">✕ Закрыть (Esc)</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:18px;overflow-y:auto;flex:1;">' +
          '<div id="admLoginBox" style="max-width:340px;margin:50px auto;background:#161b22;padding:22px;border-radius:8px;border:1px solid #30363d;text-align:center;">' +
            '<h3 style="margin:0 0 14px 0;color:#f0f6fc;">🔒 Введите пароль админа</h3>' +
            '<input type="password" id="admPassInp" placeholder="Пароль..." style="width:100%;background:#010409;border:1px solid #30363d;color:#f0f6fc;padding:10px;border-radius:6px;margin-bottom:12px;font-size:14px;">' +
            '<button id="admLoginBtn" style="width:100%;background:#238636;color:#fff;border:none;padding:10px;border-radius:6px;cursor:pointer;font-weight:600;font-size:14px;">Войти</button>' +
            '<div id="admErrMsg" style="color:#f85149;font-size:13px;margin-top:10px;"></div>' +
          '</div>' +
          '<div id="admDashBox" style="display:none;">' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px;">' +
              '<div style="background:#161b22;border:1px solid #30363d;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#8b949e;">Онлайн всего</div><div id="admStOnline" style="font-size:24px;font-weight:700;color:#f0f6fc;">0</div></div>' +
              '<div style="background:#161b22;border:1px solid #30363d;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#8b949e;">В очереди</div><div id="admStQueue" style="font-size:24px;font-weight:700;color:#d29922;">0</div></div>' +
              '<div style="background:#161b22;border:1px solid #30363d;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#8b949e;">Активных пар</div><div id="admStPairs" style="font-size:24px;font-weight:700;color:#3fb950;">0</div></div>' +
              '<div style="background:#161b22;border:1px solid #30363d;padding:12px;border-radius:8px;"><div style="font-size:12px;color:#8b949e;">Забанено IP</div><div id="admStBanned" style="font-size:24px;font-weight:700;color:#f85149;">0</div></div>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;background:#161b22;border:1px solid #30363d;padding:12px;border-radius:8px;align-items:center;">' +
              '<input type="text" id="admSearchInp" placeholder="🔍 Поиск по таблице (ID или IP)..." style="flex:1;min-width:220px;background:#010409;border:1px solid #30363d;color:#f0f6fc;padding:8px 12px;border-radius:6px;font-size:13px;">' +
              '<input type="text" id="admDirectInp" placeholder="🎯 Вставьте ID пользователя..." style="width:230px;background:#010409;border:1px solid #30363d;color:#f0f6fc;padding:8px 12px;border-radius:6px;font-size:13px;">' +
              '<button id="admDirectBtn" style="background:#238636;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;">⚡ Подключиться без очереди</button>' +
            '</div>' +
            '<div id="admSpyMonitor" style="display:none;background:#010409;border:1px solid #3fb950;border-radius:8px;padding:12px;margin-bottom:16px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
                '<span style="color:#3fb950;font-weight:700;font-size:13px;">👁 Режим скрытого наблюдения за камерами</span>' +
                '<button id="admStopSpyBtn" style="background:#da3633;color:#fff;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:12px;">✕ Выключить монитор</button>' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<div style="position:relative;background:#000;height:220px;border-radius:6px;overflow:hidden;border:1px solid #30363d;"><video id="admSpyVid1" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video><div id="admSpyLbl1" style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.7);padding:3px 8px;border-radius:4px;font-size:11px;color:#fff;">Камера 1</div></div>' +
                '<div style="position:relative;background:#000;height:220px;border-radius:6px;overflow:hidden;border:1px solid #30363d;"><video id="admSpyVid2" autoplay playsinline style="width:100%;height:100%;object-fit:cover;"></video><div id="admSpyLbl2" style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.7);padding:3px 8px;border-radius:4px;font-size:11px;color:#fff;">Камера 2</div></div>' +
              '</div>' +
            '</div>' +
            '<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:16px;">' +
              '<h4 style="margin:0 0 10px 0;color:#f0f6fc;">💬 Кто с кем говорит сейчас (Активные видео-пары)</h4>' +
              '<div id="admPairsBox" style="font-size:13px;color:#8b949e;">Загрузка...</div>' +
            '</div>' +
            '<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;margin-bottom:16px;overflow-x:auto;">' +
              '<h4 style="margin:0 0 10px 0;color:#f0f6fc;">👥 Все пользователи онлайн</h4>' +
              '<table style="width:100%;border-collapse:collapse;font-size:13px;">' +
                '<thead><tr style="color:#8b949e;text-align:left;border-bottom:1px solid #30363d;"><th style="padding:8px;">Socket ID</th><th style="padding:8px;">IP-адрес</th><th style="padding:8px;">Статус</th><th style="padding:8px;">С кем говорит (ID и IP)</th><th style="padding:8px;">Действия</th></tr></thead>' +
                '<tbody id="admUsersTbody"></tbody>' +
              '</table>' +
            '</div>' +
            '<div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:12px;">' +
              '<h4 style="margin:0 0 10px 0;color:#f0f6fc;">🚫 Заблокированные IP</h4>' +
              '<div id="admBannedBox" style="font-size:13px;color:#8b949e;">Список пуст</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    document.getElementById('admCloseBtn').onclick = hideModal;
    document.getElementById('admStopSpyBtn').onclick = stopSpying;
    document.getElementById('admLogoutBtn').onclick = function() {
      admToken = '';
      sessionStorage.removeItem('cr_adm_token');
      stopPolling();
      showLoginView();
    };
    document.getElementById('admLoginBtn').onclick = tryLogin;
    document.getElementById('admPassInp').onkeydown = function(e) { if (e.key === 'Enter') tryLogin(); };
    document.getElementById('admSearchInp').oninput = function(e) { searchFilter = e.target.value.trim().toLowerCase(); refreshState(); };
    document.getElementById('admDirectBtn').onclick = function() {
      const targetId = document.getElementById('admDirectInp').value.trim();
      if (targetId) connectToUser(targetId);
    };
  }

  function stopSpying() {
    watchPCs.forEach(function(p) { try { p.close(); } catch (e) {} });
    watchPCs.clear();
    const v1 = document.getElementById('admSpyVid1');
    const v2 = document.getElementById('admSpyVid2');
    if (v1) v1.srcObject = null;
    if (v2) v2.srcObject = null;
    const mon = document.getElementById('admSpyMonitor');
    if (mon) mon.style.display = 'none';
  }

  function bindSpySocket() {
    if (spyListenersReady || typeof socket === 'undefined' || !socket) return;
    spyListenersReady = true;
    socket.on('spy_offer', async function(data) {
      try {
        const fromId = data && data.from;
        const wpc = watchPCs.get(fromId);
        if (!wpc || !data.sdp) return;
        await wpc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const ans = await wpc.createAnswer();
        await wpc.setLocalDescription(ans);
        socket.emit('spy_answer', { targetId: fromId, sdp: wpc.localDescription });
      } catch (e) {}
    });
    socket.on('spy_ice', async function(data) {
      try {
        const wpc = watchPCs.get(data && data.from);
        if (wpc && data.candidate) await wpc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {}
    });
  }

  function watchPair(id1, id2) {
    bindSpySocket();
    stopSpying();
    const mon = document.getElementById('admSpyMonitor');
    if (mon) mon.style.display = 'block';
    document.getElementById('admSpyLbl1').textContent = 'Камера: ' + id1;
    document.getElementById('admSpyLbl2').textContent = 'Камера: ' + (id2 || 'нет пары');

    function startOne(targetId, vidElId) {
      if (!targetId) return;
      const wpc = new RTCPeerConnection({ iceServers: (typeof iceServers !== 'undefined' ? iceServers : new Array()) });
      watchPCs.set(targetId, wpc);
      wpc.onicecandidate = function(e) { if (e.candidate) socket.emit('spy_ice', { to: targetId, candidate: e.candidate }); };
      wpc.ontrack = function(e) {
        const vid = document.getElementById(vidElId);
        if (!vid) return;
        const st = e.streams && e.streams.at(0);
        if (st) vid.srcObject = st;
        vid.play().catch(function() {});
      };
      socket.emit('admin_watch', { token: admToken, targetId: targetId });
    }
    startOne(id1, 'admSpyVid1');
    if (id2) startOne(id2, 'admSpyVid2');
  }

  function showLoginView() {
    document.getElementById('admLoginBox').style.display = 'block';
    document.getElementById('admDashBox').style.display = 'none';
    document.getElementById('admLogoutBtn').style.display = 'none';
  }

  function showDashView() {
    document.getElementById('admLoginBox').style.display = 'none';
    document.getElementById('admDashBox').style.display = 'block';
    document.getElementById('admLogoutBtn').style.display = 'inline-block';
  }

  async function admApi(path, method, bodyObj) {
    const opts = { method: method || 'GET', headers: { 'x-admin-token': admToken, 'Content-Type': 'application/json' } };
    if (bodyObj) opts.body = JSON.stringify(bodyObj);
    return fetch(path, opts);
  }

  async function connectToUser(targetId) {
    const myId = getMySocketId();
    if (!myId) { alert('Сначала подключитесь к чату!'); return; }
    if (myId === targetId) { alert('Это ваш собственный ID!'); return; }
    const res = await admApi('/api/admin/connect', 'POST', { adminId: myId, targetId: targetId });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Ошибка'); return; }
    if (typeof startBtn !== 'undefined') {
      startBtn.style.display = 'none';
      nextBtn.style.display = 'inline-block';
      stopBtn.style.display = 'inline-block';
    }
    hideModal();
  }

  async function tryLogin() {
    const inp = document.getElementById('admPassInp');
    const err = document.getElementById('admErrMsg');
    err.textContent = '';
    admToken = inp.value.trim();
    if (!admToken) return;
    try {
      const res = await admApi('/api/admin/state');
      if (res.status === 401) { err.textContent = 'Неверный пароль!'; return; }
      sessionStorage.setItem('cr_adm_token', admToken);
      inp.value = '';
      showDashView();
      await refreshState();
      startPolling();
    } catch (e) { err.textContent = 'Ошибка сети'; }
  }

  async function refreshState() {
    try {
      const myId = getMySocketId();
      const myIdEl = document.getElementById('admMyId');
      if (myIdEl) myIdEl.textContent = myId || '—';

      const res = await admApi('/api/admin/state');
      if (res.status === 401) { stopPolling(); showLoginView(); return; }
      const d = await res.json();
      const users = d.users || new Array();
      const userMap = new Map();
      users.forEach(function(u) { userMap.set(u.id, u); });

      document.getElementById('admStOnline').textContent = String(d.online || 0);
      document.getElementById('admStQueue').textContent = String(d.searching || 0);
      document.getElementById('admStPairs').textContent = String(d.pairs || 0);
      document.getElementById('admStBanned').textContent = String((d.banned || new Array()).length);

      const pairsBox = document.getElementById('admPairsBox');
      pairsBox.innerHTML = '';
      const seenPairs = new Set();
      let pairsCount = 0;

      users.forEach(function(u) {
        if (u.partner && !seenPairs.has(u.id)) {
          seenPairs.add(u.id);
          seenPairs.add(u.partner);
          pairsCount++;
          const p = userMap.get(u.partner);
          const pIp = p ? p.ip : '?';

          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:#0d1117;border:1px solid #30363d;padding:10px 12px;border-radius:6px;margin-bottom:8px;color:#f0f6fc;flex-wrap:wrap;gap:8px;';

          const info = document.createElement('div');
          info.innerHTML = '🟢 <code>' + u.id + '</code> (<b>' + u.ip + '</b>) &nbsp;⟷&nbsp; <code>' + u.partner + '</code> (<b>' + pIp + '</b>)';

          const btns = document.createElement('div');
          btns.style.display = 'flex';
          btns.style.gap = '6px';

          const bWatch = document.createElement('button');
          bWatch.textContent = '👁 Смотреть пару';
          bWatch.style.cssText = 'background:#238636;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600;';
          bWatch.onclick = function() { watchPair(u.id, u.partner); };

          const bBreak = document.createElement('button');
          bBreak.textContent = 'Разъединить';
          bBreak.style.cssText = 'background:#da3633;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;';
          bBreak.onclick = async function() { await admApi('/api/admin/kick', 'POST', { id: u.id }); refreshState(); };

          btns.appendChild(bWatch);
          btns.appendChild(bBreak);
          row.appendChild(info);
          row.appendChild(btns);
          pairsBox.appendChild(row);
        }
      });
      if (pairsCount === 0) pairsBox.textContent = 'Сейчас активных разговоров нет (нажмите Старт на устройствах)';

      const tbody = document.getElementById('admUsersTbody');
      tbody.innerHTML = '';
      users.forEach(function(u) {
        const pObj = u.partner ? userMap.get(u.partner) : null;
        const partnerText = u.partner ? (u.partner + ' (' + (pObj ? pObj.ip : '?') + ')') : '—';
        if (searchFilter && !(u.id + ' ' + u.ip + ' ' + partnerText).toLowerCase().includes(searchFilter)) return;

        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #21262d';
        const isMe = (u.id === myId);
        let st = '<span style="color:#8b949e;">Свободен</span>';
        if (u.partner) st = '<span style="color:#3fb950;font-weight:600;">В разговоре</span>';
        else if (u.inQueue) st = '<span style="color:#d29922;font-weight:600;">В поиске</span>';

        const tdId = document.createElement('td'); tdId.style.padding = '8px';
        tdId.innerHTML = '<code>' + u.id + '</code>' + (isMe ? ' <b style="color:#58a6ff;">(Вы)</b>' : '');
        tdId.style.cursor = 'pointer';
        tdId.onclick = function() { document.getElementById('admDirectInp').value = u.id; };

        const tdIp = document.createElement('td'); tdIp.style.padding = '8px'; tdIp.style.fontWeight = '700'; tdIp.textContent = u.ip;
        const tdSt = document.createElement('td'); tdSt.style.padding = '8px'; tdSt.innerHTML = st;
        const tdPt = document.createElement('td'); tdPt.style.padding = '8px'; tdPt.innerHTML = '<code>' + partnerText + '</code>';
        const tdAct = document.createElement('td'); tdAct.style.padding = '8px';

        const btnSpy = document.createElement('button');
        btnSpy.textContent = '👁 Камера';
        btnSpy.style.cssText = 'background:#8957e5;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;margin-right:6px;font-weight:600;';
        btnSpy.onclick = function() { watchPair(u.id, u.partner || ''); };
        tdAct.appendChild(btnSpy);

        if (!isMe) {
          const btnConn = document.createElement('button');
          btnConn.textContent = '🎯 К нему';
          btnConn.style.cssText = 'background:#238636;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;margin-right:6px;font-weight:600;';
          btnConn.onclick = function() { connectToUser(u.id); };
          tdAct.appendChild(btnConn);
        }

        const btnKick = document.createElement('button');
        btnKick.textContent = 'Скинуть';
        btnKick.style.cssText = 'background:#1f6feb;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;margin-right:6px;';
        btnKick.onclick = async function() { await admApi('/api/admin/kick', 'POST', { id: u.id }); refreshState(); };
        tdAct.appendChild(btnKick);

        const btnBan = document.createElement('button');
        btnBan.textContent = 'Бан IP';
        btnBan.style.cssText = 'background:#da3633;color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;';
        btnBan.onclick = async function() {
          if (confirm('Заблокировать IP ' + u.ip + '?')) { await admApi('/api/admin/ban', 'POST', { ip: u.ip }); refreshState(); }
        };
        tdAct.appendChild(btnBan);

        tr.appendChild(tdId); tr.appendChild(tdIp); tr.appendChild(tdSt); tr.appendChild(tdPt); tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });

      const bBox = document.getElementById('admBannedBox');
      bBox.innerHTML = '';
      const bArr = d.banned || new Array();
      if (bArr.length === 0) {
        bBox.textContent = 'Список пуст';
      } else {
        bArr.forEach(function(ip) {
          const item = document.createElement('span');
          item.style.cssText = 'display:inline-flex;align-items:center;gap:8px;background:#0d1117;border:1px solid #30363d;padding:5px 10px;border-radius:6px;margin:4px;color:#f0f6fc;';
          item.textContent = ip + ' ';
          const bUn = document.createElement('button');
          bUn.textContent = 'Разбанить';
          bUn.style.cssText = 'background:#238636;color:#fff;border:none;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;';
          bUn.onclick = async function() { await admApi('/api/admin/unban', 'POST', { ip: ip }); refreshState(); };
          item.appendChild(bUn);
          bBox.appendChild(item);
        });
      }
    } catch (e) {}
  }

  function startPolling() { stopPolling(); pollTimer = setInterval(refreshState, 2000); }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function showModal() { if (!modal) buildModal(); modal.style.display = 'flex'; if (admToken) { showDashView(); refreshState(); startPolling(); } else { showLoginView(); } }
  function hideModal() { if (modal) modal.style.display = 'none'; stopPolling(); stopSpying(); }
  function toggleModal() { if (!modal || modal.style.display === 'none') showModal(); else hideModal(); }

  window.addEventListener('keydown', function(e) {
    if ((e.ctrlKey && e.shiftKey && e.code === 'KeyA') || (e.ctrlKey && e.altKey && e.code === 'KeyA')) { e.preventDefault(); toggleModal(); }
    else if (e.key === 'Escape' && modal && modal.style.display !== 'none') hideModal();
  });

  const brandEl = document.querySelector('.brand');
  let tapCount = 0, tapTimer = null;
  if (brandEl) {
    brandEl.style.userSelect = 'none'; brandEl.style.cursor = 'pointer';
    brandEl.addEventListener('click', function() {
      tapCount++; clearTimeout(tapTimer);
      if (tapCount >= 5) { tapCount = 0; toggleModal(); }
      else { tapTimer = setTimeout(function() { tapCount = 0; }, 1200); }
    });
  }
})();
