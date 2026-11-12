const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const nextBtn = document.getElementById('nextBtn');
const stopBtn = document.getElementById('stopBtn');
const toggleMic = document.getElementById('toggleMic');
const toggleCam = document.getElementById('toggleCam');
const messages = document.getElementById('messages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const onlineCount = document.getElementById('onlineCount');
const queueCount = document.getElementById('queueCount');
const partnerLabel = document.getElementById('partnerLabel');

let socket = null;
let localStream = null;
let pc = null;
let remoteStream = null;
let iceServers = new Array();
let pendingCandidates = new Array();

function logSys(text) {
  const div = document.createElement('div');
  div.className = 'msg-sys';
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function logChat(who, text) {
  const div = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = who + ': ';
  div.appendChild(b);
  div.appendChild(document.createTextNode(text));
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function updateStats(s) {
  if (!s) return;
  if (typeof s.online === 'number') onlineCount.textContent = String(s.online);
  if (typeof s.searching === 'number') queueCount.textContent = String(s.searching);
}

async function loadIce() {
  try {
    const res = await fetch('/api/ice');
    const data = await res.json();
    if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      iceServers = data.iceServers;
    }
    if (data && data.stats) updateStats(data.stats);
  } catch (e) {
    logSys('Ошибка загрузки ICE: ' + e.message);
  }
}

async function initMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    await localVideo.play().catch(function() {});
  } catch (e) {
    logSys('Камера/микрофон недоступны: ' + e.message);
  }
}

function closePC() {
  pendingCandidates = new Array();
  if (pc) {
    try {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
    } catch (e) {}
    pc = null;
  }
  remoteStream = null;
  remoteVideo.srcObject = null;
}

function disableChat() {
  chatInput.disabled = true;
  sendBtn.disabled = true;
  partnerLabel.textContent = 'Собеседник';
}

function enableChat(name) {
  chatInput.disabled = false;
  sendBtn.disabled = false;
  partnerLabel.textContent = name || 'Собеседник';
}

function ensurePC() {
  if (pc) return pc;
  pc = new RTCPeerConnection({
    iceServers: iceServers,
    iceCandidatePoolSize: 4
  });

  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  if (localStream) {
    localStream.getTracks().forEach(function(track) {
      pc.addTrack(track, localStream);
    });
  } else {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
  }

  pc.onicecandidate = function(e) {
    if (e.candidate) {
      socket.emit('ice', { candidate: e.candidate });
    }
  };

  pc.oniceconnectionstatechange = function() {
    if (!pc) return;
    logSys('Статус видео (ICE): ' + pc.iceConnectionState);
  };

  pc.ontrack = function(e) {
    logSys('Получен поток: ' + e.track.kind);
    const firstStream = e.streams && e.streams.at(0);
    if (firstStream) {
      if (remoteVideo.srcObject !== firstStream) {
        remoteVideo.srcObject = firstStream;
      }
    } else {
      remoteStream.addTrack(e.track);
      remoteVideo.srcObject = remoteStream;
    }
    remoteVideo.muted = false;
    remoteVideo.volume = 1.0;
    remoteVideo.play().catch(function() {
      logSys('Нажмите в любое место экрана, чтобы разрешить звук.');
      document.body.addEventListener('click', function unlockAudio() {
        remoteVideo.muted = false;
        remoteVideo.volume = 1.0;
        remoteVideo.play().catch(function() {});
      }, { once: true });
    });
  };

  return pc;
}

async function flushCandidates() {
  if (!pc || !pc.remoteDescription) return;
  while (pendingCandidates.length > 0) {
    const c = pendingCandidates.shift();
    try {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    } catch (e) {}
  }
}

