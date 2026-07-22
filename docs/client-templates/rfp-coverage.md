# RFP Cyberross — полное соответствие по всем 178 требованиям

Источник: `inbox/2026-07-18/Cyberross_Audit_Platform_Requirements_EN.pdf`. Проверено программно: **178 уникальных требований** (142 M / 36 D), пропусков в нумерации нет. Оценка против: ADR-0001…0017, backlog.md (включая RFP-эпики), глоссария, чеклиста клиента.

## Шкала вердиктов
- ✅ **Закрыто** — архитектура/ядро (M0/M1) покрывает; дизайн ясен.
- 🟡 **В роадмапе** — покрывается запланированным эпиком, сущности заложены в ERD (T-003); реализация фаза 2.
- ⚠️ **Тяжёлый модуль** — в скоупе (ADR-0017), но фаза 3+, существенная разработка.
- 🏢 **Организационное** — не код: документация, процессы, критерии поставщика. Делается нами как компанией.
- ❌ **Не берём / риск** — сознательно не планируем или объективный риск заявки.

---

## 4.1 GEN — General Platform (8M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| GEN-01 единая центральная БД | M | ✅ | Монолит + один Postgres (ADR-0008), все модули в одной модели |
| GEN-02 web без установки | M | ✅ | Next.js/React, браузер |
| GEN-03 UI + email alerts/reminders | M | ✅ | Notifications/SLA (T-039/041/043) |
| GEN-04 сообщения из системы | M | 🟡 | EP-MSG |
| GEN-05 сквозной поиск best-match | M | 🟡 | EP-SEARCH (Postgres FTS + pg_trgm) |
| GEN-06 конфигурируемая терминология | M | 🟡 | EP-CONFIG; крючок в ERD — слой лейблов per-tenant поверх i18n (ADR-0009 упрощает: механизм переводов уже есть) |
| GEN-07 custom fields без кода | M | ✅ | EP-CONFIG + T-H124: jsonb + definitions + валидация на write доменных сущностей |
| GEN-08 аудиторы по стадиям с диффер. правами | M | ✅ | RBAC-матрица (ADR-0013) × стадии state machine (ADR-0005) |
| GEN-09 встроенная помощь/глоссарий | D | 🟡 | Контент-задача, поздняя фаза |
| GEN-10 планшеты/мобильные | D | 🟡 | Responsive web (без нативных приложений) |

## 4.2 UNI — Universe & Planning (8M / 0D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| UNI-01 universe неогранич. уровней | M | 🟡 | EP-UNIVERSE; дерево в ERD (T-003) |
| UNI-02 permanent info + папки + drag-drop | M | 🟡 | EP-UNIVERSE + Storage (T-042) |
| UNI-03 годовой план, несколько планов | M | 🟡 | EP-PLAN (Audit Plan в глоссарии) |
| UNI-04 risk-based план, веса/скоринг | M | 🟡 | EP-PLAN — наш дифференциатор, RFP прямо это требует |
| UNI-05 recurring + unplanned аудиты | M | 🟡 | Engagement + cron (T-040) |
| UNI-06 тип аудита | M | 🟡 | EP-AUDITTYPES; Audit Type в ERD |
| UNI-07 бюджет времени на аудит/аудитора | M | 🟡 | EP-TIME + EP-PLAN (capacity) |
| UNI-08 прогресс vs план live | M | 🟡 | Дашборды (T-044) + план |

## 4.3 RSK — Risk (6M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| RSK-01 point-in-time risk-события + доки | M | 🟡 | EP-RISK |
| RSK-02 конфигурируемая методология/веса | M | 🟡 | EP-RISK (модель скоринга с весами) |
| RSK-03 risk inventories, multi-rank | M | 🟡 | Risk register (глоссарий) |
| RSK-04 risk-опросники + approval workflow | M | 🟡 | EP-RISK + workflow-механизм ADR-0005 |
| RSK-05 risk matrix, gross/net, risk-class | M | ✅ | Модель inherent/residual уже в глоссарии/ADR-0012 |
| RSK-06 риск ↔ universe ↔ контроли (RCM) | M | ✅ | Ядро модели: Risk↔Process/Asset↔Control (T-003) |
| RSK-07 авто-реассессмент + heat maps | D | 🟡 | EP-RISK, фаза 2+ |
| RSK-08 causal/trend анализ | D | ⚠️ | EP-LOWCODE/аналитика, фаза 3 |

