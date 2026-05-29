import * as THREE from "three";

/**
 * Live pose of the guide in scene space. UserBlob writes to it every frame while
 * walking a route; CameraRig reads it to follow (GPS-style chase cam). Kept as a
 * plain mutable object (not store state) so per-frame updates don't trigger React.
 */
export const guidePose = {
  pos: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  /** true while the guide is actively walking a route leg */
  following: false,
};
