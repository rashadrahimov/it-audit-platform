# Vanta — разбор платформы (референс для платформы клиента)

Изучено в sandbox-режиме (демо-данные) на app.eu.vanta.com. Vanta — платформа **compliance automation**: непрерывный автоматизированный сбор доказательств из интеграций, маппинг на стандарты, трекинг issues, trust center, vendor risk, risk register. Ближайший рыночный аналог того, что хочет клиент (upload → checklist → finding), но заточена под сертификацию, а не под внутренний аудит группы компаний.

## Карта навигации (все разделы)

- **My work** — персональный список задач (owner + action needed)
- **Roadmap** (getting-started) — план внедрения
- **Tests** — движок непрерывного автотестирования
- **Reports** — преднастроенные чарт-дашборды
- **Compliance**: Frameworks, Controls, Policies, Documents, Audits, Issues
- **Customer trust**: Overview, Trust Center, Questionnaires, Commitments, Knowledge base, Activity
- **Risk**: Reporting dashboard, Risk register, Risk library, Action tracker
- **Vendors**: Overview, Vendors, Assessments (security reviews)
- **Privacy**: Data inventory (ROPA), Assessments
- **Assets** — инвентарь активов
- **Personnel** — сотрудники (onboarding/offboarding)
- **Integrations** — коннекторы к системам
- нижние: My security tasks, My access requests

## Разделы — детально

### Tests (движок доказательств)
- Дашборд: Tests passing 96/903 (11%); Automated 67/270; Documents 29/633.
- «Tests that need attention»: Overdue 424, Needs remediation (no SLA assigned) 383, Due soon 2.
- Таблица: Name, Owner, Status (Overdue/Passing), **Failing entities** (напр. «10 Jira Accounts»), Due date, **Frameworks** (один тест маппится на много стандартов: APRA CPS, HIPAA, CMMC 2.0…).
- Фильтры: Category, Framework, Control, Integration, Owner, Type, Status, Rollout.
- Категории тестов: Human resources, Information technology, Automated.
- **Суть**: тесты автоматически тянут доказательства из интеграций (Jira, Bitbucket, MongoDB Atlas, MFA-конфиг) и сверяют с контролями. Это то, чего НЕ было в исходном ТЗ клиента — там доказательства собираются вручную через ответы респондентов.

### Frameworks
- Табы: Active 23, Available 48, Update notes 80.
- Таблица: Framework name, Evidence completeness (%), Control completeness (%), Audit ends, Status, Domain.
- Примеры: PCI DSS, SOC 2, GDPR, US Data Privacy, NIST AI RMF, UK Cyber Essentials…
- Домены: Security, Data protection.
- «Add framework», версионирование фреймворков (upgrade UK Cyber Essentials 3.3 с tracked changes).

### Controls (слой требований)
- Assignment-донат: Unassigned 2133 / Assigned / Needs reassignment.
- «1% of controls have passing evidence», 27/2133.
- Таблица: ID (AAT-4), Control (название + описание), Owner, Frameworks (маппинг), Tests (0/2).
- Фильтры: Frameworks, Owner, Domain, Source, Framework code, Status.
- **Control detail (drawer)**: описание требования, ID, Source, Domain, Owner (назначаемый), Note; табы **Mapped elements** (Tests + Documents = доказательства), **History** (audit trail), **Comments**; кнопка **Manage access** (RBAC на уровне контроля).
- Иерархия: Framework → Controls → Tests/Documents (evidence).

### Issues (трекер findings — ядро для клиента)
- «Track and fix compliance gaps in one place».
- Табы: Issues, Tasks, Snapshots (New).
- Быстрые фильтры: All / Open / Closed / Owned by me.
- Колонки: Issue, **Controls** (связь), Template, **Status**, **Severity** (= risk ranking), **Owner**, Due date.
- Фильтры: Status, Severity, Source, Owner, Template, Due date.
- **Прямо соответствует** модели клиента: finding → severity/risk → owner → deadline → закрытие. Плюс шаблоны issue и снапшоты.

### Reports
- Преднастроенные отчёты-дашборды: Customer trust report, Issues report, Program overview (Tests, Risk +3), Vendors report. Чарты по доменам.

### Policies
- Табы: All, Needs my approval, Needs approval, Needs reassignment.
- Колонки: Name, Overall status (Needs remediation), Renew by, Latest version (Expired), Approver, **Approval status** (1/1 ✓), Personnel acceptance (донат).
- Фильтры: Overall status, Latest version, Approver, Framework, Source.
- **Суть**: управление жизненным циклом политик — версии, срок продления, **workflow согласования (approver)**, приём политик сотрудниками (attestation). Готовые шаблоны политик от Vanta.

### Documents (ручные доказательства)
- Тогглы: All, Owned by me, Needs document, Draft.
- Колонки: Name (+ категория «Engineering · Vulnerability management»), Owner, Overall status (Overdue), Renew by, Framework.
- Примеры: «Proof of completed access review», «Vulnerability scan», «Sample of remediated vulnerabilities».
- Дополняют автотесты ручными артефактами доказательств с owner, cadence, маппингом на стандарты.

