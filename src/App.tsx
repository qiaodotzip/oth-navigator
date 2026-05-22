import { PhoneFrame } from "@/ui/PhoneFrame";

export default function App() {
  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="h-[8%] bg-oth-primary text-white grid place-items-center">TopBar</div>
        <div className="h-[60%] bg-neutral-200 grid place-items-center text-neutral-700">WorldView</div>
        <div className="h-[32%] bg-oth-paper border-t border-neutral-300 grid place-items-center text-neutral-700">PromptPanel</div>
      </div>
    </PhoneFrame>
  );
}
