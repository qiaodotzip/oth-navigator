import { Book, FirstAid, Info, SoccerBall, Receipt, Storefront, IconProps } from "phosphor-react";
import { ComponentType } from "react";

export const ICONS: Record<string, ComponentType<IconProps>> = {
  info: Info,
  book: Book,
  hospital: FirstAid,
  soccer: SoccerBall,
  receipt: Receipt,
  shop: Storefront,
};

export function ServiceIcon({ iconKey, size = 32 }: { iconKey: string; size?: number }) {
  const Cmp = ICONS[iconKey] ?? Info;
  return <Cmp size={size} weight="duotone" />;
}
