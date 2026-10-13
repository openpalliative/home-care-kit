# home-care-kit: как выпустить

Раздел для общего `RELEASE.md`. home-care-kit потребитель: нормы, цитаты, показания и календарь берёт у pal-norms, номера регионов у pal-directory. Поэтому его пушат **после** того, как живы сайты этих двух репо, вместе с obrashchenie-kit и раньше хаба

## 1. До первого пуша

1. Дождаться зелёного `pages` у pal-norms и pal-directory и проверить, что открываются:
   - https://openpalliative.github.io/pal-norms/data/v1/index.json
   - https://openpalliative.github.io/pal-directory/data/v1/index.json

   Без них `sync-data` с `--from pages` падает. Сама сборка home-care-kit от этого не зависит: снимки соседей лежат в `vendor/` и приходят с первым коммитом

2. Включить Pages из Actions, иначе `deploy-pages` в первом `pages.yml` упадёт:

   ```sh
   gh api -X POST repos/openpalliative/home-care-kit/pages -f build_type=workflow
   ```

   Если Pages уже включены из ветки: `gh api -X PUT repos/openpalliative/home-care-kit/pages -f build_type=workflow`

3. Разрешить Actions создавать pull request. Без этого `sync-data` не сможет прислать новые снимки (`create-pull-request` падает с ошибкой прав). В org и в репо: Settings > Actions > General > Workflow permissions > «Allow GitHub Actions to create and approve pull requests». Права по умолчанию оставить «Read repository contents»: каждому workflow нужные права выданы в самом файле

   ```sh
   gh api -X PUT orgs/openpalliative/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
   gh api -X PUT repos/openpalliative/home-care-kit/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
   ```

4. Метки. `sync-data` ставит `review:data` или `review:legal`, `pipeline.audit` ставит `audit`, формы issue ставят `review:medical`, `review:legal`, `review:data` и `report:number`. Все метки из `scripts/labels.tsv` хаба ставит `scripts/labels` хаба. Если его ещё не запускали, хотя бы эти:

   ```sh
   gh label create review:data --color FBCA04 --description "Данные изменились, нужна сверка человеком перед слиянием" --repo openpalliative/home-care-kit --force
   gh label create review:legal --color B60205 --description "Нужна проверка юристом" --repo openpalliative/home-care-kit --force
   gh label create review:medical --color D93F0B --description "Нужна проверка медиком" --repo openpalliative/home-care-kit --force
   gh label create report:number --color E99695 --description "Сообщение о неверном номере телефона" --repo openpalliative/home-care-kit --force
   gh label create audit --color 5319E7 --description "Находка аудита или плановая сверка" --repo openpalliative/home-care-kit --force
   ```

5. Security: включить private vulnerability reporting (на него ссылаются `SECURITY.md`, `CODE_OF_CONDUCT.md` и `config.yml` форм issue), secret scanning, push protection, Dependabot alerts:

   ```sh
   gh api -X PUT repos/openpalliative/home-care-kit/private-vulnerability-reporting
   ```

## 2. Пуш и первая проверка

1. Запушить `main`. Сработают `checks.yml` (actionlint и ворота целиком) и `pages.yml`
2. Дождаться зелёного `pages` и проверить живой сайт:
   - https://openpalliative.github.io/home-care-kit/ открывается, в подвале версия и дата данных
   - https://openpalliative.github.io/home-care-kit/data/v1/index.json отдаёт 5 наборов
   - https://openpalliative.github.io/home-care-kit/conclusion/ при `indications_public: false` в `content/gates.yaml` **не показывает текст показаний** и не предлагает выбрать группу заболевания. Вместо них строка со ссылкой на официальную публикацию. Если показания видны, сайт собран без `OP_TARGET=pages`: откатить и разобраться (`pages.yml` и `scripts/indications_gate.py` должны это ловить)
   - `night/` и `emergency/` работают офлайн после первого визита, лист для скорой печатается на одну страницу A4 и карточкой, QR читается камерой телефона
   - несуществующий адрес внутри `/home-care-kit/` отдаёт свою 404
   - в инструментах разработчика на вкладке «Сеть» нет запросов за пределы openpalliative.github.io
