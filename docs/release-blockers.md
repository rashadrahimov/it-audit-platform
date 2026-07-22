# Release blockers register

Статус: T-H145. Этот файл отделяет реально оставшиеся buildable-задачи от пунктов, которые нельзя честно закрыть без решения клиента, production secrets, инфраструктуры, production data access или внешней проверки.

## Client decisions required

1. **Регулятор / местный стандарт.**
   - Нужен выбор применимого локального стандарта и требуемых формулировок. CBAR seed уже присутствует как общий framework, но production baseline должен подтвердить клиент.

2. **Excel-шаблоны клиента.**
   - Нужны реальные исторические планы/time sheets/findings templates для migration mapping и UAT импорта.

3. **Оплата/биллинг.**
   - Нужно бизнес-решение: perpetual vs subscription, включённые seats/subsidiaries, лимиты и commercial terms.

4. **Решение по AI.**
   - Нужен выбор режима: cloud provider, локальная модель или AI off для on-prem. Без этого нельзя включать генеративные checklists/findings как production feature.

5. **UAT на реальных данных.**
   - Нужны данные клиента, пользователи, сценарии приёмки и окно обучения.

## Production secrets / deployment blockers

1. **GitHub Actions deploy secrets отсутствуют.**
   - Required: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_PATH`.
   - Optional: `DEPLOY_USER`.
   - Evidence: every deploy run after T-H136..T-H140 failed before SSH with exactly those missing secrets.

2. **Production smoke cannot run until deploy succeeds.**
   - API health/web smoke/tag smoke on prod are blocked by the missing deployment secrets or a direct SSH credential.

## Production data / integrity blockers

1. **Live demo/prod audit-log chain reports `needsReview`.**
   - Evidence from site check on `http://78.47.51.200:8080/audit-log`: `reason=content-hash`, `brokenAt=019f76a3-ed8d-7239-b422-2e6d36d3273f`.
   - Code-side LOG-01 behavior is correct: `audit-hash-chain.spec.ts` proves a tampered row is detected instead of hidden.
   - Resolution needs production DB/backup authority, not a normal code patch. Follow [`docs/audit-log-integrity-runbook.md`](audit-log-integrity-runbook.md): preserve evidence, compare with backup/WAL/PITR, then restore/reseed demo or open a documented new trust epoch.

## Infrastructure blockers

1. **EP-ONPREM.**
   - Needs client backup integration, offline artifact distribution, base image hardening requirements, pgBackRest/WAL-PITR target and operational ownership.

2. **EP-HA.**
   - Needs target topology, load balancer, Postgres HA design, upgrade policy and uptime SLO confirmation.

3. **EP-HARDEN infra.**
   - Needs WORM/S3 Object Lock backend, syslog destination, retention policy and SOC/security ownership.

4. **Prod deploy pipeline completion.**
   - Repo has deploy workflow and prod compose; completion is blocked by secrets, monitoring/alerting target and rotation policy.

## Architecture phase-3 forks

1. **EP-OFFLINE.**
   - Requires offline-first data model, conflict resolution, sync protocol and UX decisions.

2. **EP-ANNOT.**
   - Requires Office/PDF annotation engine choice, storage model for tick marks and viewer/editor UX.

3. **EP-LOWCODE.**
   - Requires process DSL/modeling approach, permissions model and governance of no-code changes.

## External QA / release gates

1. **Load testing.**
   - Needs agreed tenant/data scale, environment, target SLAs and non-production load window.

2. **Security audit.**
   - Needs external pentest/SCA/OWASP review scope and acceptance criteria.

3. **WCAG AA certification.**
   - Repo-side fixes can continue, but final release claim needs full a11y audit evidence.
