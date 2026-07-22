# Roadmap до релиза — IT Audit Platform

> Честная карта «что ещё нужно до готового продукта». Составлено 18.07.2026 после марафонов backend + UI.
> Легенда трека: **A** — автономно (Claude может сам) · **C** — нужен ответ клиента · **I** — инфра/деплой · **F** — архитектурный форк (фаза-3) · **Q** — release-readiness (QA/безопасность/доки).

## 0. Где мы сейчас (честно)

- **Backend:** ~63 модуля, миграции до 0062, весь `docs/backlog.md` = `[x]`/`[!]`. Логика продуктовых эпиков реализована и проверена **e2e на демо-сиде** (build + миграция up→down→up + curl-прогон + RLS + RBAC). НЕ проверено на реальных данных/масштабе/проде.
- **UI:** ~22 экрана (15 новых T-U01…U15 + прежние), интерактивность на 4, 1 drill-down. i18n en/ru/az консистентен (345 ключей).
- **`[!]`-эпики = не реализованы** (заблокированы внешними решениями), а не «сделано».
- **Нет:** деплоя, нагрузочного/security/a11y-тестирования, UAT, полноты UI по всем доменам.

Вывод: **зрелый MVP+, не 100%-релиз.** Сквозной путь и логика — сильно; глубина UI, `[!]`-функционал, инфра, QA — ещё работа.

---

## Трек A — Автономно (Claude, без внешних решений)

### A1. UI-глубина (самое большое по объёму)
Экранов нет у ~половины backend-доменов. Приоритетно (read-list + create/action по established-паттернам T-U16…U19):
- [x] **Risks-регистр** — список/создание/rescore/привязка контролей + карточка и удаление закрыты T-V12.
- [x] **Privacy: ROPA + DPIA** — реестр, импорт, workflow и approval закрыты T-V41/T-V55.
- [x] **IAM:** accounts, access-requests approve/reject и deprovisioning закрыты T-V07.
- [x] **Assets / Processes / Universe-CRUD:** assets UI и проекция готовы; Universe create/move UI закрыт T-H129; edit/delete узла закрыты T-H130.
- [x] **Audit programs** + roll-forward, **code-changes** approval, **KB + questionnaires** reuse-flow реализованы и доступны в UI.
- [x] **Config:** custom-fields UI закрыт T-H125; config-lists UI (audit_opinion/risk/vendor categories) закрыт T-H126; tags-менеджер закрыт T-H127; glossary-CRUD закрыт T-H128.
- [x] **Reports:** CSV/XML экспорт, compare-UI снапшотов и CRUD-конфигуратор dashboards закрыты.
- [x] **API-keys**, **audit verify-chain**, **notifications**, **satisfaction surveys** — экраны и actions реализованы.
- [x] **Time/allocations/KPI:** тайм-трекинг, утилизация и KPI контролей реализованы.

### A2. UI-полировка (сквозное)
- [x] Интерактивность devices/working-papers/personnel/access-reviews закрыта: последний read-only экран devices получил create/checks UI в T-H133.
- [x] Drill-down карточки risk/engagement/finding/control/Working Paper/Personnel закрыты; последние WP и Personnel — T-H134/T-H135.
- [ ] Пустые состояния, лоадеры, обработка ошибок API (сейчас частично), тосты после действий.
- [x] Навигация: адаптивный app-shell, sidebar, mobile drawer и breadcrumbs закрыты T-H28/T-H32.
- [ ] **a11y-проход** (фокус, aria, контраст) и **responsive/планшеты** (GEN-10) по всем экранам — скилл ui-ux-pro-max.
- [x] Полнота i18n-строк на **прежних** экранах закрыта T-H137: `check-i18n` подтверждает parity en/ru/az (2607 ключей), статический TSX-аудит не нашёл потерянных видимых строк, hardcoded a11y-labels графиков/тегов/языка вынесены в локализованные labels.

### A3. Backend-полировка (buildable без внешних решений)
- [x] **SEC-07** детект конкурентных сессий закрыт: повторный вход в TTL фиксирует `concurrent_session`, покрыт integration-тестом.
- [x] **ENG-08** retention/archive engagement закрыт T-H25: archived-фильтр и lifecycle реализованы.
- [x] **RSK-08 trend-аналитика** закрыта T-A22/T-H13: `/trends`, snapshot-diff и `/reports/trend`.
- [x] Валидация custom-fields **на write доменных сущностей** — T-H124: strict после появления definitions; подключено к asset/engagement/risk/working_paper/vendor_intake.
- [ ] Расширение автотестов E2E (сейчас 20 API + 8 shared + 2 web — добавить покрытие критичных потоков).

