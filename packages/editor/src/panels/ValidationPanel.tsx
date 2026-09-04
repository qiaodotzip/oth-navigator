import { useEditorStore } from "../state/store";

export function ValidationPanel() {
  const report = useEditorStore(s => s.report);
  const select = useEditorStore(s => s.select);
  if (!report) return null;

  if (report.issues.length === 0) {
    return <p className="p-3 text-sm text-stone-600">No problems found.</p>;
  }

  return (
    <div className="space-y-2 p-3 text-sm">
      {report.errorCount > 0 && (
        <p className="font-medium text-red-700">
          {report.errorCount} error{report.errorCount === 1 ? "" : "s"} — this blocks publishing.
        </p>
      )}
      {report.warningCount > 0 && (
        <p className="text-amber-700">
          {report.warningCount} warning{report.warningCount === 1 ? "" : "s"}.
        </p>
      )}
      <ul className="space-y-1">
        {report.issues.map((issue, i) => (
          <li key={`${issue.code}-${issue.entityId}-${i}`}>
            <button
              className="text-left hover:underline"
              onClick={() => {
                if (issue.entityType === "room") select({ type: "room", id: issue.entityId });
              }}
            >
              <span className={issue.severity === "error" ? "text-red-700" : "text-amber-700"}>
                {issue.severity === "error" ? "✕" : "!"}
              </span>{" "}
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
