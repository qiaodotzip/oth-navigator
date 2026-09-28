import type { Api } from "../api/client";
import type { SetupApi } from "./types";

/**
 * The real client as the wizard's API. Plan 6C adds the four setup calls to
 * `createApi` (interfaces.md). Returning `api` here is the check: until those
 * calls land, this is the one line in the editor that fails to compile; once
 * they have, a call whose shape drifts from `SetupApi` fails here, not at run
 * time.
 */
export function asSetupApi(api: Api): Api & SetupApi {
  return api;
}
