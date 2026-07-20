# ADR-0021: Per-entity ACL «Manage access» (T-V48)

## Контекст

RBAC ([[0013-rbac-permission-matrix]]) даёт права на уровне **(ресурс, действие) → none/view/edit** для всей роли, а field-level ([[0020-field-level-permissions]]) — на уровне полей сущности. Оба работают на **классе** сущностей: «все риски» видит любой с `control/view`. Vanta-паритет требует «Manage access» — ограничить доступ к **конкретному экземпляру** (этот риск виден только этим людям), не меняя роль.

## Решение

Полиморфный additive-restrictive ACL поверх RBAC:

- Таблица `entity_acl`: `(tenant_id, entity_type, entity_id, membership_id, level)`, `level ∈ {view, edit}`, UNIQUE по тройке `(entity_type, entity_id, membership_id)`. RLS — стандартная tenant-изоляция (FORCE).
- **Семантика additive-restrictive:**
  - У сущности **нет** acl-строк → она видна всему тенанту (текущее поведение, обратная совместимость).
  - У сущности **есть** хотя бы одна acl-строка → доступ ограничен: видят только **гранты** + **владелец** (`owner_membership_id`) + **админ тенанта** (роль даёт `settings/edit=edit`).
  - `edit` через ACL требует гранта `level=edit` (или владелец/админ). `view`-грант даёт только чтение.
- ACL — **дополнительное ограничение поверх RBAC**, а не замена: `итоговый доступ = RBAC-право И ACL-разрешение`. Чистый резолвер `resolveEntityAccess` возвращает `{restricted, canView, canEdit}`; вызывающий И-объединяет с RBAC.

## Enforcement

- Application-layer (не RLS): RLS не знает про membership текущего запроса дёшево, а ACL-семантика «есть строки → deny-by-default» плохо ложится на политики. Поэтому проверка в сервисе:
  - **list**: `EntityAclService.filterVisible(ctx, type, items)` одним запросом тянет гранты для всех id, режет невидимые.
  - **detail/edit**: `EntityAclService.access(ctx, type, id, ownerMembershipId)` → 403, если `!canView`/`!canEdit`.
- `ctx` = `{tenantId, membershipId, isAdmin}`, резолвится `resolveActor(tenantId, userId)` (membership + признак админа по `settings/edit`).
- Управление грантами (`POST/DELETE/GET /entity-acl`) гейтится RBAC-правом на сущность (для risk — `control/edit`).

## Раскатка

`ACL_ENTITY_TYPES` — реестр поддержанных типов; старт с `risk` (эталон). Добавление типа = внести в реестр + вклинить `filterVisible`/`access` в его list/detail (механическая работа, паттерн зафиксирован здесь).

## Последствия

- Плюс: точечное ограничение доступа без раздувания ролей; обратная совместимость (нет грантов — ничего не меняется).
- Минус: enforcement — ручной per-endpoint (не RLS-гарантия); не покрытые ACL-проверкой пути type-сущности утекут. Реестр `ACL_ENTITY_TYPES` и этот ADR — источник правды по покрытию.