---

## Трек C — Нужны ответы клиента (остаток T-001)
- [ ] **Регулятор / местный стандарт** (CBAR?) → сид фреймворка + локальные требования.
- [ ] **Excel-шаблоны** клиента (планы/тайм-листы/findings) → разблокирует **EP-MIGRATE** (импорт исторических данных, IMP-03).
- [ ] **Оплата/биллинг** — модель (perpetual vs subscription), потребление лицензии уже считается.
- [ ] **Решение по AI** (облачный провайдер vs локальная модель vs off на on-prem, ADR-0002/0004) → разблокирует **EP-AI** (генерация checklists/findings; субстрат — business_profile, KB, questionnaire — готов).

---

## Трек I — Инфраструктура / деплой
- [ ] **EP-ONPREM:** single-artifact сборка, offline-режим, pgBackRest/WAL-PITR, hardened базовые образы, интеграция с backup клиента.
- [ ] **EP-HA:** multi-node active-active, node-by-node upgrade, uptime ≥99.7% (INF-02/03/04).
- [ ] **EP-HARDEN (инфра-часть):** WORM через S3 Object Lock (LOG-03), syslog-экспорт с retention (LOG-06).
- [ ] Прод-деплой-пайплайн (сейчас есть compose для дева), секреты/ротация, мониторинг/алертинг.

---

## Трек F — Архитектурные форки (фаза-3, ADR-0017 осознанно приняты)
- [ ] **EP-OFFLINE** — офлайн working papers + синхронизация без потери целостности (WP-10).
- [ ] **EP-ANNOT** — аннотация Office/PDF (tick marks) внутри приложения (WP-06).
- [ ] **EP-LOWCODE** — no-code конструктор процессов (IMP-04).
- [x] **field-level права** (SEC-04) — гранулярность ниже ресурса закрыта T-H03…T-H08: миграция `field_permission`, ADR-0020, API `/field-permissions`, enforcement read/write на эталонах finding/personnel, UI `/field-permissions`, i18n и регресс-тесты.

---

## Трек Q — Release-readiness (не код-фичи, но обязательно до релиза)
- [ ] **Нагрузочное тестирование** (масштаб тенантов/данных, RLS под нагрузкой).
- [ ] **Security-аудит:** pentest, зависимости (SCA), секреты, OWASP-проход; ISO27001/SOC2-постур (SEC-12).
- [ ] **Доступность (a11y)** — WCAG AA по всем экранам.
- [ ] **UAT с клиентом** на реальных данных, обучение.
- [ ] **Документация (DOC-01..07):** админ/пользователь/API (OpenAPI уже есть), runbook, DR-план.
- [ ] **Резервное копирование/восстановление** — проверенная процедура (BCK), гранулярный restore (BCK-04).

---

## Предлагаемая последовательность до «релизуемого v1»

**Фаза 1 (автономно, сейчас) — UI-глубина ядра.** Экраны+интерактивность для рисков, privacy (ROPA/DPIA), IAM, audit programs, config, reports; нормальный лейаут/навигация; a11y+responsive-проход; i18n-полнота прежних экранов. → «продукт кликается целиком».

**Фаза 2 (нужны ответы клиента).** Регулятор→фреймворк; Excel-шаблоны→EP-MIGRATE; решение по AI→EP-AI (или явное «off на on-prem»); биллинг.

**Фаза 3 (инфра/деплой).** EP-ONPREM (single-artifact + backup) → пилот on-prem; мониторинг; security-hardening (WORM/syslog при необходимости).

**Фаза 4 (release-readiness).** Нагрузка + pentest + a11y + UAT + доки → **v1 к продажам**.

**Фаза 5 (после v1).** EP-HA, EP-OFFLINE, EP-ANNOT, EP-LOWCODE — по спросу.

---

## Что можно начать прямо сейчас (без тебя)
Весь **Трек A** — UI-глубина и полировка + Трек A3 backend-полировка. Это закрывает «продукт неполон по UI» и доводит до состояния «всё кликается и редактируется». Скажи «делай фазу 1» — пойду по A1→A2 экран за экраном с зелёными чекпоинтами.
