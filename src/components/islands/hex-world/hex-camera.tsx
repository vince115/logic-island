'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { getFocusBounds, getWorldBounds } from '@/lib/islands/data';
import type { IslandDefinition } from '@/lib/islands/types';

// About 40° above the water, looking from the south-east like a board on a table.
export const VIEW = new Vector3(16, 21, 24).normalize();
const UP = new Vector3(0, 1, 0);

/**
 * Isometric framing for the hex preview. CameraControls.fitToBox snaps to the nearest axis
 * (a flat side view here), so this keeps the view direction and fits with orthographic zoom instead.
 */
export function HexCamera({frames,selectedId,reducedMotion,fit}:{frames:IslandDefinition[];selectedId:string|null;reducedMotion:boolean;
  /** Content points (scene space) to frame instead of the bounding boxes: all of them, and per island. */
  fit?:{all:Vector3[];byId:Record<string,Vector3[]>};
}) {
  const controls=useRef<CameraControlsImpl>(null);
  const initialized=useRef(false);
  const {width,height}=useThree(state=>state.size);
  const selected=frames.find(i=>i.id===selectedId);
  // A box's corners sit far out in empty sea for a diagonal layout, so content points frame much tighter.
  const points=useMemo(()=>{
    if(fit) return selected?fit.byId[selected.id]??fit.all:fit.all;
    const bounds=selected?getFocusBounds(selected):getWorldBounds(frames),out:Vector3[]=[];
    for(const x of [bounds.min[0],bounds.max[0]]) for(const y of [bounds.min[1],bounds.max[1]]) for(const z of [bounds.min[2],bounds.max[2]]) out.push(new Vector3(x,y,z));
    return out;
  },[selected,frames,fit]);
  useEffect(()=>{
    const controller=controls.current;
    if(!controller||!width||!height) return;
    const right=new Vector3().crossVectors(UP,VIEW).normalize(),up=new Vector3().crossVectors(VIEW,right);
    // Extents on screen axes; the center is the middle of those extents (for a box, the box center).
    const rs=points.map(p=>p.dot(right)),us=points.map(p=>p.dot(up)),depth=points.reduce((sum,p)=>sum+p.dot(VIEW),0)/points.length;
    const [r0,r1,u0,u1]=[Math.min(...rs),Math.max(...rs),Math.min(...us),Math.max(...us)];
    const center=right.clone().multiplyScalar((r0+r1)/2).addScaledVector(up,(u0+u1)/2).addScaledVector(VIEW,depth);
    const halfWidth=(r1-r0)/2,halfHeight=(u1-u0)/2;
    // Overlays cover the stage: the caption at the top, the hint bar at the bottom (two rows on phones,
    // one once a settlement is focused there). Frame into the space between them.
    const phone=width<700;
    const top=phone?72:40,bottom=phone?(selected?64:96):56;
    // An orthographic camera shows width/zoom world units across, so zoom = pixels / units.
    const pad=phone?1.1:1.12;
    const zoom=Math.min(width/(2*halfWidth*pad),(height-top-bottom)/(2*halfHeight*pad));
    center.addScaledVector(up,(top-bottom)/(2*zoom));
    const eye=center.clone().addScaledVector(VIEW,40);
    const animate=initialized.current&&!reducedMotion;
    controller.stop();
    void controller.setLookAt(eye.x,eye.y,eye.z,center.x,center.y,center.z,animate);
    void controller.zoomTo(zoom,animate);
    initialized.current=true;
  },[points,width,height,reducedMotion,selected]);
  return <CameraControls ref={controls} makeDefault smoothTime={.65}
    minZoom={4} maxZoom={150}
    mouseButtons={{left:CameraControlsImpl.ACTION.NONE,middle:CameraControlsImpl.ACTION.NONE,right:CameraControlsImpl.ACTION.NONE,wheel:CameraControlsImpl.ACTION.NONE}}
    touches={{one:CameraControlsImpl.ACTION.NONE,two:CameraControlsImpl.ACTION.TOUCH_ZOOM,three:CameraControlsImpl.ACTION.NONE}}/>;
}
