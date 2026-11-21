/*
 * P9.8c: a camera pose handed from one scene to the next in a shared canvas (components/islands/hex-world/canvas-slot.ts).
 * Each scene states where its own space sits in the host's common space (SceneFrame: common = offset + scale · scene);
 * the pose is the orthographic camera's in common space, with where the canvas was on the screen. A scene that comes
 * next turns it into its own camera pose so that every point stays at the same screen pixel, also when its canvas sits
 * elsewhere on the page (the canvas moves with the page's stage). Plain arrays; no renderer.
 */
export type Vec3 = [number, number, number];
export interface SceneFrame { scale: number; offset: readonly [number, number, number] }
export interface ScreenRect { left: number; top: number; width: number; height: number }
export interface StagePose {
  /** A point on the ray through the canvas's centre (the camera's position), common space. */
  centre: Vec3;
  /** Pixels per common unit. */
  zoom: number;
  /** The camera's forward direction, and its screen right and up, in common space (unit vectors). */
  forward: Vec3; right: Vec3; up: Vec3;
  /** Where the canvas was, viewport px. */
  rect: ScreenRect;
}

const add = (a: Vec3, b: readonly number[], k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The common-space point (on its view ray) drawn at the centre of `rect`, a canvas that may sit elsewhere than the pose's. */
export function poseCentredOn(pose: StagePose, rect: ScreenRect): Vec3 {
  const dx = rect.left + rect.width / 2 - (pose.rect.left + pose.rect.width / 2), dy = rect.top + rect.height / 2 - (pose.rect.top + pose.rect.height / 2);
  // Screen y grows downwards.
  return add(add(pose.centre, pose.right, dx / pose.zoom), pose.up, -dy / pose.zoom);
}

/** Whether the pose looks along `view` (the direction from the target to the camera), within a tenth of a degree. */
export function looksAlong(pose: StagePose, view: readonly number[]) {
  const dot = -(pose.forward[0] * view[0] + pose.forward[1] * view[1] + pose.forward[2] * view[2]);
  return dot > Math.cos(Math.PI / 1800);
}

/**
 * The pose as a hex map camera's handover (hex-camera.tsx CameraHandover) for a scene with `frame`, whose canvas is
 * `rect`: the target is the point at the canvas's centre where its view ray meets the scene's water plane (y = 0), so
 * it lies inside the map and the camera turns about it as about any target; zoom in px per scene unit; the angles are
 * camera-controls' (azimuth from +z about the vertical, polar from straight up).
 */
export function handoverFor(pose: StagePose, rect: ScreenRect, frame: SceneFrame) {
  const point = poseCentredOn(pose, rect), f = pose.forward;
  const local: Vec3 = [(point[0] - frame.offset[0]) / frame.scale, (point[1] - frame.offset[1]) / frame.scale, (point[2] - frame.offset[2]) / frame.scale];
  if (Math.abs(f[1]) < 1e-6) return undefined;
  const t = -local[1] / f[1];
  return { target: add(local, f, t), zoom: pose.zoom * frame.scale, azimuth: Math.atan2(-f[0], -f[2]), polar: Math.acos(-f[1]) };
}
