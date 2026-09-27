import type { Level } from "@oth/model";
import { useState } from "react";
import { floorProgress } from "../flow/floorProgress";
import { sortedLevels } from "../flow/floors";
import { followLink, href, type FloorTab } from "../route";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";
import { Popover, PopoverClose } from "../ui/Popover";
import { Progress } from "../ui/Progress";
import { YoursTag } from "../ui/YoursTag";
import { OwnerAvatars } from "./OwnerAvatars";

/** "L1 · Yours ▾": every floor with its owners and build progress, one click away. */
export function FloorSwitcher({ current, tab }: { current: Level; tab: FloorTab }) {
  const [open, setOpen] = useState(false);
  const model = useEditorStore(s => s.model);
  const report = useEditorStore(s => s.report);
  const levelImages = useEditorStore(s => s.levelImages);
  const me = useEditorStore(s => s.user);
  const mine = (l: Level) => Boolean(me && l.ownerIds.includes(me.id));

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm" aria-label={`Floor ${current.code}, change floor`}>
          <span className="text-base font-bold">{current.code}</span>
          {mine(current) && <YoursTag />}
          <span aria-hidden>▾</span>
        </Button>
      }
    >
      {/* Every entity write refreshes model/report/levelImages, and this list is
          handed to Popover as children — evaluated by this component whether or
          not Radix mounts it. Building it only while open keeps floorProgress's
          per-floor work off the hot path of every edit anywhere in the app. */}
      {open && (
        <ul className="w-80">
          {sortedLevels(model).map(level => {
            const to = href({ name: "floor", code: level.code, tab, params: {} });
            const build = model ? floorProgress(model, report, levelImages, level.id).build : null;
            return (
              <li key={level.id}>
                <PopoverClose asChild>
                  <a
                    href={to}
                    onClick={followLink(to)}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 hover:bg-stone-100 ${
                      level.id === current.id ? "bg-stone-100" : ""
                    }`}
                  >
                    <span className="w-8 font-semibold">{level.code}</span>
                    <span className="min-w-0 flex-1 truncate text-stone-600">{level.nameEn}</span>
                    {mine(level) && <YoursTag />}
                    <OwnerAvatars ids={level.ownerIds} size={20} />
                    {build && (
                      <span className="w-14">
                        <Progress value={build.done} max={build.total} label={`${level.code} build progress`} />
                      </span>
                    )}
                  </a>
                </PopoverClose>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}
