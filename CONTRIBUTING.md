# Как помочь «Листам для дома»

Спасибо, что хотите помочь. Проект делают добровольцы, и любой вклад важен: понятнее написанный пункт листа, сверенная цитата, замечание медика, исправленная печать

Вклад можно делать под псевдонимом

[English below](#english)

## Сначала о приватности

Всё, что вы пишете в issues, pull request и обсуждениях, видят все. Поэтому:

- не пишите ФИО, диагнозы, адреса, телефоны и номера документов, даже свои
- не прикладывайте заполненные листы, их фото и сканы, выписки, заключения врачебной комиссии и рецепты. Даже с закрашенными данными
- не пересказывайте историю так, что человека можно узнать: город, больница, даты и диагноз вместе уже выдают его
- не присылайте QR с листа для скорой: внутри него те же личные данные
- если в сообщение случайно попали личные данные, отредактируйте его или напишите мейнтейнерам через кнопку «Report content», мы скроем

Нужен пример, чтобы показать ошибку? Откройте лист с `?demo=1` в адресе: там выдуманные значения, и ничего не сохраняется

## Чего здесь не будет

Листы заполняет одна семья на своём устройстве. Мы не принимаем:

- хранение заполненных листов на сервере, учётные записи, синхронизацию через облако
- списки подопечных, карточки семей, учёт для организаций, интеграции с CRM и мессенджерами
- дозы, медицинские пороги, названия препаратов и советы по лечению на листах
- имитации отказа от реанимации и других медицинских решений
- оценку, «положено» ли что-то конкретному человеку

Всё, что вводит семья, остаётся в её браузере. Если вам нужен учёт для организации, это другой инструмент, и делать его в этом репо мы не будем

## Кому что можно сделать

- **Медику в РФ.** Прочитать листы и сказать, где пункт неточный, опасный или непонятный. Особенно «Карта на ночь» (что сказать диспетчеру) и «Лист для скорой». Issue «Ошибка в листе» или pull request с меткой `review:medical`
- **Юристу в РФ.** Проверить «Что подписать, пока человек может» и пересказы норм на листах «До того, как забрать домой» и «Что даёт заключение». Pull request с меткой `review:legal`. Цитаты норм живут в репо pal-norms, правка цитаты делается там
- **Сотруднику хосписа или НКО.** Сказать, совпадает ли чек-лист выписки с тем, как это бывает на самом деле, и чего на листах не хватает
- **Разработчику.** Печать в разных браузерах, доступность, работа без интернета, тесты. Задачи с меткой `good first issue`
- **Всем.** Заполнить и распечатать лист вместе с человеком старше 60 и написать, где он остановился или не понял. Это самый ценный вклад

## Как поправить текст листа

Тексты листов лежат данными в `data/sheets/`, по файлу на лист: `night.yaml`, `emergency.yaml`, `discharge.yaml`, `conclusion.yaml`, `ahead.yaml`. Правка идёт только через pull request, который смотрит человек

1. Найдите пункт по тексту, например поиском по `data/sheets/discharge.yaml`
2. Поправьте `text` или `detail`. Если пункт пересказывает норму, у него есть `norm_ids` и `quote_refs`. Пересказ должен совпадать с цитатой без толкования. Нет цитаты в pal-norms, значит пункт остаётся `verified: false` и на лист не печатается
3. Новый пункт сразу получает `verified: false`, пока его не сверили с источником, и `review` с тем, кто должен его посмотреть: `legal`, `medical` или `both`
4. Прогоните проверки:

   ```sh
   uv run pytest -q
   uv run python -m opsite build
   uv run python -m opsite check
   ```

   Линтер текста поймает длинные тире, восклицательные знаки, капс, дозы и названия препаратов
5. Откройте лист локально (`sh scripts/serve-one`) и посмотрите печать: `Ctrl+P` или кнопка на шаге 3

## Как устроен проект

Шесть репо, каждый собирается в статический сайт для GitHub Pages:

| Репо | Что внутри |
|---|---|
| openpalliative.github.io | хаб: «Что случилось?», ситуации, «Сейчас», о проекте. Здесь же общий UI и сборщик `opsite/` |
| pal-norms | нормы, дословные цитаты, сроки ответа, календарь |
| pal-devices-data | кто выдаёт изделия и по какому документу |
| pal-directory | номера и адресаты по регионам |
| obrashchenie-kit | заявления и жалобы со сроками |
| home-care-kit | листы для дома и для скорой, этот репо |

Этот репо берёт нормы, цитаты, показания и календарь из pal-norms, номера регионов из pal-directory. Снимки лежат в `vendor/` и обновляются только через `sync-data`, руками их не правят

Внутри репо работа делится на зоны, чтобы правки не сталкивались:

- **данные:** `data/`, `pipeline/`, `raw/` и тесты данных
- **страницы:** `templates/`, `assets/`, `content/`, `lib/`, `site_hooks.py`, e2e и скриншоты
- **инфраструктура:** `.github/`, `README.md`, `docs/`, `scripts/`, лицензии и эти файлы
- **общий UI:** папка `opsite/`. Её правят только в хабе

### Папка opsite/

`opsite/` здесь это копия из хаба. Не меняйте её и не присылайте pull request с изменениями в `opsite/`, такие правки потеряются при следующей синхронизации. Нужна правка общего UI, присылайте её в хаб openpalliative.github.io. После слияния там:

```sh
sh scripts/sync-ui   # забирает копию из ../openpalliative.github.io
```

### Ворота

Перед pull request прогоните:

```sh
sh scripts/gate.sh
```

Это `uv sync`, `pnpm install`, actionlint по workflows, pytest, проверка устаревших снимков, сборка как на GitHub Pages, `opsite check` (текст, ссылки, сеть, бюджеты), проверка, что закрытые показания не попали на страницу, unit-тесты, e2e в headless-браузере, скриншоты и ещё раз e2e на выдуманных данных из `tests/fixtures/`. Pull request с красными воротами не сливаем

## Правила для данных и текста

- У каждой нормы есть источник: официальная публикация на publication.pravo.gov.ru. Цитата только дословно, с `eoNumber` и ссылкой, и только в pal-norms
- Номера регионов только из открытых данных Росздравнадзора через pal-directory. На лист сам по себе попадает только номер, который проверен звонком
- То, что не сверено с источником, помечаем `verified: false`, и это видно на странице. Номера, коды, сроки и пункты не придумываем и не подставляем «по памяти»
- Юридические и медицинские тексты идут с плашкой «черновик, нужна проверка юристом (или медиком) в РФ»
- Без длинных тире (пишем `-`), эмодзи, восклицательных знаков и капса
- Без медицинских порогов, доз, названий препаратов и советов по лечению
- Пишем просто и по-человечески, для человека в стрессе и для пожилого: «вы», короткие фразы, следующий шаг
- Данные по территориям, которые линтер помечает правилом `territory`, не добавляем

`opsite check` и `uv run python -m opsite lint` ловят большую часть этого автоматически

## Как прислать правку

1. Форкните репо и сделайте ветку
2. Внесите правку в своей зоне и прогоните ворота
3. Откройте pull request и заполните чек-лист в шаблоне: источник, `verified`, плашка черновика, нет личных данных
4. Правки текстов листов смотрит человек с меткой `review:medical` или `review:legal`, снимки соседей и номера `review:data`

## Лицензия вклада

Отправляя pull request, вы соглашаетесь, что код распространяется по [MIT](LICENSE), а тексты листов и данные на условиях [LICENSE-DATA](LICENSE-DATA)

Поведение в проекте: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Уязвимости: [SECURITY.md](SECURITY.md)

---

## English

home-care-kit makes printable sheets for families in Russia caring for a seriously ill person at home: a fridge card for nights and holidays, an ambulance sheet with a QR code, a hospital discharge checklist, what a palliative care conclusion gives, and what to sign while the person still can. The interface is in Russian, but you can help without knowing it

- **Privacy first.** Issues and pull requests are public. Never post names, diagnoses, addresses, phone numbers, document numbers, filled-in sheets, QR codes from them, or scans (not even redacted). Use `?demo=1` for made-up examples
- **Single family, single device.** We do not accept server storage, accounts, sync, lists of patients or CRM integrations. No doses, drug names, medical thresholds or treatment advice on the sheets
- **Sheet texts** live in `data/sheets/*.yaml` as data. Anything that retells a norm needs a verbatim quote in pal-norms, otherwise it stays `verified: false` and is not printed. Medics and lawyers in Russia: see the labels `review:medical` and `review:legal`
- **Zones.** `opsite/` (shared UI and site builder) is edited only in the hub repo `openpalliative.github.io`, then copied with `scripts/sync-ui`. Snapshots in `vendor/` come from pal-norms and pal-directory and are never edited by hand
- **Gate.** Run `sh scripts/gate.sh` before opening a pull request

Code is MIT, sheet texts and data follow `LICENSE-DATA`. Pseudonymous contributions are welcome
