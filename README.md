# Class Social Network (Flax)

Мини-соцсеть для класса с отдельной панелью админа.

## Что реализовано

- Регистрация: `name`, `username`, `password`, `classCode`.
- Логин по `username` + `password`.
- При регистрации выдаётся случайный 7-значный ID.
- Профиль показывает: лайки, друзья, сообщения, статус.
- Статусы:
  - `USER` (обычный)
  - `DEV` (алмазный) — для заранее заданных username в коде
  - `First user` (gold + crown), `Second user` (silver), `Third user` (bronze)
- Классы с 5-значным паролем (code).
- Админ-панель с отдельным входом по 5-значному паролю.
- В админке: управление юзерами, статусами, удалением, созданием/отключением классов и сменой кодов.
- Подготовка под раздельные домены на Vercel через переменные окружения CORS.

## Быстрый старт

```bash
npm install
npm run dev
```

Откройте:

- Соцсеть: `http://localhost:3000/`
- Админка: `http://localhost:3000/admin`

## Переменные окружения

Создайте `.env` (опционально):

```env
PORT=3000
ADMIN_PASSWORD=12345
DEV_USERNAMES=teacher,frienddev
SOCIAL_ORIGIN=https://your-social-domain.vercel.app
ADMIN_ORIGIN=https://your-admin-domain.vercel.app
```

## Разделение доменов на Vercel

1. Разверните этот репозиторий как **два проекта Vercel**:
   - Project A (social domain)
   - Project B (admin domain)
2. В обоих проектах задайте одинаковые ENV для API.
3. Для CORS проставьте `SOCIAL_ORIGIN` и `ADMIN_ORIGIN`.
4. Назначьте разные кастомные домены на проекты.

> Если хотите полностью физически разделить фронты (два отдельных репозитория) — можно вынести `public/social` и `public/admin` в разные проекты, а API оставить отдельным backend-доменом.
