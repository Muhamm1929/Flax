const loginForm = document.getElementById('adminLoginForm');
const loginMsg = document.getElementById('loginMsg');
const panel = document.getElementById('panel');
const loginCard = document.getElementById('loginCard');
const usersRoot = document.getElementById('users');
const classesRoot = document.getElementById('classes');
const classForm = document.getElementById('classForm');
const globalMsg = document.getElementById('globalMsg');
const passwordForm = document.getElementById('passwordForm');
const logoutBtn = document.getElementById('logoutBtn');

let adminPassword = localStorage.getItem('adminPassword') || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-admin-password': adminPassword
  };
}

function setMessage(text, isError = false) {
  globalMsg.textContent = text;
  globalMsg.classList.toggle('error', isError);
}

async function request(url, options = {}, showError = true) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('adminPassword');
      adminPassword = '';
      loginCard.classList.remove('hidden');
      panel.classList.add('hidden');
    }

    if (showError) {
      setMessage(data.error || 'Ошибка запроса', true);
    }

    return { ok: false, data };
  }

  return { ok: true, data };
}

async function login(password) {
  const result = await request(
    '/api/admin/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    },
    false
  );

  if (!result.ok) {
    loginMsg.textContent = 'Неверный пароль';
    return false;
  }

  loginMsg.textContent = '';
  adminPassword = password;
  localStorage.setItem('adminPassword', password);
  loginCard.classList.add('hidden');
  panel.classList.remove('hidden');
  await Promise.all([loadUsers(), loadClasses()]);
  setMessage('Вы вошли в админ-панель.');
  return true;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);
  await login(String(formData.get('password')));
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('adminPassword');
  adminPassword = '';
  loginCard.classList.remove('hidden');
  panel.classList.add('hidden');
  setMessage('Вы вышли из админ-панели.');
});

async function loadUsers() {
  const result = await request('/api/admin/users', { headers: headers() });
  if (!result.ok) return;

  const users = result.data;
  usersRoot.innerHTML = users
    .map(
      (user) => `
      <div class="user">
        <div>
          <b>${user.name}</b> (@${user.username})<br/>
          ID: ${user.id} · role: ${user.role} · classes: ${user.classIds.join(', ')}
        </div>
        <div>
          <button onclick="setRole('${user.id}','USER')">USER</button>
          <button onclick="setRole('${user.id}','DEV')">DEV</button>
          <button onclick="removeUser('${user.id}')">Удалить</button>
        </div>
      </div>
    `
    )
    .join('');
}

window.setRole = async (id, role) => {
  const result = await request(`/api/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ role })
  });

  if (result.ok) {
    setMessage('Статус пользователя обновлён.');
    await loadUsers();
  }
};

window.removeUser = async (id) => {
  const result = await request(`/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: headers()
  });

  if (result.ok) {
    setMessage('Пользователь удалён.');
    await loadUsers();
  }
};

async function loadClasses() {
  const result = await request('/api/admin/classes', { headers: headers() });
  if (!result.ok) return;

  const classes = result.data;
  classesRoot.innerHTML = classes
    .map(
      (item) => `
      <div class="class-row">
        <div>
          <b>${item.name}</b> · code: ${item.code} · ${item.enabled ? 'enabled' : 'disabled'}
        </div>
        <div>
          <button onclick="toggleClass('${item.id}', ${!item.enabled})">${item.enabled ? 'Отключить' : 'Включить'}</button>
        </div>
      </div>
    `
    )
    .join('');
};

window.toggleClass = async (id, enabled) => {
  const result = await request(`/api/admin/classes/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ enabled })
  });

  if (result.ok) {
    setMessage('Состояние класса обновлено.');
    await loadClasses();
  }
};

classForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(classForm);
  const payload = Object.fromEntries(formData.entries());

  const result = await request('/api/admin/classes', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  });

  if (result.ok) {
    classForm.reset();
    setMessage('Класс создан.');
    await loadClasses();
  }
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get('currentPassword'));
  const newPassword = String(formData.get('newPassword'));

  const result = await request('/api/admin/change-password', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ currentPassword, newPassword })
  });

  if (result.ok) {
    adminPassword = newPassword;
    localStorage.setItem('adminPassword', newPassword);
    passwordForm.reset();
    setMessage('Пароль админ-панели успешно изменён.');
  }
});

if (adminPassword) {
  login(adminPassword);
}
