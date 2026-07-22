export interface EvidenceReuseControl {
  id: string;
  originControlId: string | null;
  ref: string;
  requirementIds: Iterable<string>;
  frameworkIds: Iterable<string>;
}

export interface EvidenceReuseLink {
  documentId: string;
  filename: string;
  entityId: string;
  relation: string;
  reviewStatus: string;
}

export interface EvidenceReuseSummary {
  evidenceDocuments: number;
  reusableEvidenceDocuments: number;
  coveredRequirementsWithEvidence: number;
  evidenceCoveragePercent: number;
  topDocuments: Array<{
    documentId: string;
    filename: string;
    frameworks: number;
    requirements: number;
    controls: string[];
    reviewStatuses: string[];
    relations: string[];
  }>;
}

/**
 * Cross-framework evidence reuse: один document_link на mapped control может
 * закрывать несколько framework requirements через control_mapping.
 */
export function summarizeEvidenceReuse(
  controls: EvidenceReuseControl[],
  links: EvidenceReuseLink[],
  totalRequirements: number,
): EvidenceReuseSummary {
  const linksByControl = new Map<string, EvidenceReuseLink[]>();
  for (const link of links) {
    const rows = linksByControl.get(link.entityId) ?? [];
    rows.push(link);
    linksByControl.set(link.entityId, rows);
  }

  const byDocument = new Map<
    string,
    {
      filename: string;
      frameworkIds: Set<string>;
      requirementIds: Set<string>;
      controls: Set<string>;
      reviewStatuses: Set<string>;
      relations: Set<string>;
    }
  >();
  const coveredRequirements = new Set<string>();

  for (const control of controls) {
    const requirementIds = new Set(control.requirementIds);
    if (requirementIds.size === 0) continue;
    const frameworkIds = new Set(control.frameworkIds);
    const controlLinks = [
      ...(linksByControl.get(control.id) ?? []),
      ...(control.originControlId ? (linksByControl.get(control.originControlId) ?? []) : []),
    ];
    for (const link of controlLinks) {
      let row = byDocument.get(link.documentId);
      if (!row) {
        row = {
          filename: link.filename,
          frameworkIds: new Set(),
          requirementIds: new Set(),
          controls: new Set(),
          reviewStatuses: new Set(),
          relations: new Set(),
        };
        byDocument.set(link.documentId, row);
      }
      row.controls.add(control.ref);
      row.reviewStatuses.add(link.reviewStatus);
      row.relations.add(link.relation);
      for (const id of frameworkIds) row.frameworkIds.add(id);
      for (const id of requirementIds) {
        row.requirementIds.add(id);
        coveredRequirements.add(id);
      }
    }
  }

  const topDocuments = [...byDocument.entries()]
    .map(([documentId, row]) => ({
      documentId,
      filename: row.filename,
      frameworks: row.frameworkIds.size,
      requirements: row.requirementIds.size,
      controls: [...row.controls].sort(),
      reviewStatuses: [...row.reviewStatuses].sort(),
      relations: [...row.relations].sort(),
    }))
    .sort(
      (a, b) =>
        b.frameworks - a.frameworks ||
        b.requirements - a.requirements ||
        b.controls.length - a.controls.length ||
        a.filename.localeCompare(b.filename),
    );

  return {
    evidenceDocuments: byDocument.size,
    reusableEvidenceDocuments: topDocuments.filter((doc) => doc.frameworks >= 2).length,
    coveredRequirementsWithEvidence: coveredRequirements.size,
    evidenceCoveragePercent:
      totalRequirements === 0
        ? 0
        : Math.round((coveredRequirements.size / totalRequirements) * 100),
    topDocuments: topDocuments.slice(0, 10),
  };
}
