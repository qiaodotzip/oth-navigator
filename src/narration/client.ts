import type { AccessibilityProfile, NarrationResponse, Service } from "@/data/types";

export async function fetchNarration(args: {
  query: string;
  profile: AccessibilityProfile;
  services: Service[];
  segmentKeys: string[];
}): Promise<NarrationResponse> {
  const res = await fetch("/api/narrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`narrate ${res.status}`);
  return res.json();
}