### Audits + Auditor View (аналог engagement клиента)
- Список аудитов: Active / Completed; фильтры Audit firm, Framework, Status, Audit type. Онбординг «Add your auditor».
- **Auditor View — ОТДЕЛЬНЫЙ scoped-интерфейс** для аудитора (внешнего), доступ выдаётся точечно:
  - Свой левый навбар: Evidence, Controls, Framework, Risk, Vendors, Assets, Personnel, Integrations, Organization settings.
  - **Evidence tracker**: Not ready for audit / Flagged by auditor / Ready for audit / Accepted / Not applicable.
  - Таблица evidence: Evidence, Type, Last updated, Owner, **Auditor Assessment** (статус ревью), кнопка Update evidence. Есть **View SLAs** и **Export**.
  - **Это прямой аналог модели клиента**: аудитор ревьюит ответы/доказательства и выставляет оценку (finding). Но роли инвертированы — у клиента аудиторы внутренние.

### Customer trust → Questionnaires (AI)
- **Questionnaire Automation**: Vanta AI отвечает на входящие security-опросники, используя политики + прошлые ответы (knowledge base). «Auto-suggest», «Suggested Answers», «Generated by Vanta AI».
- Архитектура = RAG поверх базы знаний. Для клиента релевантно, но инвертировано: здесь AI ОТВЕЧАЕТ на вопросы; клиент хочет, чтобы AI ГЕНЕРИРОВАЛ вопросы/findings. Механика RAG та же.

