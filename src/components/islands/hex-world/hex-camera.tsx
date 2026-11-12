'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Spherical, Vector3 } from 'three';
import { getFocusBounds, getWorldBounds } from '@/lib/islands/data';
import { WATER_LEVEL } from '@/lib/islands/hex-world';
import type { IslandDefinition } from '@/lib/islands/types';

// About 40° above the water, looking from the south-east like a board on a table.
export const VIEW = new Vector3(16, 21, 24).normalize();
const UP = new Vector3(0, 1, 0);
const {ACTION}=CameraControlsImpl;
// VIEW as camera-controls angles: azimuth around the vertical axis from +z, polar angle down from straight up.
const AZIMUTH=Math.atan2(VIEW.x,VIEW.z),POLAR=Math.acos(VIEW.y);
const DISTANCE=40;
const DEGREE=Math.PI/180;

/**
 * D.3-5a free camera limits, in plain numbers (a later world file may carry them): the camera stays 28°–60° above
 * the water; zoom goes from 85% of the overview (at any azimuth) to twice the closest island focus, at most 150.
 * D.3-5b: Auto Orbit turns the overview at `orbit` degrees a second.
 */
export const FREE_CAMERA={elevation:[28,60],zoomOut:.85,zoomIn:2,maxZoom:150,orbit:6} as const;

/** What the free camera reports once it settles: its angles in radians (null while it looks along VIEW), and whether
 * the view differs from the default overview, which「返回全景」restores. */
export type CameraView={azimuth:number|null;polar:number|null;changed:boolean};

/** The view direction for camera-controls angles. */
export function viewAt(azimuth:number,polar:number) {
  return new Vector3().setFromSphericalCoords(1,polar,azimuth);
}
/** `a - b` wrapped to (-π, π]. */
const turn=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));

/**
 * Where the camera looks and how far it zooms to fit `points` seen along `view`, between the overlays: the caption
 * at the top, the hint bar at the bottom (two rows on phones, one once a settlement is focused there). `shift` is how
 * far the view moves along the screen's up so the content sits between them. 2026-11-02: `insetRight` pixels on the
 * right are covered by a panel (the home page's island list); the content fits left of it and `side` moves the view
 * along the screen's right by half that width. 0 (the default) frames exactly as before.
 */
function frame(points:Vector3[],view:Vector3,width:number,height:number,focused:boolean,insetRight=0) {
  const right=new Vector3().crossVectors(UP,view).normalize(),up=new Vector3().crossVectors(view,right);
  // Extents on screen axes; the center is the middle of those extents (for a box, the box center).
  const rs=points.map(p=>p.dot(right)),us=points.map(p=>p.dot(up)),depth=points.reduce((sum,p)=>sum+p.dot(view),0)/points.length;
  const [r0,r1,u0,u1]=[Math.min(...rs),Math.max(...rs),Math.min(...us),Math.max(...us)];
  const center=right.clone().multiplyScalar((r0+r1)/2).addScaledVector(up,(u0+u1)/2).addScaledVector(view,depth);
  const halfWidth=(r1-r0)/2,halfHeight=(u1-u0)/2;
  const phone=width<700;
  const top=phone?72:40,bottom=phone?(focused?64:96):56;
  // An orthographic camera shows width/zoom world units across, so zoom = pixels / units.
  const pad=phone?1.1:1.12;
  const zoom=Math.min((width-insetRight)/(2*halfWidth*pad),(height-top-bottom)/(2*halfHeight*pad));
  return {center,zoom,up,right,shift:(top-bottom)/(2*zoom),side:insetRight/(2*zoom)};
}

