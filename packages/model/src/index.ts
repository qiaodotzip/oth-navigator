export const MODEL_PACKAGE_VERSION = "0.1.0";

export * from "./primitives";
export * from "./schema/building";
export * from "./schema/structure";
export * from "./schema/navigation";
export * from "./schema/dressing";
export * from "./schema/semantics";
export * from "./schema/survey";
export * from "./schema/model";
export * from "./schema/pdfPlan";

export * from "./geometry/ring";
export * from "./geometry/segment";
export * from "./geometry/point";
export * from "./geometry/label";

export * from "./validation/types";
export * from "./validation/validate";
export * from "./nav/grid";
export * from "./nav/reachability";
export * from "./survey/graph";
export * from "./survey/levels";

// Part D: 3D fidelity.
export * from "./geometry/rect";

// Plan 6A: objects.
export * from "./objects";

// Plan 6C: a traced space made a lift or stair stop. The editor's MakeStop and
// the server's make_stop both plan with these, so the two save the same thing.
export * from "./stops/placePoint";
export * from "./stops/portalFromRoom";

// Plan 6C: Build's "already on the map" rule, so Claude's list_drafts says it
// the same way Build does.
export * from "./drafts/match";
