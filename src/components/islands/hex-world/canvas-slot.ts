import type { ReactNode } from 'react';
import type { Canvas, useThree } from '@react-three/fiber';
import type { SceneFrame, StagePose } from '@/lib/islands/stage-pose';

/*
 * P9.8c: one canvas for several pages. A host (src/components/p9/shared-stage.tsx) keeps a single R3F canvas, and with
 * it its WebGL context, renderer and camera, for as long as it lives; a page registers here the element the canvas
 * belongs in (its stage), the scene to draw and where that scene's space sits in the host's common space. The host
 * moves the canvas into the stage and draws the scene. When the page changes, the old page releases and the new one
 * registers in the same commit, so the canvas is never rebuilt; the camera pose the old scene left (read through the
 * host when it releases) waits here for the new scene to start from.
 */
/**
 * R3F as the scenes load it. The host draws with these rather than importing R3F itself: its own lazy chunk would
 * otherwise carry a second copy of R3F's entry module (about 14 KB), which the scenes' chunks already bring.
 */
export interface SharedFiber { Canvas: typeof Canvas; useThree: typeof useThree }

export interface SlotEntry {
  /** One scene per id; a new id is a new scene (its content mounts afresh). */
  id: string;
  stage: HTMLElement;
  content: ReactNode;
  frame: SceneFrame;
  /** The canvas's accessible name while this scene is drawn. */
  label: string;
  /** The canvas can no longer draw (its WebGL context was lost): the page shows its own way without it. */
  onUnavailable: () => void;
  /** The scene's R3F (see SharedFiber). */
  fiber: SharedFiber;
}

type Listener = () => void;
let entry: SlotEntry | null = null, pose: StagePose | null = null, lost = false;
let fiber: SharedFiber | null = null;
let readPose: ((frame: SceneFrame) => StagePose | null) | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(listener => listener());

export const canvasSlot = {
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  entry: () => entry,
  lost: () => lost,
  /** R3F from the first scene registered; kept while the slot is empty, so the canvas stays (e.g. behind CS's list). */
  fiber: () => fiber,
  /** Registers (or updates) the scene drawn now. */
  register(next: SlotEntry) { entry = next; fiber ??= next.fiber; emit(); },
  /** The scene leaves: the camera pose it leaves is kept for the next scene (takePose), and the slot is empty. */
  release(id: string) {
    if (entry?.id !== id) return;
    pose = readPose?.(entry.frame) ?? null;
    entry = null;
    emit();
  },
  /** The pose the last scene left, once: a scene that mounts takes it, and it is gone. */
  takePose() { const taken = pose; pose = null; return taken; },
  /** For the host: how to read the shared camera as a pose in common space for a scene's frame. */
  setPoseReader(reader: typeof readPose) { readPose = reader; },
  /** For the host: the canvas lost its WebGL context (once lost, the slot stays lost until retry). */
  setLost() { if (lost) return; lost = true; entry?.onUnavailable(); emit(); },
  /** Asks the host for a new canvas after a lost one (the user's choice: never automatic). */
  retry() { if (!lost) return; lost = false; emit(); },
};
