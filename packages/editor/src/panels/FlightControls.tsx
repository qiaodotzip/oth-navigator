import { live, type Portal, type PortalEndpoint } from "@oth/model";
import { DEFAULT_SHAFT_M, nextStopAbove } from "@oth/renderer";
import type { Saver } from "../state/save";
import { useEditorStore } from "../state/store";
import { Button } from "../ui/Button";

/**
 * How this stop is built in 3D, and the one thing a person decides about it:
 * which way its flight climbs (spec §7).
 */
export function FlightControls({ saver, endpoint, portal }: { saver: Saver; endpoint: PortalEndpoint; portal: Portal }) {
  const model = useEditorStore(s => s.model);
  if (!model) return null;
  const code = (levelId: string) => model.levels.find(l => l.id === levelId)?.code ?? levelId;

  if (portal.kind === "lift") {
    return (
      <p className="text-xs text-stone-600">
        {endpoint.footprint
          ? "Built in 3D as a shaft of its traced outline."
          : `Built in 3D as a ${DEFAULT_SHAFT_M} m shaft. To use the drawing's outline, select the lift's space on Entrances & lifts and choose Lift.`}
      </p>
    );
  }

  const above = nextStopAbove(model, endpoint);
  if (!above) {
    const below = live(model.portalEndpoints)
      .find(e => e.portalId === portal.id && nextStopAbove(model, e)?.id === endpoint.id);
    return (
      <p className="text-xs text-stone-600">
        {below ? `Its flight up to here is set on the ${code(below.levelId)} stop.` : "Add its next stop up to build a flight."}
      </p>
    );
  }

  const outline = endpoint.footprint ?? above.footprint;
  // As 3D reads it (portalParts): this stop's flag turns its flight round, and
  // so does one on the stop it climbs to when that is the top stop, which has
  // no flight of its own. The API or Claude can set that one.
  const topFlag = above.flipped && !nextStopAbove(model, above);
  const flipped = endpoint.flipped || topFlag;

  const flip = async () => {
    if (!flipped) {
      await saver.update("portalEndpoint", endpoint.id, endpoint.version, { flipped: true });
      return;
    }
    // Either flag alone keeps it turned round, so turning it back clears both.
    if (endpoint.flipped && !(await saver.update("portalEndpoint", endpoint.id, endpoint.version, { flipped: false }))) return;
    if (topFlag) await saver.update("portalEndpoint", above.id, above.version, { flipped: false });
  };

  return (
    <div className="space-y-2 text-xs text-stone-600">
      <p>
        {outline
          ? `Built in 3D as a flight up to ${code(above.levelId)}.`
          : "No outline yet, so 3D shows only a marker. Select its space on Entrances & lifts and choose its kind to give it one."}
      </p>
      {outline && (
        // Filled while pressed, as the preview's toggles are.
        <Button size="sm" variant={flipped ? "primary" : "secondary"} aria-pressed={flipped} onClick={() => void flip()}>
          Flip direction
        </Button>
      )}
    </div>
  );
}
