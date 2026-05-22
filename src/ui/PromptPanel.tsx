import { useStore } from "@/store";
import { ServiceTiles } from "./ServiceTiles";

export function PromptPanel({
  narrationText,
  onPickService,
}: {
  narrationText: string;
  onPickService: (id: string) => void;
}) {
  const route = useStore(s => s.activeRoute);
  return (
    <div className="h-full bg-oth-paper border-t border-neutral-300 overflow-hidden">
      {!route ? (
        <ServiceTiles onPick={onPickService} />
      ) : (
        <div className="p-4 h-full flex flex-col">
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
            Guiding you now
          </p>
          <p className="text-lg font-semibold text-oth-ink leading-snug">
            {narrationText || "…"}
          </p>
        </div>
      )}
    </div>
  );
}
