import { useEffect } from "react";
import { create } from "zustand";
import type { PageChoice } from "../pdf/importPlan";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

type Ask = { choices: PageChoice[]; answer: (page: number | null) => void };

/** The question on screen, and how many pickers are there to show it. */
const usePageAsk = create<{ ask: Ask | null; shown: number }>(() => ({ ask: null, shown: 0 }));

/**
 * Asks which page of a PDF is this floor's plan (spec §5.2 step 1). Answers
 * null when the question is closed, and at once when no picker is on screen,
 * such as a Retry from a toast after leaving the Floorplan step. A question
 * left waiting would hold "Adding…" for ever.
 */
export function askForPage(choices: PageChoice[]): Promise<number | null> {
  return new Promise(resolve => {
    const { ask, shown } = usePageAsk.getState();
    ask?.answer(null);
    if (shown === 0) {
      resolve(null);
      return;
    }
    usePageAsk.setState({
      ask: {
        choices,
        answer: page => {
          usePageAsk.setState({ ask: null });
          resolve(page);
        },
      },
    });
  });
}

export function PdfPagePicker() {
  const ask = usePageAsk(s => s.ask);
  useEffect(() => {
    usePageAsk.setState(s => ({ shown: s.shown + 1 }));
    return () => usePageAsk.setState(s => ({ shown: s.shown - 1 }));
  }, []);
  return (
    <Dialog
      open={ask != null}
      onOpenChange={open => {
        if (!open) ask?.answer(null);
      }}
      title="Which page is this floor's plan?"
      description="The PDF has more than one page. Choose the one with this floor's plan."
    >
      <ul className="max-h-80 space-y-1 overflow-auto">
        {ask?.choices.map(c => (
          <li key={c.number}>
            <Button className="w-full justify-start" onClick={() => ask.answer(c.number)}>
              {c.title ? `Page ${c.number} · ${c.title}` : `Page ${c.number}`}
            </Button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
