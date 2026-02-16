const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const msg = document.getElementById('authMessage');
const authCard = document.getElementById('authCard');
const classSelector = document.getElementById('classSelector');
const classList = document.getElementById('classList');
const socialArea = document.getElementById('socialArea');
const profile = document.getElementById('profile');
const showLogin = document.getElementById('showLogin');
const showRegister = document.getElementById('showRegister');
const chatList = document.getElementById('chatList');
const messageForm = document.getElementById('messageForm');
const classmatesRoot = document.getElementById('classmates');
const activeClassTitle = document.getElementById('activeClassTitle');
const activeClassHint = document.getElementById('activeClassHint');
const switchClassBtn = document.getElementById('switchClassBtn');

showLogin.onclick = () => {
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  showLogin.classList.add('active');
  showRegister.classList.remove('active');
};

showRegister.onclick = () => {
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  showRegister.classList.add('active');
  showLogin.classList.remove('active');
};

function token() {
  return localStorage.getItem('token');
}

function clearViewToAuth() {
  authCard.classList.remove('hidden');
  classSelector.classList.add('hidden');
  socialArea.classList.add('hidden');
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token()}`
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(registerForm).entries());

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  msg.textContent = res.ok
    ? `Успешно! Ваш ID: ${data.userId}. Теперь войдите в аккаунт.`
    : data.error || 'Ошибка регистрации';
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(loginForm).entries());

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.error || 'Ошибка входа';
    return;
  }

  localStorage.setItem('token', data.token);
  msg.textContent = '';
  await bootSocial();
});

async function loadProfile() {
  const { ok, data, status } = await api('/api/me');
  if (!ok) {
    if (status === 401) {
      localStorage.removeItem('token');
      clearViewToAuth();
    }
    return null;
  }

  profile.innerHTML = `
    <p><b>Имя:</b> ${data.name}</p>
    <p><b>Username:</b> @${data.username}</p>
    <p><b>ID:</b> ${data.id}</p>
    <p><b>Статус:</b> <span class="badge ${data.role.design}">${data.role.label}</span></p>
    <p><b>Лайки:</b> ${data.likes}</p>
    <p><b>Сообщения:</b> ${data.messages}</p>
    <button id="logoutBtn">Выйти</button>
  `;

  document.getElementById('logoutBtn').onclick = () => {
    localStorage.removeItem('token');
    location.reload();
  };

  return data;
}

async function loadClassesForSelection() {
  const { ok, data } = await api('/api/classes');
  if (!ok) return;

  classList.innerHTML = data
    .map(
      (item) => `
      <div class="class-item">
        <h4>${item.name}</h4>
        <div class="class-actions">
          ${
            item.joined
              ? `<button onclick="selectClass('${item.id}')">Открыть</button>`
              : `<input id="code-${item.id}" placeholder="Пароль класса" maxlength="5" /><button onclick="joinClass('${item.id}')">Войти</button>`
          }
        </div>
      </div>
    `
    )
    .join('');
}

window.joinClass = async (classId) => {
  const codeInput = document.getElementById(`code-${classId}`);
  const code = codeInput ? codeInput.value : '';

  const { ok, data } = await api('/api/join-class', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId, code })
  });

  if (!ok) {
    msg.textContent = data.error || 'Не удалось войти в класс';
    return;
  }

  msg.textContent = '';
  await bootSocial();
};

window.selectClass = async (classId) => {
  const { ok, data } = await api('/api/select-class', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId })
  });

  if (!ok) {
    msg.textContent = data.error || 'Не удалось выбрать класс';
    return;
  }

  msg.textContent = '';
  await bootSocial();
};

async function loadMessages() {
  const { ok, data } = await api('/api/messages');
  if (!ok) return;

  chatList.innerHTML = data.length
    ? data
        .map(
          (item) => `
      <article class="chat-item">
        <div class="chat-meta">${item.author.name} (@${item.author.username}) · ${new Date(item.createdAt).toLocaleString()}</div>
        <div>${item.text}</div>
        <div class="chat-actions">
          <button class="like-btn ${item.likedByMe ? 'liked' : ''}" onclick="toggleMessageLike('${item.id}')">❤️ ${item.likes}</button>
        </div>
      </article>
    `
        )
        .join('')
    : '<p class="message">Пока сообщений нет. Напиши первым!</p>';
}

window.toggleMessageLike = async (id) => {
  await api(`/api/messages/${id}/like`, { method: 'POST' });
  await loadMessages();
};

async function loadClassmates() {
  const { ok, data } = await api('/api/classmates');
  if (!ok) return;

  classmatesRoot.innerHTML = data
    .map(
      (u) => `
      <div class="classmate">
        <div>
          <b>${u.name}</b> (@${u.username})<br/>
          Лайков: ${u.likes}
        </div>
        <button class="like-btn ${u.likedByMe ? 'liked' : ''}" onclick="toggleUserLike('${u.id}')">${u.likedByMe ? '💔 Убрать' : '❤️ Лайк'}</button>
      </div>
    `
    )
    .join('');
}

window.toggleUserLike = async (id) => {
  const { ok, data } = await api(`/api/users/${id}/like`, { method: 'POST' });
  if (!ok) {
    msg.textContent = data.error || 'Ошибка лайка';
    return;
  }

  await Promise.all([loadClassmates(), loadProfile()]);
};

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = String(new FormData(messageForm).get('text') || '').trim();
  if (!text) return;

  const { ok, data } = await api('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!ok) {
    msg.textContent = data.error || 'Не удалось отправить сообщение';
    return;
  }

  messageForm.reset();
  await Promise.all([loadMessages(), loadProfile()]);
});

switchClassBtn.addEventListener('click', async () => {
  socialArea.classList.add('hidden');
  classSelector.classList.remove('hidden');
  await loadClassesForSelection();
});

async function bootSocial() {
  const me = await loadProfile();
  if (!me) return;

  authCard.classList.add('hidden');

  if (!me.hasJoinedClass || !me.activeClass) {
    classSelector.classList.remove('hidden');
    socialArea.classList.add('hidden');
    await loadClassesForSelection();
    return;
  }

  classSelector.classList.add('hidden');
  socialArea.classList.remove('hidden');
  activeClassTitle.textContent = me.activeClass.name;
  activeClassHint.textContent = `Чат класса ${me.activeClass.name}`;

  await Promise.all([loadMessages(), loadClassmates()]);
}

if (token()) {
  bootSocial();
}
