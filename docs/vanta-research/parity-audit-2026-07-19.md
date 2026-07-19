# Аудит паритета с Vanta — 19.07.2026 (apple-to-apple по разделам)

**Вопрос Рашада:** «пройдись по всем разделам Vanta и посмотри, сколько всего забыл и не сделал».
**Метод:** 19 разделов Vanta (по [vanta-walkthrough.md](vanta-walkthrough.md), снятому с инстанса factio-eu) сверены с реальным кодом (`apps/web/src/app/*`, `apps/api/src/*`, схема БД, seed) многоагентным разбором: 219 конкретных фич Vanta, каждая оценена по факту кода. 7 разделов прошли адверсариальную перепроверку второй волной агентов; для остальных 10 самых громких «missing» перепроверены вручную грепом — все подтвердились.

**Шкала:** `full` — сопоставимо с Vanta (UI+API+воркфлоу) · `partial` — ядро есть, заметная часть отсутствует · `stub` — экран/поле существует, сути фичи нет · `missing` — нет вообще.

---

## Итог одной строкой

**Из 219 фич Vanta: full 15 · partial 113 · stub 24 · missing 67.** Паритета нет ни в одном разделе. Главный системный перекос: **бэкенд закрывает большинство фич, а UI — read-only плоские списки**: у ~40 фич полноценный API вообще не имеет интерфейса. Второй системный провал — **фильтры/табы/очереди отсутствуют почти во всех списках** (у Vanta это лицо каждого раздела). Третий — **пустая поставка**: нет ни одной библиотеки «из коробки» (тесты, риски, политики, отчёты, фреймворки-каталог).

## Сводная таблица по разделам

| Раздел Vanta | Наш аналог | full | partial | stub | missing | Вердикт |
|---|---|---|---|---|---|---|
| Tests | секция в /controls/[id] | 1/15 | 9 | 2 | 3 | движок есть, витрины нет: нет экрана /tests |
| Frameworks | /frameworks | 0/10 | 3 | 2 | 5 | слабейший compliance-раздел: нет каталога, активации, метрик |
| Controls | /controls, /controls/[id] | 3/13 | 5 | 2 | 3 | карточка сильная, реестр беден, всё read-only |
| Policies | /policies | 0/9 | 6 | 0 | 3 | серверный workflow полный, в UI из него — ничего |
| Documents (evidence) | **веб-экрана нет** | 0/13 | 3 | 3 | 7 | целый раздел без UI — крупнейший провал |
| Audits + Auditor View | /engagements и др. | 2/10 | 6 | 0 | 2 | engagement-ядро наше сильное, Auditor View нет |
| Issues (findings) | таблица в /engagements/[id] | 1/13 | 9 | 0 | 3 | backend местами глубже Vanta, реестра-экрана нет |
| Reports | /dashboards, /reports | 0/9 | 7 | 0 | 2 | конструктор без UI, 0 преднастроенных отчётов |
| Customer trust | /trust-center и др. | 0/11 | 6 | 1 | 4 | публичной страницы нет (только JSON), Activity нет |
| Risk | /risks, /risk-heatmap | 0/11 | 6 | 1 | 4 | register базовый; library / action tracker / approval нет |
| Vendors | /vendors | 0/10 | 5 | 4 | 1 | lifecycle есть; discovery, intake-UI, аналитики нет |
| Privacy (ROPA+DPIA) | /privacy | 1/10 | 4 | 1 | 4 | модель богатая, UI-форма из 3 полей |
| Assets | /universe и др. | 1/12 | 6 | 1 | 4 | инвентарь активов без экрана; vuln не связан с активами |
| Personnel | /personnel, /devices, /iam | 0/11 | 6 | 1 | 4 | People/Computers ядро есть; security-задач сотрудника нет |
| Integrations | /connectors | 2/14 | 7 | 4 | 1 | framework есть, провайдер один (LDAP), UI пассивный |
| My work | **нет как класса** | 0/11 | 5 | 0 | 6 | ни одного персонального представления |
| Roadmap | виджет на /account | 2/10 | 1 | 0 | 7 | 6 плоских пунктов вместо guided-плана с фазами/датами |
| Settings | /config и др. | 1/16 | 11 | 1 | 3 | движки (RBAC/SSO/MFA) есть, экранов настроек нет |
| Сквозное (SLA, snapshots…) | jobs, snapshots | 1/11 | 8 | 1 | 1 | SLA-движок есть; настройки и видимости в UI нет |
| **Итого** | | **15/219** | **113** | **24** | **67** | |

---

## Три системных долга (важнее любого отдельного гэпа)

### 1. «API есть — UI нет» (~40 фич)
Полноценные серверные механизмы, которые пользователь не может увидеть или потрогать ни на одном экране:

