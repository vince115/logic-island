'use client';

import { Component, Fragment, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { PCFShadowMap, type OrthographicCamera } from 'three';
import type { Vec3 } from '@/lib/islands/stage-pose';
import { canvasSlot, type SharedFiber } from '../islands/hex-world/canvas-slot';

/*
 * P9.8c (LOGIC_ISLAND_P9_SHARED_CANVAS=1): the one canvas the P9 world (`/`) and the CS region page (`/cs`) draw in.
 *
 * Lifecycle. The host lives in the root layout, so it stays while the page changes. Its canvas is rendered through a
 * portal into a container element made once, outside React's tree (React never creates or removes it); the host moves
 * that container into the stage the current page registered (canvas-slot.ts), as the stage's first child, so the page's
 * labels and controls lie over the canvas exactly as over a canvas of its own. The canvas, its WebGL context, renderer
 * and camera therefore stay as the page changes between `/` and `/cs`; anywhere else the host draws nothing and the
 * canvas is released (the other four regions keep a canvas of their own, P9.8b).
 *
 * A page change is one step: the old page releases its scene and the new one registers its own in the same commit; the
 * canvas's content (SlotContent, which subscribes to the slot itself, so the change is a synchronous update of the
 * canvas's React root, committed before the browser paints), its size (StageSize) and its place (the container) change
 * together, and the frame the new scene asks for is drawn before that paint too.
 *
 * Context loss: the canvas stops (it is unmounted, so no frozen picture stays), the slot is marked lost and the page
 * shows its own way without 3D (the world's guide, the region's island list); a new canvas comes only when the user asks
 * (canvasSlot.retry), never by itself.
 *
 * R3F itself (Canvas, useThree) comes from the scenes through the slot (canvas-slot.ts SharedFiber), so this chunk does
 * not carry a copy of R3F's entry module next to the scenes' own; the canvas is made once the first scene registers.
 */
const SHARED_PATHS = new Set(['/', '/cs']);
/**
 * The scenes' static shadow map (hex-environment.tsx STATIC_SHADOW_MAP, which both scenes use), written out here so
 * the host does not bring that module's code into its own chunk.
 */
const SHADOWS = { enabled: true, type: PCFShadowMap, autoUpdate: false } as const;

/** The scene the current page registered: a new id mounts a new scene, the same id updates it. */
function SlotContent() {
  const entry = useSyncExternalStore(canvasSlot.subscribe, canvasSlot.entry, canvasSlot.entry);
  return entry ? <Fragment key={entry.id}>{entry.content}</Fragment> : null;
}

/** The canvas's size follows its stage at once (R3F would follow a frame later, measuring by itself). */
function StageSize({ useThree }: Pick<SharedFiber, 'useThree'>) {
  const setSize = useThree(state => state.setSize), invalidate = useThree(state => state.invalidate);
  const stage = useSyncExternalStore(canvasSlot.subscribe, () => canvasSlot.entry()?.stage ?? null, () => null);
  useLayoutEffect(() => {
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) setSize(box.width, box.height, box.top, box.left);
    invalidate();
  }, [stage, setSize, invalidate]);
  return null;
}

/** The camera as a pose in the host's common space, for the scene that comes next (canvasSlot.release); the canvas's name; its context loss. */
function Lifecycle({ useThree }: Pick<SharedFiber, 'useThree'>) {
  const get = useThree(state => state.get);
  const label = useSyncExternalStore(canvasSlot.subscribe, () => canvasSlot.entry()?.label ?? '', () => '');
  useLayoutEffect(() => {
    canvasSlot.setPoseReader(frame => {
      const { camera, gl } = get();
      camera.updateMatrixWorld();
      const e = camera.matrixWorld.elements, p = camera.position, box = gl.domElement.getBoundingClientRect();
      const column = (i: number): Vec3 => { const v: Vec3 = [e[i], e[i + 1], e[i + 2]], n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
      const back = column(8);
      return {
        centre: [frame.offset[0] + frame.scale * p.x, frame.offset[1] + frame.scale * p.y, frame.offset[2] + frame.scale * p.z],
        zoom: (camera as OrthographicCamera).zoom / frame.scale, forward: [-back[0], -back[1], -back[2]], right: column(0), up: column(4),
        rect: { left: box.left, top: box.top, width: box.width, height: box.height },
      };
    });
    return () => canvasSlot.setPoseReader(null);
  }, [get]);
  useEffect(() => {
    const canvas = get().gl.domElement;
    canvas.setAttribute('role', 'img');
    if (label) canvas.setAttribute('aria-label', label);
  }, [get, label]);
  useEffect(() => {
    const canvas = get().gl.domElement;
    // preventDefault keeps the context restorable; the host still drops this canvas (see above).
    const lost = (event: Event) => { event.preventDefault(); canvasSlot.setLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [get]);
  return null;
}

/** A canvas that cannot start (no WebGL) counts as lost: the page shows its way without 3D. */
class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { canvasSlot.setLost(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const noSubscription = () => () => {};
export default function P9SharedStage() {
  const path = usePathname(), active = SHARED_PATHS.has(path);
  const client = useSyncExternalStore(noSubscription, () => true, () => false);
  const stage = useSyncExternalStore(canvasSlot.subscribe, () => canvasSlot.entry()?.stage ?? null, () => null);
  const lost = useSyncExternalStore(canvasSlot.subscribe, canvasSlot.lost, () => false);
  const fiber = useSyncExternalStore(canvasSlot.subscribe, canvasSlot.fiber, () => null);
  // Made once on the client and never by React: moving it between stages cannot remount what it holds.
  const [container] = useState(() => {
    if (typeof document === 'undefined') return null;
    const element = document.createElement('div');
    element.style.display = 'contents';
    element.dataset.sharedCanvas = '';
    return element;
  });
  const drawing = Boolean(client && container && active && !lost);
  useLayoutEffect(() => {
    if (!container) return;
    if (drawing && stage) { if (stage.firstChild !== container) stage.prepend(container); } else container.remove();
  }, [container, drawing, stage]);
  // A retry asks for a new canvas (a new WebGL context): a new key.
  const [generation, setGeneration] = useState(0), [wasLost, setWasLost] = useState(lost);
  if (wasLost !== lost) { setWasLost(lost); if (!lost) setGeneration(n => n + 1); }
  if (!drawing || !container || !fiber) return null;
  const { Canvas, useThree } = fiber;
  return createPortal(<CanvasBoundary key={generation}>
    <Canvas orthographic frameloop="demand" dpr={[1, 1.5]} shadows={SHADOWS} camera={{ position: [0, 40, 60], zoom: 10, near: .1, far: 500 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}>
      <Lifecycle useThree={useThree}/>
      <StageSize useThree={useThree}/>
      <SlotContent/>
    </Canvas>
  </CanvasBoundary>, container);
}