/**
 * Isometric framing for the hex preview. CameraControls.fitToBox snaps to the nearest axis
 * (a flat side view here), so this keeps the view direction and fits with orthographic zoom instead.
 *
 * `free` (D.3-5a, the lab only): the mouse turns the map (left drag) and zooms it (wheel); on touch screens one finger
 * turns it left and right while up and down still scrolls the page, and two fingers zoom. Focusing an island keeps the
 * azimuth; `resetKey` changing (「返回全景」) goes back to VIEW. The content offset is a focal offset, so the map turns
 * around its own center. Without `free` nothing of this applies and the camera behaves exactly as before.
 * `orbit` (D.3-5b) turns the overview on its own, keeping tilt and zoom; any drag, pinch or wheel on the map calls
 * `onOrbitStop`, and the explorer decides everything else (focus, list mode, hidden page,「返回全景」).
 */
export function HexCamera({frames,selectedId,reducedMotion,fit,free=false,resetKey=0,onViewChange,orbit=false,onOrbitStop,insetRight=0,view:base=VIEW}:{frames:IslandDefinition[];selectedId:string|null;reducedMotion:boolean;
  /** Content points (scene space) to frame instead of the bounding boxes: all of them, and per island. */
  fit?:{all:Vector3[];byId:Record<string,Vector3[]>};
  free?:boolean;resetKey?:number;onViewChange?:(view:CameraView)=>void;
  orbit?:boolean;onOrbitStop?:()=>void;
  /** 2026-11-02: pixels on the right covered by a panel over the map (see `frame`); 0 everywhere but the home page. */
  insetRight?:number;
  /** M3.1 (regional world): the default view in place of VIEW, e.g. a region turned on phones; a new one goes back to it. */
  view?:Vector3;
}) {
  const baseAzimuth=Math.atan2(base.x,base.z),basePolar=Math.acos(base.y);
  const controls=useRef<CameraControlsImpl>(null);
  const initialized=useRef(false);
  const {width,height}=useThree(state=>state.size);
  const connected=useThree(state=>state.events.connected) as HTMLElement|undefined;
  const invalidate=useThree(state=>state.invalidate);
  const selected=frames.find(i=>i.id===selectedId);
  // A box's corners sit far out in empty sea for a diagonal layout, so content points frame much tighter.
  const pointsFor=useCallback((island:IslandDefinition|undefined)=>{
    if(fit) return island?fit.byId[island.id]??fit.all:fit.all;
    const bounds=island?getFocusBounds(island):getWorldBounds(frames),out:Vector3[]=[];
    for(const x of [bounds.min[0],bounds.max[0]]) for(const y of [bounds.min[1],bounds.max[1]]) for(const z of [bounds.min[2],bounds.max[2]]) out.push(new Vector3(x,y,z));
    return out;
  },[frames,fit]);
  const points=useMemo(()=>pointsFor(selected),[pointsFor,selected]);
  // Free zoom range for this stage size: the whole world fits at every azimuth, and each island can be looked at closer.
  const zoomRange=useMemo(()=>{
    if(!free||!width||!height) return {min:4,max:150};
    const all=pointsFor(undefined);
    const out=Math.min(...Array.from({length:12},(_,i)=>frame(all,viewAt(AZIMUTH+i*Math.PI/6,POLAR),width,height,false,insetRight).zoom));
    const closest=Math.max(...frames.map(island=>frame(pointsFor(island),base,width,height,true,insetRight).zoom));
    return {min:out*FREE_CAMERA.zoomOut,max:Math.min(FREE_CAMERA.maxZoom,closest*FREE_CAMERA.zoomIn)};
  },[free,width,height,pointsFor,frames,insetRight,base]);
  const framed=useRef<{points:Vector3[];reset:number;base:Vector3;zoom:number|null}|null>(null);
  // Only the free camera listens to「返回全景」in the overview; the fixed one reframes on selection alone, as before.
  const reset=free?resetKey:0;
  useEffect(()=>{
    const controller=controls.current;
    if(!controller||!width||!height) return;
    if(!free){
      const {center,zoom,up,right,shift,side}=frame(points,base,width,height,Boolean(selected),insetRight);
      center.addScaledVector(up,shift).addScaledVector(right,side);
      const eye=center.clone().addScaledVector(base,DISTANCE);
      const animate=initialized.current&&!reducedMotion;
      controller.stop();
      void controller.setLookAt(eye.x,eye.y,eye.z,center.x,center.y,center.z,animate);
      void controller.zoomTo(zoom,animate);
      initialized.current=true;
      return;
    }
    // Free: the first framing and「返回全景」look along VIEW. Otherwise the azimuth stays; a new focus goes back to the
    // default tilt, a resize keeps the current one.
    controller.stop();
    const last=framed.current,current=controller.getSpherical(new Spherical());
    const home=!last||last.reset!==reset||last.base!==base;
    const polar=last?.points===points?current.phi:basePolar;
    const turned=Math.abs(turn(current.theta,baseAzimuth))>1e-4||Math.abs(polar-basePolar)>1e-4;
    const view=home||!turned?base:viewAt(current.theta,polar);
    const {center,zoom,shift,side}=frame(points,view,width,height,Boolean(selected),insetRight);
    const eye=center.clone().addScaledVector(view,DISTANCE);
    const animate=initialized.current&&!reducedMotion;
    void controller.setLookAt(eye.x,eye.y,eye.z,center.x,center.y,center.z,animate);
    // The azimuth adds up full turns; take the short way to the new one.
    controller.normalizeRotations();
    void controller.setFocalOffset(side,-shift,0,animate);
    void controller.zoomTo(zoom,animate);
    framed.current={points,reset,base,zoom:!selected&&view===base?zoom:null};
    initialized.current=true;
  },[points,width,height,reducedMotion,selected,free,reset,insetRight,base,baseAzimuth,basePolar]);
  // camera-controls sets `touch-action: none` on the element it listens on (R3F's wrapper, which also holds the
  // labels) when it connects; free touch only turns sideways, so the page keeps its vertical scroll. Touch keeps the tilt.
  // The wheel zooms without camera-controls' `controlstart`, so it stops Auto Orbit here.
  useEffect(()=>{
    if(!free||!connected) return;
    connected.style.touchAction='pan-y';
    const down=(event:PointerEvent)=>{if(controls.current) controls.current.polarRotateSpeed=event.pointerType==='mouse'?1:0;};
    const wheel=()=>onOrbitStop?.();
    connected.addEventListener('pointerdown',down,{capture:true});
    connected.addEventListener('wheel',wheel,{capture:true,passive:true});
    return ()=>{connected.removeEventListener('pointerdown',down,{capture:true});connected.removeEventListener('wheel',wheel,{capture:true});};
  },[free,connected,onOrbitStop]);
  // The bottom edge of the near plane has to stay above the sea, or a low, zoomed-out view shows the background along
  // the bottom of the stage. An orthographic camera draws the same picture from any distance along its view, so such a
  // view moves the camera further back; the default view stays at DISTANCE. Runs before camera-controls updates.
  const sphere=useMemo(()=>({now:new Spherical(),end:new Spherical(),target:new Vector3(),offset:new Vector3()}),[]);
  useFrame(()=>{
    const controller=controls.current;
    if(!free||!controller) return;
    const phi=Math.max(controller.getSpherical(sphere.now,false).phi,controller.getSpherical(sphere.end,true).phi);
    const reach=height/2/controller.camera.zoom+Math.abs(controller.getFocalOffset(sphere.offset,true).y);
    const need=(reach*Math.sin(phi)+WATER_LEVEL+1-controller.getTarget(sphere.target,false).y)/Math.cos(phi);
    const distance=Math.max(DISTANCE,need);
    if(Math.abs(controller.distance-distance)>1e-3) controller.distance=distance;
  },-2);
  // Report the view once it settles, not while a finger or button still holds it. camera-controls skips `rest` when a
  // move ends exactly on a limit (only `sleep` follows), so the end of a drag and `sleep` report too.
  const holding=useRef(false);
  const report=useCallback(()=>{
    const controller=controls.current;
    if(!controller||!onViewChange) return;
    const {theta,phi}=controller.getSpherical(new Spherical()),zoom=framed.current?.zoom;
    const turned=Math.abs(turn(theta,baseAzimuth))>1e-4||Math.abs(phi-basePolar)>1e-4;
    const zoomed=zoom==null||Math.abs(controller.camera.zoom/zoom-1)>.01;
    onViewChange({azimuth:turned?turn(theta,0):null,polar:turned?phi:null,changed:turned||zoomed});
  },[onViewChange,baseAzimuth,basePolar]);
  const start=useCallback(()=>{holding.current=true;onOrbitStop?.();},[onOrbitStop]);
  const end=useCallback(()=>{holding.current=false;report();},[report]);
  const rest=useCallback(()=>{if(!holding.current) report();},[report]);
  // D.3-5b Auto Orbit: turn the overview around its center. Each turned frame asks for the next one (frameloop
  // "demand"), so frames are drawn only while it turns. A frame after a pause (hidden tab) moves at most 50 ms worth.
  // The overview labels follow every 15°, not every frame.
  const orbiting=free&&orbit&&!selected;
  const sector=useRef<number|null>(null);
  const flying=useMemo(()=>({now:new Spherical(),end:new Spherical(),at:new Vector3(),to:new Vector3(),offset:new Vector3(),offsetEnd:new Vector3()}),[]);
  useEffect(()=>{if(orbiting) invalidate();},[orbiting,invalidate]);
  useFrame((_,delta)=>{
    const controller=controls.current;
    if(!orbiting||!controller) return;
    // A camera flight still on its way (「返回全景」just before the toggle, a resize) lands first: turning with no
    // transition would snap its angles to their end values. Keep the frames coming until it is within about 0.1°
    // (and 0.01 units) of the end, which the first turn then covers unseen.
    const {now,end,at,to,offset,offsetEnd}=flying;
    controller.getSpherical(now,false);controller.getSpherical(end,true);
    if(Math.abs(now.theta-end.theta)>2e-3||Math.abs(now.phi-end.phi)>2e-3
      ||controller.getTarget(at,false).distanceTo(controller.getTarget(to,true))>1e-2
      ||controller.getFocalOffset(offset,false).distanceTo(controller.getFocalOffset(offsetEnd,true))>1e-2){invalidate();return;}
    void controller.rotate(FREE_CAMERA.orbit*DEGREE*Math.min(delta,.05),0,false);
    const turnedTo=Math.floor(controller.azimuthAngle/(15*DEGREE));
    if(turnedTo!==sector.current){sector.current=turnedTo;report();}
  },-3);
  if(!free) return <CameraControls ref={controls} makeDefault smoothTime={.65}
    minZoom={4} maxZoom={150}
    mouseButtons={{left:ACTION.NONE,middle:ACTION.NONE,right:ACTION.NONE,wheel:ACTION.NONE}}
    touches={{one:ACTION.NONE,two:ACTION.TOUCH_ZOOM,three:ACTION.NONE}}/>;
  return <CameraControls ref={controls} makeDefault smoothTime={.65}
    minZoom={zoomRange.min} maxZoom={zoomRange.max}
    minPolarAngle={(90-FREE_CAMERA.elevation[1])*DEGREE} maxPolarAngle={(90-FREE_CAMERA.elevation[0])*DEGREE}
    mouseButtons={{left:ACTION.ROTATE,middle:ACTION.NONE,right:ACTION.NONE,wheel:ACTION.ZOOM}}
    touches={{one:ACTION.TOUCH_ROTATE,two:ACTION.TOUCH_ZOOM,three:ACTION.NONE}}
    onControlStart={start} onControlEnd={end} onRest={rest} onSleep={rest}/>;
}
