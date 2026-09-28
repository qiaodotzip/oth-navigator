import type { ValidationReport } from "@oth/model";
import type { Api } from "../api/client";
import { reportFailure } from "../ui/failure";
import { useEditorStore } from "./store";

/**
 * Checks the map again, for the screens that read the report: Build's to-do
 * list, and the Places checklist.
 *
 * Survey and Review save without validating, because nothing they write can
 * block Publish. So the report can be older than a place tagged since. Only
 * the report is fetched: the map itself is already here.
 *
 * `doing` finishes "Couldn't …" in the failure toast. A failure is said only
 * while `heard()`: StrictMode mounts twice in development, and two identical
 * toasts would read as two failures.
 */
export async function recheck(
  api: Pick<Api, "validate">, doing: string, heard: () => boolean = () => true,
): Promise<void> {
  const before = useEditorStore.getState().report;
  let report: ValidationReport;
  try {
    report = await api.validate();
  } catch (err) {
    if (heard()) reportFailure(err, { doing, retry: () => recheck(api, doing) });
    return;
  }
  // A save that landed meanwhile brought a report of its own, from after it: keep that one.
  if (useEditorStore.getState().report === before) useEditorStore.getState().setReport(report);
}
