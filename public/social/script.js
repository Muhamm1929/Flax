const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const msg = document.getElementById('authMessage');
const authCard = document.getElementById('authCard');
const socialArea = document.getElementById('socialArea');
const profile = document.getElementById('profile');
const showLogin = document.getElementById('showLogin');
const showRegister = document.getElementById('showRegister');
const chatList = document.getElementById('chatList');
const messageForm = document.getElementById('messageForm');
const classmatesRoot = document.getElementById('classmates');

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

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token()}`
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
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
    ? `Успешно! Ваш ID: ${data.userId}. Теперь войдите.`
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
  const { ok, data } = await api('/api/me');
  if (!ok) return false;

  profile.innerHTML = `
    <p><b>Имя:</b> ${data.name}</p>
    <p><b>Username:</b> @${data.username}</p>
    <p><b>ID:</b> ${data.id}</p>
    <p><b>Статус:</b> <span class="badge ${data.role.design}">${data.role.label}</span></p>
    <p><b>Лайки:</b> ${data.likes}</p>
    <p><b>Друзья:</b> ${data.friends}</p>
    <p><b>Сообщения:</b> ${data.messages}</p>
    <button id="logoutBtn">Выйти</button>
  `;

  document.getElementById('logoutBtn').onclick = () => {
    localStorage.removeItem('token');
    location.reload();
  };
  return true;
}

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
        <button class="like-btn ${u.likedByMe ? 'liked' : ''}" onclick="toggleUserLike('${u.id}')">${u.likedByMe ? 'Убрать лайк' : 'Лайкнуть'}</button>
      </div>
    `
    )
    .join('');
};

window.toggleUserLike = async (id) => {
  const { ok, data } = await api(`/api/users/${id}/like`, { method: 'POST' });
  if (!ok && data.error) {
    msg.textContent = data.error;
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

async function bootSocial() {
  const ok = await loadProfile();
  if (!ok) return;
  authCard.classList.add('hidden');
  socialArea.classList.remove('hidden');
  await Promise.all([loadMessages(), loadClassmates()]);
}

if (token()) {
  bootSocial();
}
