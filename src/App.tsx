import { useState } from "react";
import { PhoneFrame } from "@/ui/PhoneFrame";
import { Scene } from "@/world/Scene";
import { FloorSelector } from "@/ui/FloorSelector";
import { TopBar } from "@/ui/TopBar";
import { PromptPanel } from "@/ui/PromptPanel";
import { WaypointEditor } from "@/dev/WaypointEditor";

export default function App() {
  if (typeof window !== "undefined" && window.location.hash === "#waypoints") {
    return <WaypointEditor />;
  }
  const [narration] = useState("");
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
        <div className="h-[32%]">
          <PromptPanel
            narrationText={narration}
            onPickService={id => console.log("TODO: pick", id)}
          />
        </div>
      </div>
    </PhoneFrame>
  );
}