3. **Первый `sync-data` вручную**, сразу после пуша:

   ```sh
   gh workflow run sync-data.yml --repo openpalliative/home-care-kit
   ```

   Если снимки в `vendor/` уже совпадают с сайтами соседей, pull request не появится, это нормально. Если появился pull request `sync/<дата>`, на нём должен сам запуститься `checks` (его запускает `sync-data` через `gh workflow run`). Если не запустился, запустить руками и записать в общий отчёт:

   ```sh
   gh workflow run checks.yml --repo openpalliative/home-care-kit --ref sync/<дата>
   ```

4. Через 60 дней посмотреть на вкладку Actions: `sync-data` должен быть включён. Последний шаг workflow включает его заново (`PUT .../actions/workflows/sync-data.yml/enable`), но GitHub может считать иначе. Если выключен, включить руками и записать в отчёт

## 3. Защита main

Ruleset на `main`: изменения только через pull request, обязательные проверки `gate` и `actionlint` из `checks.yml`, без обязательного ревью CODEOWNERS, пока мейнтейнер один. Бот `sync-data` в `main` не пишет, только открывает pull request, поэтому обход для Actions не нужен

Когда появится медик в РФ, добавить его аккаунт в `.github/CODEOWNERS` к `/data/sheets/` и включить обязательное ревью владельцев кода для этого пути

## 4. Релиз

Тег `v<версия данных>`, например `v2026.10.11`, раз в год после декабрьской сверки листов или после ревью медиком и юристом:

```sh
git tag v2026.10.11 && git push origin v2026.10.11
```

`release.yml` собирает сайт так же, как Pages (`OP_TARGET=pages`, показания закрыты, сторож `scripts/indications_gate.py`), и кладёт в релиз:

- `home-care-kit-<тег>-site.zip`: весь сайт для своего хостинга
- `home-care-kit-<тег>-data.zip`: `data/v1/*.json` со схемами
- `SHA256SUMS`

Проверить скачанное: `sha256sum -c SHA256SUMS`

## 5. Оформление репо

```sh
gh repo edit openpalliative/home-care-kit \
  --description "Листы для дома: карта на ночь, лист для скорой с QR, чек-лист выписки. Заполнить в браузере и распечатать" \
  --homepage https://openpalliative.github.io/home-care-kit/ \
  --add-topic palliative-care --add-topic home-care --add-topic printable --add-topic russia --add-topic offline-first
```

Social preview вручную: Settings > General > Social preview, файл `docs/social-preview.png` (1280 x 640)

## 6. Решить Кириллу до публикации

- **Показания на `conclusion/`.** По умолчанию закрыты (`content/gates.yaml`, `indications_public: false`): цитаты прил. 1 сверены со сканом, но в них есть медицинские пороги, а толкование не проверено медиком и юристом в РФ. Открывать только после такой проверки, одной строкой `indications_public: true` в pull request с меткой `review:medical`. Выбор групп заболеваний сейчас четыре плюс «Другое или не знаю», расширять до всех групп прил. 1 тоже по решению
- **QR на листе для скорой.** По умолчанию включён, отключается одной галочкой на шаге 3. Внутри кода только текст с листа. Убрать совсем или оставить, решается после проверки камерами телефонов у мейнтейнера в РФ
- **Номера регионов** home-care-kit сам не публикует: берёт из pal-directory и печатает только проверенные звонком. Отдельного решения здесь не нужно, решение о реальных номерах принимается в pal-directory (`PD_DATA_MODE`)

## 7. Проверено локально

11.10.2026:

- actionlint 1.7.12 с shellcheck 0.10.0 (`sh scripts/actionlint`, версии и sha256 в `scripts/tools/install`) по 4 workflow: 0 замечаний
- пины действий сверены `git ls-remote` с тегами: checkout v7.0.1, setup-uv v10.3.0, pnpm/action-setup v6.1.0, setup-node v7.1.0, upload-artifact v7.0.2, upload-pages-artifact v5.0.0, deploy-pages v5.0.1, create-pull-request v8.1.1. Все совпали, все последние на эту дату
- `release.yml` и `pages.yml` собирают одинаково: `_site/conclusion/index.html` совпадает файл в файл, показаний в нём нет
