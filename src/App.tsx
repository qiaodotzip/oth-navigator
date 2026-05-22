import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%]">
          <TopBar onVoiceTap={() => console.log("TODO: voice")} />
        </div>
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
