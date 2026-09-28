import type { ValidationReport } from "@oth/model";
import type { Api } from "../api/client";
import { reportFailure } from "../ui/failure";
import { useEditorStore } from "./store";

/**
 * The latest check asked for. There is one for every caller, since they all
 * fill the one report in the store.
 */
let latest = 0;

/**
 * Checks the map again, for the screens that read the report: Build's to-do
 * list, and the Places checklist.
 *
 * Survey and Review save without validating, because nothing they write can
 * block Publish. So the report can be older than a place tagged since. Only
 * the report is fetched: the map itself is already here.
 *
 * Only the latest check is applied. StrictMode mounts twice in development,
 * so two checks overlap, and the older can answer first. Were it taken, the
 * newer answer would find the report changed under it, take it for a save's,
 * and be thrown away.
 *
 * `doing` finishes "Couldn't …" in the failure toast. A failure is said only
 * while `heard()`, and only for the latest check: two identical toasts would
 * read as two failures, and a newer check may yet succeed.
 */
export async function recheck(
  api: Pick<Api, "validate">, doing: string, heard: () => boolean = () => true,
): Promise<void> {
  const ticket = ++latest;
  const before = useEditorStore.getState().report;
  let report: ValidationReport;
  try {
    report = await api.validate();
  } catch (err) {
    if (ticket === latest && heard()) reportFailure(err, { doing, retry: () => recheck(api, doing) });
    return;
  }
  if (ticket !== latest) return;
  // A save that landed meanwhile brought a report of its own, from after it: keep that one.
  if (useEditorStore.getState().report === before) useEditorStore.getState().setReport(report);
}
