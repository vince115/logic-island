'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { getFocusBounds, getWorldBounds } from '@/lib/islands/data';
import type { IslandDefinition } from '@/lib/islands/types';

// About 40° above the water, looking from the south-east like a board on a table.
const VIEW = new Vector3(16, 21, 24).normalize();
const UP = new Vector3(0, 1, 0);

/**
 * Isometric framing for the hex preview. CameraControls.fitToBox snaps to the nearest axis
 * (a flat side view here), so this keeps the view direction and fits with orthographic zoom instead.
 */
export function HexCamera({frames,selectedId,reducedMotion}:{frames:IslandDefinition[];selectedId:string|null;reducedMotion:boolean}) {
  const controls=useRef<CameraControlsImpl>(null);
  const initialized=useRef(false);
  const {width,height}=useThree(state=>state.size);
  const selected=frames.find(i=>i.id===selectedId);
  const bounds=useMemo(()=>selected?getFocusBounds(selected):getWorldBounds(frames),[selected,frames]);
  useEffect(()=>{
    const controller=controls.current;
    if(!controller||!width||!height) return;
    const min=new Vector3(...bounds.min),max=new Vector3(...bounds.max);
    const center=min.clone().add(max).multiplyScalar(.5);
    const right=new Vector3().crossVectors(UP,VIEW).normalize(),up=new Vector3().crossVectors(VIEW,right);
    let halfWidth=0,halfHeight=0;
    for(const x of [min.x,max.x]) for(const y of [min.y,max.y]) for(const z of [min.z,max.z]){
      const offset=new Vector3(x,y,z).sub(center);
      halfWidth=Math.max(halfWidth,Math.abs(offset.dot(right)));
      halfHeight=Math.max(halfHeight,Math.abs(offset.dot(up)));
    }
    // An orthographic camera shows width/zoom world units across, so zoom = pixels / units.
    const pad=width<700?1.15:1.12;
    const zoom=Math.min(width/(2*halfWidth*pad),height/(2*halfHeight*pad));
    const eye=center.clone().addScaledVector(VIEW,40);
    const animate=initialized.current&&!reducedMotion;
    controller.stop();
    void controller.setLookAt(eye.x,eye.y,eye.z,center.x,center.y,center.z,animate);
    void controller.zoomTo(zoom,animate);
    initialized.current=true;
  },[bounds,width,height,reducedMotion]);
  return <CameraControls ref={controls} makeDefault smoothTime={.65}
    minZoom={4} maxZoom={150}
    mouseButtons={{left:CameraControlsImpl.ACTION.NONE,middle:CameraControlsImpl.ACTION.NONE,right:CameraControlsImpl.ACTION.NONE,wheel:CameraControlsImpl.ACTION.NONE}}
    touches={{one:CameraControlsImpl.ACTION.NONE,two:CameraControlsImpl.ACTION.TOUCH_ZOOM,three:CameraControlsImpl.ACTION.NONE}}/>;
}
