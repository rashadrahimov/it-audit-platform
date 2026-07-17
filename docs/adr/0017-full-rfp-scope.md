# Целевой скоуп = весь RFP Cyberross (audit-management класс), не только IT-compliance

По решению Рашада (18.07.2026) продукт отвечает на **весь RFP Cyberross** (docs/client-templates/inbox/2026-07-18/Cyberross_Audit_Platform_Requirements_EN.pdf, ~100 требований), а не только на IT/continuous-compliance часть. Это поднимает класс продукта с «Vanta-parity + добавки» до **полноценной audit-management-системы уровня TeamMate+/AuditBoard**: все типы аудита (операционный, финансовый, IT, комплаенс, качество, расследования), audit universe, электронные working papers, scheduling с capacity, тайм-трекинг.

Следствия:
- Скоуп теперь = Vanta-паритет (ADR по gap-analysis) **+ RFP-модули** (см. раздел «RFP-эпики» в backlog.md); карта соответствия и gap'ов — docs/client-templates/rfp-coverage.md.
- ERD (T-003) обязан заложить: **Audit Type** на engagement/плане, **Audit Universe** (дерево auditable entities неограниченной глубины), **Working Paper** и **Audit Program** как контейнеры fieldwork, **Time Entry** (тайм-трекинг), крючки под **custom fields** (GEN-07) и **конфигурируемую терминологию** (GEN-06).
- Тяжёлые gap'ы принимаются в roadmap осознанно (working papers с аннотацией документов, офлайн-синхронизация, WORM-журналы, Gantt, low-code, полнотекстовый поиск) — они фазируются, но не отбрасываются.
- Не-архитектурные Mandatory-требования RFP (критерии поставщика VEN, 24/7 SLA, HA 99.7%, ISO27001/SOC2-постур) — отдельный бизнес-трек, не входят в кодовую базу, но учитываются в планировании заявки.