## 4.4 SCH — Scheduling (5M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| SCH-01 Gantt, drag-drop | M | ⚠️ | EP-SCHED, фаза 2/3 (готовые React-Gantt библиотеки снижают цену) |
| SCH-02 аллокация людей/команд | M | 🟡 | EP-SCHED |
| SCH-03 resource view утилизации | M | 🟡 | EP-SCHED + EP-TIME |
| SCH-04 conflict management | D | 🟡 | EP-SCHED, поздняя |
| SCH-05 профиль аудитора (skills/certs/CoI) + поиск | M | ✅ | Auditor profile в модели (M0), поиск тривиален |
| SCH-06 даты/фазы/пауза аудита | M | 🟡 | State machine + EP-SCHED |
| SCH-07 непродуктивное время | D | 🟡 | EP-TIME |

## 4.5 ENG — Engagement (7M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| ENG-01 запуск из плана + unplanned | M | ✅ | Engagement (M1) + связь с планом (фаза 2) |
| ENG-02 snapshot прогресса всех файлов + Excel | M | ✅ | Дашборд (T-044) + экспорт (T-045) |
| ENG-03 стадии + вехи + правила | M | ✅ | State machine (ADR-0005); milestones добавить в ERD |
| ENG-04 audit file = набор programs, задачи | M | 🟡 | EP-WPAPERS (Audit Program в ERD) |
| ENG-05 roll-forward год→год | M | 🟡 | EP-WPAPERS (копирование программы с очисткой результатов) |
| ENG-06 шаги из библиотеки контента | M | ✅ | Библиотека (ADR-0016, M1) |
| ENG-07 опросники из audit file | D | 🟡 | EP-MSG |
| ENG-08 закрытие/архив/restore/move по правам | M | 🟡 | Soft-delete (T-023) + RBAC; архив — фаза 2 |
| ENG-09 audit opinions из списков | D | 🟡 | EP-CONFIG (настраиваемые списки) |

## 4.6 WP — Working Papers (9M / 1D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| WP-01 rich-редактор прямого ввода + rich-text экспорт | M | 🟡 | EP-WPAPERS (Tiptap/ProseMirror — зрелые редакторы) |
| WP-02 полный состав WP (process/objectives/risks/controls/tests/…/review notes) | M | 🟡 | Модель покрывает все поля; WP-контейнер в ERD |
| WP-03 форматы Word/Excel/PPT/PDF/JPEG/TIF | M | ✅ | Storage (T-042), формат-агностик |
| WP-04 drag-drop evidence, папки | M | ✅ | Storage + папки |
| WP-05 cross-reference на документ/ячейки/секции | M | ⚠️ | Ссылки на документ — просто; на ячейки Office — тяжело (фаза 3, EP-ANNOT) |
| WP-06 аннотация Office/PDF, tick marks, без лицензий | M | ⚠️ | EP-ANNOT: PDF реально (pdf.js), Office — через конвертацию в PDF-препросмотр |
| WP-07 e-sign-off, preparer ≠ reviewer | M | ✅ | Approver workflow (ADR-0005) + audit trail (T-021) |
| WP-08 история + 'edited since review' | M | ✅ | Audit trail + версии (T-021) |
| WP-09 exception reporting по документации | D | 🟡 | EP-WPAPERS, поздняя |
| WP-10 офлайн-режим + синхронизация | M | ⚠️ | EP-OFFLINE (PWA + локальная БД + sync) — самый тяжёлый пункт RFP |

## 4.7 CTL — Controls & Continuous Monitoring (5M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| CTL-01 control universe, иерархия | M | ✅ | Control library (ADR-0016, M1) |
| CTL-02 risk-control matrix | M | ✅ | Risk↔Control в ядре модели |
| CTL-03 workflow confirmation + efficacy testing + resubmit | M | ✅ | Tests-слой (ADR-0010) + cron |
| CTL-04 KPI контролей real-time | D | 🟡 | EP-LOWCODE/метрики, фаза 3 |
| CTL-05 непрерывный авто-мониторинг | M | ✅ | Tests + Connectors (ADR-0010/0011) — наш Vanta-класс |
| CTL-06 авто-уведомления/эскалации | M | ✅ | Notifications + SLA (T-039/043) |
| CTL-07 связь с enterprise risk-доменами | D | 🟡 | Risk domains в модели |

## 4.8 ISS — Issues & Follow-up (4M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| ISS-01 issues ↔ audit steps, до закрытия | M | ✅ | Finding tracker — ядро M1 |
| ISS-02 многоуровневое approval закрытия | M | ✅ | Approver workflow (ADR-0005) |
| ISS-03 email follow-up владельцам + evidence | M | ✅ | T-039 + attachments |
| ISS-04 auditee-интерфейс + дашборды владельцев | M | ✅ | Respondent-портал (M1) + «My work» (parity) |
| ISS-05 портал авто-заполнения mgmt responses | D | ✅ | Тот же портал — response вносится респондентом |
| ISS-06 satisfaction surveys | D | 🟡 | EP-MSG |