- **Documents/evidence целиком**: загрузка, версии, sha256, renewBy, привязки к контролам/аудитам — веб ни разу не вызывает `/documents`.
- **Policy workflow**: статусная машина draft→in_review→approved→archived, approve/reject, версии, attestation-кампании с рассылкой и трекингом — в UI только плоский список политик.
- **Findings lifecycle**: 6 статусов + re-test, назначение owner с email, SLA — в UI нет ни карточки finding, ни кнопок статуса, ни фильтров.
- **RBAC-матрица**: resource×action×level, 7 ролей-пресетов, enforcement на всех контроллерах — экрана матрицы/ролей нет (роли видны только в селекторе field-permissions).
- **Deprovisioning tasks**: создание/закрытие с деактивацией аккаунта, SLA — в вебе не упоминаются вообще.
- **Глобальный поиск** (5 типов сущностей) — в UI нет строки поиска.
- **Аннотации working papers** (comment/tick_mark/exception + exception-report) — UI не отображает (рендерер — осознанный [!], но list-вью аннотаций можно без рендерера).
- **Реестр активов** (`GET /assets` с типами, owner, attrs) — ни одна страница не вызывает; /universe показывает только дерево узлов.
- **История прогонов теста, failing entities** — только API.
- **Test/vendor/risk управление**: деактивация теста, PATCH вендора, rescore/links риска, assessments recommendation, evidence request — только API.
- **Комментарии**: полиморфный API — в UI только чтение и только на карточке контрола.
- **Attestation/acceptance политик** — подтвердить из UI нельзя.
- **business_profile** — мёртвая jsonb-колонка: не редактируется и нигде не читается.

### 2. Фильтры, табы, очереди — отсутствуют системно
У Vanta каждый список имеет фильтры + быстрые табы + персональные очереди. У нас: **ни один список не фильтруется из UI** (controls, findings, policies, tests, vendors, personnel, privacy, документы отсутствуют как список). Нет ни одного «Owned by me» / «Needs my approval» — ни в UI, ни owner-параметров в list-эндпоинтах.

### 3. Пустая поставка (без библиотек «из коробки»)
- 0 преднастроенных отчётов-дашбордов (Program overview / Issues report / Vendors report / Customer trust report).
- Нет библиотеки готовых тестов (у Vanta сотни проверок под фреймворки; у нас 1 демо-автотест в seed).
- Нет Risk library (курируемый каталог сценариев с «Add to register»; `source_risk_id` — мёртвая колонка).
- Нет библиотеки шаблонов политик.
- Нет каталога фреймворков Active/Available с «Add framework» (фреймворки создаются только сидом), объём — демо (2–16 требований на фреймворк).
- Нет каталога интеграций (провайдер один — LDAP).

---

## Чего нет ВООБЩЕ (missing, 67) — по значимости

**Целые механики, отсутствующие как класс:**
1. **My work / персональные лендинги** — агрегат «назначено мне», employee-портал, «мои запросы» (GET /access-requests — только админский), роль-специфичные лендинги. Раздела нет как класса.
2. **Onboarding/offboarding security-задачи сотрудника** — сущности нет (только deprovisioning_task для IAM); нет Task status, напоминаний, digest, bulk reminder.
3. **Задачи ремедиации (Tasks)** — сущности «задача» нет нигде: ни таб Tasks у issues, ни Action tracker у рисков.
4. **Auditor View** — отдельного scoped-интерфейса внешнего аудитора нет; сущности «audit firm» нет; membership.category в логике доступа не участвует; evidence tracker (Not ready/Ready/Flagged/Accepted) и Auditor Assessment на response/document отсутствуют.
5. **Risk library + approval-workflow рисков** — библиотеки нет, approve нет (approver_membership_id мёртв), топ-категорий нет.
6. **Activity-лог Trust Center** — просмотры публичной страницы не записываются; и **сама публичная веб-страница** /trust/[slug] — только JSON-эндпоинт.
7. **Contracts** (Commitments → Contracts) — сущности «контракт» нет, синка обязательств нет.
8. **Vendor Discovery** — авто-обнаружение вендоров: нет даже capability в enum коннекторов.
9. **Связь vulnerability↔asset** — нет вовсе → нет «by asset / by vulnerability», scan coverage, Deactivated/History.
10. **Code changes из VCS** — авто-мониторинга merged PR нет (нет полей source/repository/merged_at, нет VCS-коннектора).
11. **Preset-отчёты** и **Customer trust report** (в каталоге метрик нет ни одной из домена trust).
12. **Framework-метрики**: Evidence completeness % не считается нигде; домены фреймворков; связь с аудит-окном (Audit ends); Update notes; версионный upgrade с tracked changes.
13. **Issue templates** — шаблонов findings нет.
14. **Roadmap как продукт**: фазы, даты, audit-ready date, on/off track, привязка к фреймворку, % от passing-тестов — есть только 6 плоских пунктов.
15. **Settings-экраны**: Notifications-расписание (anytime/рабочие часы+таймзона), Personnel reminders digest, Roles/матрица UI, User permissions (смена роли — нет и в API!), Information/бизнес-профиль, per-tenant SLA-настройка, idle session timeout, magic link (passwordless).
16. **Категории тестов** (HR/IT), блок «Tests need attention», «Needs document» плейсхолдеры, draft-документы, категории документов, уведомления owner'ам документов/тестов о провалах.
17. **KB↔Trust Center visibility** (Requestable) — связи нет, KB — это Q&A для опросников, не хранилище документов с expiration.
18. **Manage access на уровне контрола** (per-entity ACL) — только тенантная матрица.
19. **Approval-workflow DPIA** и импорт ROPA.
20. **Resolution windows на security alerts** (SLA на алерты не распространён).

