const loginForm = document.getElementById('adminLoginForm');
const loginMsg = document.getElementById('loginMsg');
const panel = document.getElementById('panel');
const loginCard = document.getElementById('loginCard');
const usersRoot = document.getElementById('users');
const classesRoot = document.getElementById('classes');
const classForm = document.getElementById('classForm');

let adminPassword = localStorage.getItem('adminPassword') || '';

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-admin-password': adminPassword
  };
}

async function login(password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });

  if (!res.ok) {
    loginMsg.textContent = 'Неверный пароль';
    return false;
  }

  adminPassword = password;
  localStorage.setItem('adminPassword', password);
  loginCard.classList.add('hidden');
  panel.classList.remove('hidden');
  await Promise.all([loadUsers(), loadClasses()]);
  return true;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(loginForm);
  await login(formData.get('password'));
});

async function loadUsers() {
  const res = await fetch('/api/admin/users', { headers: headers() });
  if (!res.ok) return;
  const users = await res.json();

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
  await fetch(`/api/admin/users/${id}/status`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ role })
  });
  await loadUsers();
};

window.removeUser = async (id) => {
  await fetch(`/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: headers()
  });
  await loadUsers();
};

async function loadClasses() {
  const res = await fetch('/api/admin/classes', { headers: headers() });
  if (!res.ok) return;
  const classes = await res.json();

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
}

window.toggleClass = async (id, enabled) => {
  await fetch(`/api/admin/classes/${id}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ enabled })
  });
  await loadClasses();
};

classForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(classForm);
  const payload = Object.fromEntries(formData.entries());

  await fetch('/api/admin/classes', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  });

  classForm.reset();
  await loadClasses();
});

if (adminPassword) {
  login(adminPassword);
}
