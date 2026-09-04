import type { Language, RouteVariant, Service } from "@/data/types";

export type StepInstruction = {
  kind: "walk" | "transit" | "handoff" | "arrived";
  title: string;
  sub: string;
  /** Length of the leg to the next waypoint, in floor metres (0 if none). */
  distanceM: number;
};

type TransitKey = "lift" | "stairs" | "escalator";

function isTransit(key: string): key is TransitKey {
  return key === "lift" || key === "stairs" || key === "escalator";
}

function transitWord(key: string, lang: Language): string | null {
  if (key === "lift") return lang === "zh" ? "电梯" : "lift";
  if (key === "stairs") return lang === "zh" ? "楼梯" : "stairs";
  if (key === "escalator") return lang === "zh" ? "扶梯" : "escalator";
  return null;
}

/**
 * The headline instruction for the current navigation step. Single source of
 * truth shared by the on-screen hero (PromptPanel) and the spoken line (App's
 * voice effect) so the two never drift apart.
 */
export function buildStepInstruction(
  variant: RouteVariant,
  idx: number,
  services: Service[],
  language: Language,
): StepInstruction {
  const steps = variant.steps;
  const current = steps[idx];
  const next = steps[idx + 1];
  const isLast = idx >= steps.length - 1;
  const svc = services.find(s => s.id === variant.serviceId);
  const svcName = svc ? (language === "zh" ? svc.nameZh : svc.nameEn) : "";

  // Length of the wall-avoiding polyline to the next waypoint.
  const legPoly =
    next && next.pathFromPrev && next.pathFromPrev.length >= 2
      ? next.pathFromPrev
      : next && current
        ? [current.point, next.point]
        : [];
  let distanceM = 0;
  for (let k = 0; k < legPoly.length - 1; k++) {
    distanceM += Math.hypot(legPoly[k + 1][0] - legPoly[k][0], legPoly[k + 1][1] - legPoly[k][1]);
  }

  if (current?.segmentKey === "lift-handoff") {
    const lvl = current.handoffLevel ?? "";
    return {
      kind: "handoff",
      title: language === "zh" ? `乘电梯前往 ${lvl} 楼` : `Take the lift up to Level ${lvl}`,
      sub:
        language === "zh"
          ? `${svcName} 在 ${lvl} 楼。楼上的室内导航即将推出。`
          : `${svcName} is on Level ${lvl}. In-building navigation for upper floors is coming soon.`,
      distanceM,
    };
  }

  if (isLast) {
    return {
      kind: "arrived",
      title: language === "zh" ? "您已到达" : "You've arrived",
      sub: language === "zh" ? `${svcName} 就在这里。` : `${svcName} is right here.`,
      distanceM: 0,
    };
  }

  const floorChange = !!(next && next.floorId !== current.floorId);
  if (floorChange) {
    const goingUp = next!.floorId > current.floorId; // "L2" > "L1"
    const word = transitWord(current.segmentKey, language) ?? (language === "zh" ? "电梯" : "lift");
    return {
      kind: "transit",
      title:
        language === "zh"
          ? `乘${word}前往 ${next!.floorId}`
          : `Take the ${word} ${goingUp ? "up" : "down"} to ${next!.floorId}`,
      sub:
        language === "zh"
          ? `${word}就在前方，跟着指示牌走。`
          : `The ${word} is just ahead — follow the signs.`,
      distanceM,
    };
  }

  const nextWord = next && isTransit(next.segmentKey) ? transitWord(next.segmentKey, language) : null;
  const title = nextWord
    ? language === "zh"
      ? `步行前往${nextWord}`
      : `Walk to the ${nextWord}`
    : language === "zh"
      ? `步行前往 ${svcName}`
      : `Walk to ${svcName}`;
  const sub = nextWord
    ? language === "zh"
      ? `继续往前走，${nextWord}就在附近。`
      : `Head straight ahead — the ${nextWord} is nearby.`
    : language === "zh"
      ? `继续往前走，${svcName} 就在前方。`
      : `Keep going straight — ${svcName} is just ahead.`;
  return { kind: "walk", title, sub, distanceM };
}