**Отдельно — «канал есть, событий нет»:** in-app уведомления создаются только ручным POST — ни одно событие платформы (провал теста, просрочка SLA, назначение) их не генерирует; NotificationsService не инжектится ни в один модуль.

**Snapshots** — замораживают только агрегаты-счётчики, а не состав findings на дату: «как было на дату аудита» восстановить нельзя (суть B10 не достигнута).

---

## Что из «не сделано» — осознанные [!], а не забытое

Сверено с бэклогом: **EP-ANNOT** (in-app рендерер Office/PDF), **EP-OFFLINE**, **EP-HA**, **EP-ONPREM**, **EP-HARDEN-инфра** (WORM, syslog-форвардинг), **EP-MIGRATE** (реальные исторические файлы), **EP-AI** (включение LLM — residency/DPA клиента), **T-001-остаток** (регулятор, Excel-шаблоны, оплата), CI-биллинг GitHub. Эти позиции в списки выше не включены либо помечены.
Но: **RAG-подсказки ответов на опросники** можно сделать детерминированно (матчинг по KB) без LLM-хостинга — сейчас нет даже выбора kbEntryId в UI; ссылка на EP-AI [!] это не покрывает.

## Что подтвердилось как сильное (равно или глубже Vanta)

- Findings lifecycle на API (6 статусов + re-test) — глубже, чем Open/Closed у Vanta.
- Change management с approval-workflow — глубже пассивного PR-мониторинга Vanta (но нет самого PR-мониторинга).
- Per-tenant AI-конфиг (провайдер/модель/ключ, шифрование) — шире тумблера Vanta (нет только AI Memory).
- Тесты: сущность/статусная модель/прогоны/авто-цикл — полноценное ядро (T-B1 закрыт архитектурно).
- MFA/OIDC/SAML/LDAP, hash-chain audit log, field-level права, группа компаний, i18n ×3, risk-based planning + capacity — наши дифференциаторы, у Vanta аналогов нет.

---

## Рекомендуемая очередь доработок (по соотношению эффект/стоимость)

1. **UI-долг сплошняком** (дёшево — API готов): экран /documents + загрузка; реестр /findings с фильтрами и карточкой finding (кнопки статусов, комментарии, SLA-бейдж); policy-workflow кнопки + версии + attestation; /iam: депровижнинг-задачи + форма подачи запроса; поиск в топ-бар; экраны Roles/матрицы и User permissions (+PATCH роли участника в API); risk-карточка (rescore, links, treatment); vendor PATCH + intake + assessments UI; секция тестов: due/SLA/failing entities + история прогонов; экран реестра активов.
2. **Системные паттерны**: единый компонент фильтров/табов для всех списков; owner-параметр в list-эндпоинты + «Owned by me»/«Needs my approval»; событие→уведомление (инжект NotificationsService в findings/tests/policies/documents + расписание в настройках).
3. **Поставка из коробки (seed)**: преднастроенные дашборды (Program overview, Issues, Vendors, Customer trust), библиотека тестов под наши фреймворки, Risk library, шаблоны политик, каталог фреймворков с активацией «Add framework».
4. **Новые сущности**: personnel security tasks (on/offboarding чеклисты + digest); задача ремедиации (tasks) с привязкой к finding/risk; issue templates; audit firm + scoped Auditor View (навигация по membership.category); activity-лог Trust Center + публичная страница /trust/[slug]; contracts; связь vuln↔asset.
5. **Полновесные фичи**: evidence completeness % и полный снапшот состояния на дату; настоящий heat map impact×likelihood; per-tenant SLA-политики по severity; VCS-коннектор для code changes; расширение публичного API v1 (сейчас один эндпоинт).

> Примечание к методике: 12 из 19 разделов прошли без второй (адверсариальной) волны проверки — лимит сессии; их «missing»-топ перепроверен вручную и подтверждён. Полный машинный результат (219 фич с evidence-путями к файлам) — рядом: [parity-audit-2026-07-19-full.txt](parity-audit-2026-07-19-full.txt); при декомпозиции в задачи T-0XX сверяться с ним.