## 4.9 REP — Reporting (7M / 1D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| REP-01 report wizard | M | 🟡 | EP-REPWIZ |
| REP-02 стандартные отчёты | M | 🟡 | EP-REPWIZ (набор из RFP: planning, tracking, issues, timesheets…) |
| REP-03 кастомизация отчёта + ad-hoc | M | 🟡 | EP-REPWIZ |
| REP-04 визуальные дашборды | M | ✅ | T-044 (M1) |
| REP-05 сравнимость по годам/кварталам | M | 🟡 | EP-REPWIZ + периоды в модели |
| REP-06 консолидация по entity/level/geography | M | ✅ | Групповая консолидация — наше ядро (ADR-0003, T-012) |
| REP-07 экспорт PDF/Excel/Word/CSV/XML | M | ✅ | T-045 (PDF/Word/Excel) + CSV/XML добавить — тривиально |
| REP-08 параметризуемые дашборды | D | 🟡 | EP-REP (виджеты) |

## 4.10 LIB (2M / 2D) · 4.11 TIME (3M / 1D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| LIB-01 индексируемая библиотека контента | M | ✅ | Библиотека (ADR-0016) + поиск |
| LIB-02 контент COBIT/COSO/IIA | D | 🟡 | Сидинг: 16 доменов + 31 контроль из чеклиста клиента, далее наращиваем |
| LIB-03 периодические обновления контента | D | 🟡 | Глобальная библиотека обновляется централизованно (ADR-0016) — механизм есть |
| LIB-04 permanent file из любого аудита | M | ✅ | Documents + universe permanent files |
| TIME-01 тайм-трекинг по аудиту/фазе/программе | M | 🟡 | EP-TIME (Time Entry в ERD) |
| TIME-02 команда + сертификаты | M | ✅ | Auditor profile (M0) |
| TIME-03 ставки/бюджет расходов | D | 🟡 | EP-TIME |
| TIME-04 KPI-дашборды | M | 🟡 | EP-TIME + T-044 |

## 5.1 TEC (6M / 2D) · 5.2 INT (4M / 2D) · 5.3 DAT (4M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| TEC-01 единые data terms для BI | M | ✅ | Одна модель, один Postgres |
| TEC-02 64-bit standard серверы | M | ✅ | Linux/контейнеры |
| TEC-03 конфиг в managed-контейнере + история версий | M | 🟡 | Версионирование настроек (audit trail на конфиг) |
| TEC-04 export/import конфигурации | D | 🟡 | EP-HARDEN |
| TEC-05 автоматизир. upgrade/rollback, release mgmt | M | ✅ | Контейнеры + миграции (ADR-0002) |
| TEC-06 общие auth/logging/monitoring во всех модулях | M | ✅ | Монолит — по построению |
| TEC-07 NTP | M | ✅ | Хост/контейнер |
| TEC-08 нет лимита concurrent users | D | ✅ | Софт-лимитов нет (лицензия — по дочкам/местам, не по сессиям) |
| INT-01 документированный API | M | 🟡 | REST API + OpenAPI (можно с фазы 1 — API-first) |
| INT-02 интеграция с инфраструктурой клиента | M | ✅ | Connectors (ADR-0011) |
| INT-03 SMTP over TLS | M | ✅ | ADR-0002 |
| INT-04 LDAP/Kerberos/AD + SSO | M | ✅ | ADR-0006 (SAML/LDAP/OIDC; Kerberos — проверить при внедрении) |
| INT-05 SOAP/WSDL/WS-Security | D | ❌ | Legacy; сознательно не берём — REST/OpenAPI. В ответе на RFP: «где используются веб-сервисы» — у нас REST |
| INT-06 интеграционные диаграммы | D | 🏢 | Документация |
| DAT-01 enterprise БД | M | ✅ | Postgres |
| DAT-02 документированная модель данных | M | ✅ | ERD (T-003) — станет документом DAT-02 |
| DAT-03 логика хранения + подход к консолидации | M | ✅ | RLS централизованная (ADR-0003) — прямой ответ |
| DAT-04 Office/PDF + full-text search | M | 🟡 | EP-SEARCH (извлечение текста + Postgres FTS) |
| DAT-05 snapshot/mirroring защита | D | 🏢 | Ops (Postgres реплики, S3 versioning) |
| DAT-06 оценка объёма данных на аудитора | D | 🏢 | Расчёт для sizing-дока |

