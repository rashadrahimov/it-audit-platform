# Разбор чеклиста клиента → модель данных

Источник: `inbox/2026-07-18/IT_Audit_Checklist_Template.xlsx` (заказчик Cyberross LLC). Это **готовая спецификация** ядра нашей модели (Engagement → Control → Response → Finding). Ниже — прямое отображение на наши сущности; вход для T-003 (ERD).

## Структура файла
3 листа: **Instructions** (легенда колонок + инструкция), **Audit Checklist** (рабочая таблица, 13 колонок), **Summary** (авто-дашборд с агрегатами).

Форензик-проверка (18.07.2026): скрытых строк/колонок/листов нет, комментариев/гиперссылок/картинок/диаграмм нет, защиты нет; merged — только заголовки A1:M1/A2:M2; формат дедлайнов `yyyy-mm-dd`; Summary — чистые COUNTIF. **Метаданные: файл сгенерирован программно (creator=openpyxl) 17.07.2026 19:37** — это свежесозданный шаблон-образец из пакета Cyberross (согласуется с их RFP-baseline «PREPARED FOR [CLIENT NAME]»), а не рабочий файл с реальной историей аудитов; 31 контрол-пример — демонстрационные (о чём прямо сказано в Instructions).

Шапка engagement'а (строка 2 листа Checklist): Organisation · Audit period · Auditor · Date.

## Колонки чеклиста → наши сущности

| # | Колонка (клиент) | Наша сущность.поле | Примечание |
|---|------------------|--------------------|-----------|
| 1 | Ref | Control.ref | Формат `{DOMAIN}-{NN}`, напр. `AC-03` |
| 2 | Domain / Control Area | Control.domain | 16 доменов (ниже) |
| 3 | Control Objective | Control.objective | Что контроль должен обеспечить |
| 4 | Audit Question | Control.question | Вопрос аудируемому (наш «checklist item») |
| 5 | Auditee Response | Response.text | «Вторая колонка» из устного ТЗ |
| 6 | Evidence Reviewed | Response.evidence → Document[] | Док-ты/скрины/интервью |
| 7 | Compliance Status | Response.compliance_status | **НОВОЕ поле** (enum, см. ниже) |
| 8 | Risk Rating | Finding.risk_rating | severity (enum) |
| 9 | Audit Finding | Finding.description | «Третья колонка» — gap как риск |
| 10 | Recommendation / Action Plan | Finding.remediation | Согласованное действие |
| 11 | Owner | Finding.owner (auditee-side) | Ответственный за действие |
| 12 | Target Deadline | Finding.deadline | Дата устранения |
| 13 | Status | Finding.status | remediation status (enum) |

Вывод: **Control** (reference data) = колонки 1-4; **Response** (per engagement) = 5-7; **Finding** = 8-13. Finding появляется, когда Compliance Status ≠ Compliant/N/A.

## Фиксированные enum'ы (из drop-down'ов)
- **Compliance Status**: `Compliant` · `Partially Compliant` · `Non-Compliant` · `Not Applicable`
- **Risk Rating**: `Critical` · `High` · `Medium` · `Low` · `N/A`
- **Remediation Status**: `Not Started` · `Open` · `In Progress` · `Closed` · `Overdue`

## Таксономия доменов контролей (16, из примера)
| Префикс | Домен |
|---------|-------|
| GOV | IT Governance |
| AC | Access Control |
| CM | Change Management |
| BK | Backup & Recovery |
| DR | Business Continuity |
| NW | Network Security |
| VM | Vulnerability Mgmt |
| EP | Endpoint Security |
| LM | Logging & Monitoring |
| DP | Data Protection |
| TP | Third-Party / Vendor |
| IR | Incident Management |
| AM | Asset Management |
| CL | Cloud Security |
| PH | Physical Security |
| SA | Security Awareness |

В шаблоне ~31 готовый контроль-пример (GOV-01…SA-01) с реалистичными формулировками — **можно сразу засеять глобальную библиотеку контролей** (ADR-0016) этими доменами и контролями как ISO27001/COBIT-baseline.

## Авто-дашборд (лист Summary) → наши агрегаты
Счётчики, которые дашборд должен считать по engagement'у:
- **By Compliance Status** (Compliant/Partial/Non/N-A + TOTAL)
- **By Risk Rating** (Critical/High/Medium/Low + TOTAL)
- **By Remediation Status** (Open/In Progress/Closed/Overdue/Not Started + TOTAL)
- «Open / in-progress findings» — сводный счётчик.

Это подтверждает наши дашборды (T-044) и REP-требования из спеки.

## Что это уточняет в нашей модели (для T-003)
1. **Новое поле `Response.compliance_status`** — у нас его не было; это отдельная ось от Risk Rating (соответствие vs серьёзность). Добавить.
2. **Control получает 4 поля**: `ref`, `domain`, `objective`, `question` (мы раньше держали контроль как «вопрос» — теперь objective и question разделены).
3. **Evidence Reviewed** подтверждает связь Response → Document[] (доказательства на уровне ответа, не только теста).
4. Подтверждает Finding-поля: risk_rating, remediation, owner (auditee-side), deadline, status — совпадает с нашим ADR/глоссарием.
5. **Regulator = CBAR** (Центробанк Азербайджана) — из контроля IR-02.

## Следующие шаги (не делаю без отмашки)
- Засеять глобальную библиотеку: 16 доменов + ~31 контроль из шаблона (feeds T-030/T-031).
- Учесть эти поля/enum'ы в ERD (T-003).
- Разобрать PDF-спецификацию (100+ требований) — она задаёт остальные модули (planning, scheduling, working papers, controls monitoring и т.д.).
