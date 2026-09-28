import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { blocksGeometry } from "./blocks";
import { railBlock, wallBlock } from "./levelParts";
import type { LevelStructure } from "./structure";
import { roomColor, wallColor } from "./theme";
import { BALUSTRADE_COLOUR, BALUSTRADE_OPACITY } from "./voids";
import type { WallPiece } from "./wallPlan";

/**
 * A level's walls and balustrades. The walls of the selected room are drawn
 * in the selection colour, as its shell used to be. Walls take no clicks:
 * a wall can belong to two rooms, and the floor says which one you meant.
 *
 * Every other wall shares one material, since coincident faces only fight
 * across materials. The selected room's walls are the one exception, so they
 * are pulled forward in depth to win wherever they meet a neighbour's at a
 * corner.
 */
export function StructureMesh({ structure, fullHeight, ghosted, selectedId }: {
  structure: LevelStructure;
  fullHeight: boolean;
  ghosted: boolean;
  selectedId: string | null;
}) {
  const { plain, picked } = useMemo(() => {
    const block = (w: WallPiece) => wallBlock(w, structure.heightByRoom, fullHeight);
    const mine = (w: WallPiece) => selectedId !== null && w.rooms.includes(selectedId);
    return {
      plain: blocksGeometry(structure.walls.filter(w => !mine(w)).map(block)),
      picked: blocksGeometry(structure.walls.filter(mine).map(block)),
    };
  }, [structure, fullHeight, selectedId]);
  const rails = useMemo(() => blocksGeometry(structure.balustrades.map(railBlock)), [structure]);
  useEffect(() => () => {
    plain.dispose();
    picked.dispose();
  }, [plain, picked]);
  useEffect(() => () => rails.dispose(), [rails]);

  return (
    <group>
      <mesh geometry={plain} castShadow receiveShadow>
        <meshStandardMaterial
          color={wallColor("room", { ghosted })}
          transparent={ghosted}
          opacity={ghosted ? 0.25 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {!ghosted && (
        <mesh geometry={picked} castShadow>
          <meshStandardMaterial
            color={roomColor("room", { selected: true })}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      <mesh geometry={rails}>
        <meshStandardMaterial color={BALUSTRADE_COLOUR} transparent opacity={ghosted ? 0.2 : BALUSTRADE_OPACITY} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