## 5.4 MTE — Multi-Tenancy (6M) — наш самый сильный домен
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| MTE-01 native multi-tenancy, unlimited entities | M | ✅ | ADR-0003 — ядро продукта |
| MTE-02 мультитенантность на всех слоях | M | ✅ | RLS на уровне СУБД |
| MTE-03 RBAC per entity | M | ✅ | ADR-0013 + membership (ADR-0015) |
| MTE-04 отдельные data-контейнеры per entity | M | 🟡 | RLS = логическая изоляция; для строгих клиентов — опция schema-per-tenant/отдельная инсталляция (on-prem, ADR-0002) |
| MTE-05 отдельная отчётность/метрики/access-audit per entity | M | ✅ | Per-subsidiary дашборды + audit trail |
| MTE-06 единый консолидированный вид по правам | M | ✅ | Групповой уровень (T-012) — дифференциатор |

## 5.5 INF — Infrastructure (6M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| INF-01 VMware/KVM/Hyper-V/OpenStack | M | ✅ | Контейнеры поверх любой виртуализации |
| INF-02 multi-node HA, active-active | M | 🟡 | EP-HA: stateless app (масштабируется сразу) + Postgres streaming replication |
| INF-03 24/7, node-by-node upgrade | M | 🟡 | EP-HA + rolling deploy |
| INF-04 uptime ≥99.7% | M | 🟡 | 99.7% = ~26 ч/год — достижимо с EP-HA |
| INF-05 сегрегация сетей | D | 🏢 | Ops/deployment guide |
| INF-06 скорость соединения на юзера | D | 🏢 | Sizing-док |
| INF-07 hardening ОС/компонентов | M | 🏢 | Hardening guide +害 базовые образы |
| INF-08 recovery-документация | M | 🏢 | DOC-трек |

## 6.1 SEC-01..08 + 6.2 LOG (13M / 1D) + 6.3 SEC-09..16 (8M)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| SEC-01 парольная политика / AD-интеграция | M | ✅ | ADR-0006 + конфиг политики |
| SEC-02 предупреждение об истечении, self-service | M | ✅ | Просто поверх T-013 |
| SEC-03 уникальная идентификация, хэш паролей | M | ✅ | T-013 |
| SEC-04 права до экранов и **полей** | M | 🟡 | Матрица (ADR-0013) до действий; field-level — EP-HARDEN |
| SEC-05 server-side auth, SSO, LDAP | M | ✅ | ADR-0006 |
| SEC-06 только админ управляет юзерами | M | ✅ | RBAC |
| SEC-07 детект конкурентных сессий, lockout | M | 🟡 | EP-HARDEN (session-реестр) |
| SEC-08 inactivity timeout | M | ✅ | Session TTL |
| LOG-01 tamper-protected audit trail | M | 🟡 | T-021 append-only; tamper-evidence (hash chain) — EP-HARDEN |
| LOG-02 subject/time/result | M | ✅ | T-021 |
| LOG-03 admin-логи на WORM | M | 🟡 | S3 Object Lock (MinIO поддерживает WORM!) — реализуемо без экзотики |
| LOG-04 login/logout + IP | M | ✅ | Auth-журнал |
| LOG-05 записи о выдаче доступа | M | ✅ | Audit trail на memberships/roles |
| LOG-06 syslog-экспорт, retention | D | 🟡 | Лог-экспорт, фаза 2 |
| SEC-09 TLS 1.2+ и at-rest шифрование | M | ✅ | TLS + диск/БД шифрование |
| SEC-10 encrypted remote ops (SSH/RDP) | M | 🏢 | Ops-практика |
| SEC-11 layered protection | M | 🏢 | Deployment guide |
| SEC-12 ISO 27001 alignment; SOC 2 для hosted | M | 🏢 | Организационный постур — план на компанию, не на код |
| SEC-13 OWASP Top 10 validated + результаты | M | 🏢 | Внешний пентест перед поставкой |
| SEC-14 фильтрация трафика, сегментация, IDS | M | 🏢 | Ops |
| SEC-15 GDPR + DPA + data-residency | M | ✅ | Privacy-модуль (parity) + on-prem residency — наш плюс |
| SEC-16 incident response process | M | 🏢 | Процедуры компании |

