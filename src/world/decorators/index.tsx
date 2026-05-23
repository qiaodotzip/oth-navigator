import type { Polygon } from "@/data/types";
import { HawkerDecorator } from "./HawkerDecorator";

type DecoratorComponent = React.ComponentType<{ polygon: Polygon; depth: number }>;

export function getDecorator(p: Polygon): DecoratorComponent | null {
  if (p.id.includes("-room-hawker")) return HawkerDecorator;
  return null;
}
