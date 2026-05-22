import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%] bg-oth-primary text-white grid place-items-center">TopBar</div>
        <div className="h-[60%] relative">
          <Scene />
          <FloorSelector />
        </div>
        <div className="h-[32%] bg-oth-paper border-t border-neutral-300 grid place-items-center text-neutral-700">
          PromptPanel
        </div>
      </div>
    </PhoneFrame>
  );
}