### Customer trust → Trust Center + Knowledge base
- **Trust Center** — публичная страница security-posture компании (Factio's Trust Center, публичный URL). Просмотр статуса compliance, запрос документов под access-control. View / Edit / Give access. Pending access requests, Active questionnaires.
- **Knowledge base** — единое хранилище security-документации: Name, Owner, **Expiration status** (Verified), Expiration date, Last updated, **Customer visibility** (Requestable). Управление видимостью для Trust Center.

### Risk → Overview (дашборд + heat map)
- «Number of risks by treatment type» (Accept/Avoid/Mitigate/Transfer/None; Approved vs Not approved).
- Task status донат, Control status донат (риски связаны с контролями и задачами).
- **Risk distribution**: **Current risk heat map** — матрица impact × likelihood с числами и цветом (зелёный/жёлтый/красный), residual если treatment complete иначе inherent. Top 6 risk categories (Privacy, Operations security, People operations…).
- = «risk ranking map for business processes», которую хочет клиент.

### Risk → Risk library
- Курируемый каталог преднастроенных risk scenarios по категориям (AI, software dev, information security operations, asset management…). «Add to register». Library-first подход (как в нашем ADR-0004, но для рисков).

### Vendors (TPRM)
- Overview: Assessments progress (Overdue/Due soon/In progress); **Discovery** — автообнаружение вендоров из интеграций с inherent risk (Critical/High/Medium/Low): GitHub Desktop, Okta, Docker, Postman; Vendors managed (13) by inherent risk score, by category (донат).
- Sub: Overview, Vendors (список), Assessments (security reviews вендоров).

### Privacy → Data inventory (ROPA)
- Документирование обработки перс. данных (ROPA): Processing activity, Purpose, Vendors, Categories of individuals, Data locations, Business functions. Табы «Data you control» / «Data you process for others». Review status/owner/cadence. Импорт существующего ROPA.
- Sub: Data inventory, Assessments (privacy/DPIA).

### Assets → Inventory (авто-универсум IT-активов)
- Автообнаружение из cloud/MDM/интеграций: Compute instances, Computers (MDM), Container clusters, Container repositories, Data warehouses, Domains, Encryption keys, Git repositories, Kubernetes clusters/nodes, Autoscale groups…
- Таблица: Service/Identifier, Region/Account, Description, **Owner**. Export, bulk tags.
- Sub: Inventory, Code changes, Vulnerabilities, Security alerts.
- = «IT/digital systems universe (ERP, DB, network, security)» клиента, но авто-заполняется.

### Personnel → People
- Директория из HRIS/IdP: Name+email, Employment status (Current/Terminated), **Task status** (onboarding/offboarding security tasks: No tasks / N Overdue / Complete), Last reminder, **Groups** (= департаменты: Engineering, Sales, Default group).
- Быстрые фильтры: All / Overdue / Due soon / Offboarding. Табы People / Groups.
- Sub: People, Computers, Access (access reviews — кто к чему имеет доступ).

### Integrations (движок автоматизации)
- «Connect tools to automate evidence collection and continuous monitoring. Vanta scans from a known IP.»
- Connected (12) / Errors (4). Каждая интеграция: capabilities (Access, Inventory, Vulnerabilities, Task tracking, Task creation, Vendor procurement), Configure scope, Manage.
- Питает автотесты, инвентарь активов, discovery вендоров, синк персонала.

### My work / My security tasks / My access requests
- Персональные представления: назначенные задачи, security-задачи сотрудника, запросы доступа. Роль-специфичные лендинги.

---

## Дозакрытые подразделы (второй проход)

### Settings (КРИТИЧНО для клиента — RBAC/MFA/SSO/уведомления)
Структура: **COMPANY** (Notifications, Information, Language, Developer console, Tags, AI) · **ACCESS** (User permissions, Roles, Login and security) · **MONITORING** (Frameworks, SLAs).
- **Notifications**: расписание уведомлений owner'ам Test/Document/Control о провалах (Anytime / рабочие часы 9-18 в таймзоне, в демо GMT+4 Asia/Baku); **Personnel reminders** — digest незакрытых security-задач (Every Monday / weekday, Email). = требования клиента про напоминания/эскалации.
- **Roles (RBAC)**: преднастроенные роли — Collaborator (только назначенное), Editor (всё кроме sensitive personnel data), Admin, View-only Admin, Trust Collaborator, + Auditors. Вкладка **Permission details** = матрица «действие × роль» (No access / Edit / View only) по группам действий (Platform → Reports, Integrations, MCP connections…).
- **User permissions**: список пользователей с ролью (dropdown). Три категории: **Your organization / Auditors / Managed Service Providers**. У клиента было 2 (аудиторы + end users) — здесь добавлен MSP, аудиторы вынесены отдельно (scoped-доступ = Auditor View).
- **Login and security**: passwordless (magic link), **SSO** (OIDC/интеграции, Google Workspace connected), вкладка Security — idle session timeout, Vanta support access, Incident contacts; **User provisioning** — авто-provision/деактивация аккаунтов уволенных.
- **AI**: тумблер Enable Vanta AI (можно выключить — подтверждает наш ADR-0004) + **Memory** (AI-память об организации).
- **Information**: бизнес-профиль (юр. имя, юрисдикция, адрес) «to inform policies and compliance» — вход для вывода применимых контролей.
- **Language**: локализация ТОЛЬКО email-уведомлений и Slack, НЕ весь UI/контент. → наш ADR-0009 (полная мультиязычность EN/AZ/RU) — реальный дифференциатор.

### Personnel → Computers (endpoint compliance)
- Мониторинг устройств через MDM (Jamf, Microsoft Endpoint, Vanta Agent). По каждому устройству: OS version, Monitoring source, и проверки **PW / шифрование диска (HD) / антивирус (AV) / блокировка экрана (SL)**, Last check. Табы Monitored/Unmonitored, «Send bulk reminder».

### Personnel → Access (IAM / access governance) ⭐
- Табы: **Accounts, Requests, Reviews, Deprovisioning tasks**.
- Accounts: аккаунты из интеграций (AWS IAM…) с Owner, Groups, Type, Status, **MFA-статус**, Created/Deactivated. «Assign 81 active accounts to owners».
- = классический ITGC **User Access Review** + JIT access requests + депровижнинг. Прямо релевантно IT-аудиту.

### Assets → Vulnerabilities (vuln management)
- «Monitor 3rd party vulnerabilities and ensure compliance with SLAs». Табы: Findings by asset / by vulnerability / Deactivated / History. Asset scan coverage by source; **Asset SLA status** (Overdue/Due soon/Due later/OK). По активу: severity, vulnerability status, SLA.

### Assets → Code changes (change management)
- «Monitor merged pull requests from your codebases for compliance». Change × Status, фильтры Source/Repository/Date/Status. = ITGC change management (доказательства ревью PR).

### Assets → Security alerts
- Алерты от posture-инструментов (CSPM) с окнами резолюции. Табы Open/Deactivated/By category/By asset/History.

### Vendors → Vendors (список) и Assessments
- Список: табы Procurement/Active/Archived/All; по вендору inherent/residual risk, категория, assessment status, security owner; настраиваемая **intake-форма** («Edit intake form»).
- Assessments: структурированные ревью вендоров — Type, State, Due date, Evidence status, owner, Evidence request, **Recommendation**.

### Privacy → Assessments (DPIA)
- Оценки приватности процессов обработки данных под регуляторику. Табы All / Needs my approval; тип/статус/owner/review date. Approval-workflow.

### Risk → Action tracker
- «Tasks and controls associated with approved risk scenarios». Табы Tasks / Controls. Task → Due date → Assignee → Status → Source. Трекер ремедиации рисков.

### Customer trust → Commitments и Activity
- **Commitments**: трекер контрактных обязательств перед клиентами (сроки уведомлений об инцидентах/breach, пентесты…), синк из контрактов. Табы Commitments/Contracts.
- **Activity**: лог просмотров публичного Trust Center (Viewer, Location, Action, Details, Date) + вкладка AI insights. Export.

### Roadmap (Compliance Roadmap)
- Guided фазовый план к соответствию: framework (SOC 2 Type II), Off track / Audit ready date, % пройденных тестов, шаги **Initial setup → Policies & Personnel → Test remediation → Audit** с датами. Снижает порог внедрения.

### SLA как сквозная концепция
- SLA встречается везде: Tests (Needs remediation — no SLA assigned), Auditor View (View SLAs), Vulnerabilities (Asset SLA status), Security alerts (resolution windows). У Vanta SLA — first-class настройка (Settings → Monitoring → SLAs). Нам заложить SLA-поля на findings/tests/задачах.
