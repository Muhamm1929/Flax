const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const msg = document.getElementById('authMessage');
const authCard = document.getElementById('authCard');
const profileCard = document.getElementById('profileCard');
const profile = document.getElementById('profile');
const showLogin = document.getElementById('showLogin');
const showRegister = document.getElementById('showRegister');

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

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(registerForm);
  const payload = Object.fromEntries(formData.entries());

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
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

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
  await loadProfile();
});

async function loadProfile() {
  const token = localStorage.getItem('token');
  if (!token) return;

  const res = await fetch('/api/me', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) return;

  const data = await res.json();
  authCard.classList.add('hidden');
  profileCard.classList.remove('hidden');

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
}

loadProfile();
