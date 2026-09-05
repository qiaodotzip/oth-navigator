import type { MapModel } from "../schema/model";

export type Severity = "error" | "warning";

export type EntityType =
  | "building"
  | "level"
  | "room"
  | "doorway"
  | "entrance"
  | "portal"
  | "portalEndpoint"
  | "navHint"
  | "pathway"
  | "place"
  | "asset"
  | "placement"
  | "tenant";

export type ValidationIssue = {
  severity: Severity;
  /** Stable machine-readable code, e.g. "room.footprint.selfIntersecting". */
  code: string;
  message: string;
  entityType: EntityType;
  entityId: string;
  levelId?: string;
};

export type ValidationReport = {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  /** True when there are no errors. Warnings never block publish. */
  ok: boolean;
};

export type Rule = (model: MapModel) => ValidationIssue[];
