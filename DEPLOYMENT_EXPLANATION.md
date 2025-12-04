# Объяснение изменения в Login.tsx

## Что изменилось?

### ❌ БЫЛО (не работает на сервере):
```typescript
const response = await fetch('http://localhost:3003/api/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
});
```

### ✅ СТАЛО (работает везде):
```typescript
const response = await fetch('/api/login', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
});
```

## В чём разница?

### Абсолютный URL (БЫЛО):
- `'http://localhost:3003/api/login'` - это **абсолютный URL**
- Он жёстко указывает протокол (http), хост (localhost) и порт (3003)
- Браузер **всегда** будет обращаться именно на `localhost:3003`
- ❌ Не работает, когда сайт открыт с другого адреса (например, с IP сервера)

### Относительный путь (СТАЛО):
- `'/api/login'` - это **относительный путь**
- Он НЕ указывает протокол, хост или порт
- Браузер **автоматически** подставляет текущий адрес сайта
- ✅ Работает везде, откуда бы ни был открыт сайт

## Как это работает?

Браузер автоматически добавляет текущий домен к относительному пути:

### Сценарий 1: Development (локальный компьютер)
```
Сайт открыт на:     http://localhost:3004
Запрос к:           /api/login
Браузер отправит:   http://localhost:3004/api/login
Vite proxy перенаправит → http://localhost:3003/api/login (backend)
✅ Работает!
```

### Сценарий 2: Production с доменом
```
Сайт открыт на:     https://nedra-expert.com
Запрос к:           /api/login
Браузер отправит:   https://nedra-expert.com/api/login
Nginx перенаправит → http://localhost:3003/api/login (backend)
✅ Работает!
```

### Сценарий 3: Production с IP-адресом
```
Сайт открыт на:     http://192.168.1.100
Запрос к:           /api/login
Браузер отправит:   http://192.168.1.100/api/login
Nginx перенаправит → http://localhost:3003/api/login (backend)
✅ Работает!
```

### Сценарий 4: СТАРЫЙ КОД на сервере (НЕ работал)
```
Сайт открыт на:     http://192.168.1.100
Запрос к:           http://localhost:3003/api/login (абсолютный URL!)
Браузер отправит:   http://localhost:3003/api/login
❌ Ошибка! Браузер пытается подключиться к localhost на компьютере пользователя,
   а не на сервере!
```

## Почему в разработке работало?

В разработке (`npm run dev`):
1. Frontend запущен на `http://localhost:3004`
2. Backend запущен на `http://localhost:3003`
3. Оба - на **одном компьютере** (localhost)
4. Поэтому `http://localhost:3003/api/login` работал

На сервере:
1. Frontend доступен с внешнего адреса (например, `http://server-ip`)
2. Backend работает на `localhost:3003` **внутри сервера**
3. Браузер пользователя пытается обратиться к `http://localhost:3003`
4. ❌ Но это localhost **компьютера пользователя**, а не сервера!

## Техническое решение

### Development (Vite Proxy)
Файл `vite.config.ts` настраивает proxy:
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3003',
      changeOrigin: true
    }
  }
}
```

Когда фронтенд делает запрос к `/api/login`:
1. Vite dev server получает запрос
2. Видит, что путь начинается с `/api`
3. Перенаправляет запрос на `http://localhost:3003/api/login`
4. Backend обрабатывает и отвечает

### Production (Nginx)
Конфигурация nginx перенаправляет запросы:
```nginx
location /api/ {
    proxy_pass http://localhost:3003;
}
```

Когда браузер делает запрос к `https://domain.com/api/login`:
1. Nginx получает запрос
2. Видит, что путь начинается с `/api/`
3. Перенаправляет на backend `http://localhost:3003/api/login`
4. Backend обрабатывает и отвечает

## Итого

**Никаких переменных не добавлялось!** Просто:

- **Было**: Жёсткая ссылка на `http://localhost:3003/api/login`
- **Стало**: Гибкий путь `/api/login`

Браузер сам подставляет нужный адрес в зависимости от того, откуда открыт сайт.
Это стандартная практика в веб-разработке для поддержки разных окружений.
