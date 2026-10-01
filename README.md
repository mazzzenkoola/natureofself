# Nature of Self — прототип выставки

Три файла: `index.html`, `style.css`, `script.js`. Открывается просто двойным кликом по `index.html`, интернет нужен только для загрузки библиотеки Three.js (одна строка в `index.html`).

## Выложить бесплатно, без GitHub
Netlify (app.netlify.com) или Cloudflare Pages (pages.cloudflare.com) — зарегистрироваться и перетащить эту папку целиком в окно загрузки. Через минуту появится рабочая ссылка.

## Выложить через GitHub Pages
1. Создать аккаунт на github.com и новый репозиторий (например `nature-of-self`).
2. Add file → Upload files → перетащить все три файла.
3. Settings → Pages → Source → ветка `main`, папка `/root` → Save.
4. Через пару минут сайт появится по адресу `твой-логин.github.io/nature-of-self`.

## Чтобы подставить свои работы
В `script.js` найти массив `const W = [...]` — там 7 строк вида `[x, y, z, ширина, высота, цвет]`. Замените placeholder-текстуру (функцию `tex()`) на загрузку своего изображения:

```js
const loader = new THREE.TextureLoader();
// вместо tex(c, i):
loader.load('works/01.jpg')
```

Фотографии работ сложите в папку `works/` рядом с `index.html`. Пропорции плоскости (`pw`, `ph` в массиве `W`) лучше сделать такими же, как у реальной работы, чтобы картинка не искажалась.