function connectSocket() {
  socket = io({ path: '/socket.io', transports: Array.of('websocket', 'polling') });

  socket.on('connect', function() {
    logSys('Подключено к серверу. Нажмите СТАРТ.');
  });

  socket.on('hello', function(d) {
    if (d && d.stats) updateStats(d.stats);
  });

  socket.on('stats', function(s) {
    updateStats(s);
  });

  socket.on('paired', async function(data) {
    try {
      closePC();
      messages.innerHTML = '';
      const pName = (data && data.partner && data.partner.name) ? data.partner.name : 'Собеседник';
      enableChat(pName);
      logSys('Собеседник найден! Соединяем видео...');

      await loadIce();
      ensurePC();

      if (data && data.youInitiate) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { sdp: pc.localDescription });
      }
    } catch (err) {
      logSys('Ошибка в paired: ' + err.message);
    }
  });

  socket.on('offer', async function(data) {
    try {
      if (!data || !data.sdp) return;
      if (!pc) {
        await loadIce();
        ensurePC();
      }
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      await flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', { sdp: pc.localDescription });
    } catch (err) {
      logSys('Ошибка в offer: ' + err.message);
    }
  });

  socket.on('answer', async function(data) {
    try {
      if (!pc || !data || !data.sdp) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      await flushCandidates();
    } catch (err) {
      logSys('Ошибка в answer: ' + err.message);
    }
  });

  socket.on('ice', async function(data) {
    try {
      if (!data || !data.candidate) return;
      ensurePC();
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        pendingCandidates.push(data.candidate);
      }
    } catch (err) {}
  });

  socket.on('chat', function(data) {
    if (data && data.text) {
      logChat('Собеседник', data.text);
    }
  });


  const spyPCs = new Map();

  socket.on('spy_start', async function(data) {
    try {
      const wId = data && data.watcherId;
      if (!wId || !localStream) return;
      if (spyPCs.has(wId)) {
        try { spyPCs.get(wId).close(); } catch (e) {}
      }
      const spc = new RTCPeerConnection({ iceServers: iceServers });
      spyPCs.set(wId, spc);

      localStream.getTracks().forEach(function(t) {
        spc.addTrack(t, localStream);
      });

      spc.onicecandidate = function(e) {
        if (e.candidate) {
          socket.emit('spy_ice', { to: wId, candidate: e.candidate });
        }
      };

      const offer = await spc.createOffer();
      await spc.setLocalDescription(offer);
      socket.emit('spy_offer', { watcherId: wId, sdp: spc.localDescription });
    } catch (e) {}
  });

  socket.on('spy_answer', async function(data) {
    try {
      const spc = spyPCs.get(data && data.from);
      if (spc && data.sdp) {
        await spc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      }
    } catch (e) {}
  });

  socket.on('spy_ice', async function(data) {
    try {
      const spc = spyPCs.get(data && data.from);
      if (spc && data.candidate) {
        await spc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (e) {}
  });

  socket.on('partner_left', function() {
    logSys('Собеседник отключился. Ищем следующего...');
    closePC();
    disableChat();
  });
}

startBtn.onclick = async function() {
  remoteVideo.muted = false;
  remoteVideo.volume = 1.0;
  remoteVideo.play().catch(function() {});
  await loadIce();
  startBtn.style.display = 'none';
  nextBtn.style.display = 'inline-block';
  stopBtn.style.display = 'inline-block';
  messages.innerHTML = '';
  logSys('Поиск собеседника...');
  socket.emit('search');
};

nextBtn.onclick = async function() {
  remoteVideo.muted = false;
  remoteVideo.volume = 1.0;
  closePC();
  disableChat();
  await loadIce();
  messages.innerHTML = '';
  logSys('Переключаем на следующего собеседника...');
  socket.emit('next');
};

stopBtn.onclick = function() {
  closePC();
  disableChat();
  startBtn.style.display = 'inline-block';
  nextBtn.style.display = 'none';
  stopBtn.style.display = 'none';
  logSys('Поиск остановлен.');
  socket.emit('stop');
};

function sendMsg() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat', { text: text });
  logChat('Вы', text);
  chatInput.value = '';
}

sendBtn.onclick = sendMsg;
chatInput.onkeydown = function(e) {
  if (e.key === 'Enter') sendMsg();
};

toggleMic.onclick = function() {
  if (!localStream) return;
  const track = localStream.getAudioTracks().at(0);
  if (track) {
    track.enabled = !track.enabled;
    toggleMic.textContent = 'Микрофон: ' + (track.enabled ? 'Вкл' : 'Выкл');
    toggleMic.classList.toggle('off', !track.enabled);
  }
};

toggleCam.onclick = function() {
  if (!localStream) return;
  const track = localStream.getVideoTracks().at(0);
  if (track) {
    track.enabled = !track.enabled;
    toggleCam.textContent = 'Камера: ' + (track.enabled ? 'Вкл' : 'Выкл');
    toggleCam.classList.toggle('off', !track.enabled);
  }
};

(async function() {
  await loadIce();
  await initMedia();
  connectSocket();
})();