## 7 BCK (5M / 2D)
| ID | Pri | Вердикт | Как отвечаем |
|----|-----|---------|--------------|
| BCK-01 восстановление без потери | M | ✅ | Postgres + WAL |
| BCK-02 full/incremental по расписанию | M | ✅ | pgBackRest/wal-g + конфиг |
| BCK-03 PITR до последней транзакции | M | ✅ | WAL-архивирование |
| BCK-04 восстановление одного аудита | M | 🟡 | Soft-delete (T-023) закрывает случайное удаление; гранулярный restore из бэкапа — EP-HARDEN |
| BCK-05 интеграция с центральным backup клиента | M | 🏢 | Стандартные дампы/агенты — deployment guide |
| BCK-06 операционное + архивное хранение | D | 🟡 | Архивирование engagement'ов (ENG-08) |
| BCK-07 обработка ошибок с алертами | D | ✅ | Валидация + UX ошибок |

## 8-11 DOC / UAT / IMP / SUP / VEN — организационный трек
| Блок | Вердикт | Комментарий |
|------|---------|-------------|
| DOC-01..07 (6M/1D) — архитектура, user manual, admin/install guides, API+модель данных, контроль версий доков, английский | 🏢 | Всё производимо нами (ERD→DAT-02/DOC-05; deployment guide и т.д.). Объём работы, не проблема архитектуры |
| UAT-01..06 (5M/1D) — тест-фазы, кейсы заранее, критерии дефектов | 🏢 | Наш verify/CI-процесс + формальные UAT-кейсы под внедрение |
| IMP-01,02,05..08 (5M/1D) — методология внедрения, конфигурация, обучение, babysitting | 🏢 | Услуги внедрения — планируем как сервисную часть |
| IMP-03 миграция ≥4 лет из Office | M 🟡 | EP-MIGRATE — продуктовый инструмент импорта (Excel наш формат — чеклист клиента уже маппится) |
| IMP-04 low-code конструктор | D ⚠️ | EP-LOWCODE, фаза 3+; частично закрывается EP-CONFIG (custom fields + настраиваемые списки) |
| SUP-01..07 (5M/2D) — SLA, 24/7 тикеты, эскалации, роадмап | 🏢❗ | Для соло — риск: 24/7 закрывается только партнёром/аутсорс-L1. Роадмап/релизы — есть |
| VEN-01..06 (4M/2D) — годы на рынке, внедрения за 3 года, ≥3 референса, региональное присутствие, команда с сертификатами | ❌❗ | Объективный риск заявки: соло-разработчик без референсов. Митигция: партнёрство (см. вывод) |

---

## Итоговый scorecard

**Mandatory (142):**
| Вердикт | Кол-во | Доля |
|---------|--------|------|
| ✅ Закрыто архитектурой/ядром | ~61 | 43% |
| 🟡 В роадмапе (эпик + ERD-крючок) | ~43 | 30% |
| ⚠️ Тяжёлые модули (в скоупе, фаза 3) | ~4 | 3% |
| 🏢 Организационные (не код) | ~30 | 21% |
| ❌ Риск заявки (VEN) | 4 | 3% |

**Продуктовые M-требования (без 🏢/❌): 108 из 142. Из них наш проект покрывает 100%:** 61 закрыто дизайном сейчас (56%), 43 в роадмапе (40%), 4 тяжёлых (4%). **Архитектурных блокеров нет ни по одному требованию** — ни одно M-требование не противоречит нашим решениям (монолит, Postgres+RLS, контейнеры, RBAC-матрица, Tests, мультиязычность).

**Desirable (36):** большинство в роадмапе; сознательно не берём только INT-05 (SOAP/WS-Security — legacy, отвечаем REST/OpenAPI).

## Вывод
1. **Да — наш проект отвечает этому RFP.** По продуктовой части покрытие полное (по плану), и по самым весомым доменам — мультитенантность (MTE 6/6), continuous monitoring (CTL 5/5 M), issues/follow-up (ISS 4/4 M), безопасность данных — мы закрываем Mandatory уже архитектурой ядра. Сильнее Vanta по: working papers (у Vanta их нет вообще), планированию с capacity, консолидации группы, on-prem.
2. **Три настоящих технических вызова**: офлайн-синхронизация (WP-10), аннотация документов (WP-06/05), HA 99.7% (INF-02..04). Все три решаемы известными средствами (PWA+sync, pdf.js, stateless+réplica), все в роадмапе — но это самые дорогие пункты.
3. **Главный риск заявки — не техника, а VEN/SUP**: критерии поставщика (референсы, годы, команда) и 24/7 поддержка. Митигируется партнёрством: например, сам **Cyberross** как внедренец/поддержка (у них CISA/CISM-команда, референсы банков, региональное присутствие — они букв. описали себя в VEN) + мы как продукт. Тогда заявка закрывает и VEN, и SUP, и IMP.
