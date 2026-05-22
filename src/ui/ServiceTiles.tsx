import { useStore } from "@/store";
import { ServiceIcon } from "./iconMap";

export function ServiceTiles({ onPick }: { onPick: (serviceId: string) => void }) {
  const services = useStore(s => s.services);
  const language = useStore(s => s.language);
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {services.map(s => (
        <button
          key={s.id}
          onClick={() => onPick(s.id)}
          className="flex flex-col items-center justify-center gap-2 py-4 rounded-2xl bg-white shadow-sm border border-neutral-200 active:scale-95 transition"
        >
          <ServiceIcon iconKey={s.iconKey} size={32} />
          <span className="text-sm font-semibold text-oth-ink text-center">
            {language === "en" ? s.nameEn : s.nameZh}
          </span>
        </button>
      ))}
    </div>
  );
}
