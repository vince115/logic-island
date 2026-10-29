'use client';

import { useEffect, useMemo, useRef } from 'react';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Box3, Vector3 } from 'three';
import { getFocusBounds, getWorldBounds } from '@/lib/islands/data';
import type { IslandDefinition } from '@/lib/islands/types';

export function CameraController({islands,selectedId,reducedMotion}:{islands:IslandDefinition[];selectedId:string|null;reducedMotion:boolean}) {
  const controls=useRef<CameraControlsImpl>(null);
  const initialized=useRef(false);
  const {width,height}=useThree(state=>state.size);
  const selected=islands.find(i=>i.id===selectedId);
  const bounds=useMemo(()=>selected?getFocusBounds(selected):getWorldBounds(islands),[selected,islands]);
  useEffect(()=>{
    const controller=controls.current;
    if(!controller||!width||!height) return;
    const box=new Box3(new Vector3(...bounds.min),new Vector3(...bounds.max));
    const center=box.getCenter(new Vector3());
    const animate=initialized.current&&!reducedMotion;
    // A single owner controls both position and target; cancel superseded transitions.
    controller.stop();
    void controller.setLookAt(center.x+20,center.y+19,center.z+24,center.x,center.y,center.z,animate);
    void controller.fitToBox(box,animate,{
      cover:false,paddingTop:.9,paddingBottom:.9,
      paddingLeft:width<700?.7:1.5,paddingRight:width<700?.7:1.5,
    });
    initialized.current=true;
  },[bounds,width,height,reducedMotion]);
  return <CameraControls ref={controls} makeDefault smoothTime={.65}
    minZoom={4} maxZoom={150}
    mouseButtons={{left:CameraControlsImpl.ACTION.NONE,middle:CameraControlsImpl.ACTION.NONE,right:CameraControlsImpl.ACTION.NONE,wheel:CameraControlsImpl.ACTION.NONE}}
    touches={{one:CameraControlsImpl.ACTION.NONE,two:CameraControlsImpl.ACTION.TOUCH_ZOOM,three:CameraControlsImpl.ACTION.NONE}}/>;
}
