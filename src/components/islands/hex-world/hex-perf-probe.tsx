'use client';

import { useEffect } from 'react';
import { Box3, Spherical, Vector3, type Color, type DirectionalLight, type HemisphereLight, type Light, type Mesh, type MeshStandardMaterial, type OrthographicCamera } from 'three';
import { useThree } from '@react-three/fiber';
import type { CameraControlsImpl } from '@react-three/drei';
import { VIEW } from './hex-camera';

/*
 * D.3-1: moved out of hex-world-scene.tsx unchanged and loaded lazily, so only scenes with `perfProbe` (the scale
 * prototype and the lab preset) ever download it; the production preset never sets it.
 */
type PerfStats = { calls: number; triangles: number; geometries: number; meshes: number; instanced: number; instances: number; shadowCasters: number };
type DrawnObject = { center: number[]; size: number[]; materials: string[]; instanced: boolean };

/**
 * Prototype-only: `canvas.__hexPerf()` renders one frame and returns its draw stats (shadow pass included, unless
 * the shadow map is static and up to date; `__hexPerf(true)` redraws it). `__hexDraws()` lists what the main pass drew.
 * For review screenshots, `__hexProject(x, y, z)` gives the canvas position of a map point and
 * `__hexView(x, y, z, zoom)` looks at a map point at a given zoom (`__hexZoom()` reads the current one).
 * D.3-5a: `__hexCamera()` reads the camera: azimuth and elevation in degrees, zoom and its limits, the focal offset
 * and the touch-action of the element the controls listen on.
 * D.3-6a: `__hexEnvironment()` reads what the scene draws around the map (background, fog, lights, the sun's shadow and
 * shadow map), and which meshes use each material with the glowing ones' emissive intensity.
 */
export default function PerfProbe({ox,oz}:{ox:number;oz:number}) {
  const {gl,scene,camera,invalidate,events}=useThree();
  const controls=useThree(state=>state.controls) as CameraControlsImpl|null;
  useEffect(()=>{
    const project=(x:number,y:number,z:number)=>{
      const v=new Vector3(x-ox,y,z-oz).project(camera),{width,height}=gl.domElement.getBoundingClientRect();
      return [(v.x+1)/2*width,(1-v.y)/2*height];
    };
    const view=(x:number,y:number,z:number,zoom:number)=>{
      const target=new Vector3(x-ox,y,z-oz),eye=target.clone().addScaledVector(VIEW,40);
      void controls?.setLookAt(eye.x,eye.y,eye.z,target.x,target.y,target.z,false);
      void controls?.setFocalOffset(0,0,0,false);
      void controls?.zoomTo(zoom,false);
      invalidate();
    };
    const read=()=>{
      if(!controls) return null;
      const {theta,phi}=controls.getSpherical(new Spherical(),false),offset=controls.getFocalOffset(new Vector3(),false);
      const degrees=(radians:number)=>radians*180/Math.PI;
      return {azimuth:degrees(Math.atan2(Math.sin(theta),Math.cos(theta))),elevation:90-degrees(phi),zoom:camera.zoom,minZoom:controls.minZoom,maxZoom:controls.maxZoom,
        offset:[offset.x,offset.y],distance:controls.distance,touchAction:(events.connected as HTMLElement|undefined)?.style.touchAction??null,active:controls.active};
    };
    Object.assign(gl.domElement,{__hexProject:project,__hexView:view,__hexZoom:()=>camera.zoom,__hexCamera:read});
  },[gl,camera,controls,events,ox,oz,invalidate]);
  useEffect(()=>{
    const probe=(freshShadows=false):PerfStats=>{
      // `freshShadows` redraws the shadow map in this frame even when it is static (D.2c-2 checks).
      if(freshShadows) gl.shadowMap.needsUpdate=true;
      gl.render(scene,camera);
      const {calls,triangles}=gl.info.render;
      let meshes=0,instanced=0,instances=0,shadowCasters=0;
      scene.traverseVisible(o=>{
        const m=o as Mesh&{isInstancedMesh?:boolean;count?:number};
        if(!m.isMesh) return;
        if(m.isInstancedMesh){instanced++;instances+=m.count??0;} else meshes++;
        if(m.castShadow) shadowCasters++;
      });
      return {calls,triangles,geometries:gl.info.memory.geometries,meshes,instanced,instances,shadowCasters};
    };
    // D.3-0: what the main pass draws in one frame, per object, in map coordinates, so draw calls can be split by
    // island. An object counts once it passes culling and still has instances after its own hook (LOD trees).
    const draws=():DrawnObject[]=>{
      const drawn:Mesh[]=[],hooks=new Map<Mesh,Mesh['onBeforeRender']>();
      scene.traverse(o=>{
        const mesh=o as Mesh&{isInstancedMesh?:boolean;count?:number};
        if(!mesh.isMesh) return;
        const own=mesh.onBeforeRender;
        hooks.set(mesh,own);
        mesh.onBeforeRender=(...args)=>{own.apply(mesh,args);if(!mesh.isInstancedMesh||mesh.count!==0) drawn.push(mesh);};
      });
      gl.render(scene,camera);
      hooks.forEach((own,mesh)=>{mesh.onBeforeRender=own;});
      return [...new Set(drawn)].map(mesh=>{
        const box=new Box3().setFromObject(mesh),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
        const materials=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>m.uuid);
        return {center:[center.x+ox,center.y,center.z+oz],size:size.toArray(),materials,instanced:(mesh as {isInstancedMesh?:boolean}).isInstancedMesh===true};
      });
    };
    Object.assign(gl.domElement,{__hexPerf:probe,__hexDraws:draws});
  },[gl,scene,camera,ox,oz]);
  useEffect(()=>{
    const hex=(color:Color)=>`#${color.getHexString()}`;
    const environment=()=>{
      const lights:Record<string,unknown>[]=[],materials=new Map<string,{name:string;glow:number|null;meshes:string[]}>();
      scene.traverse(o=>{
        if((o as Light).isLight){
          const light=o as Light,sun=o as DirectionalLight,box=sun.shadow?.camera as OrthographicCamera|undefined;
          lights.push({type:light.type,color:hex(light.color),intensity:light.intensity,
            ...((o as HemisphereLight).isHemisphereLight?{ground:hex((o as HemisphereLight).groundColor)}:{}),
            ...(sun.isDirectionalLight?{position:sun.position.toArray(),castShadow:sun.castShadow,shadow:{mapSize:sun.shadow.mapSize.toArray(),
              bias:sun.shadow.bias,normalBias:sun.shadow.normalBias,box:[box!.left,box!.right,box!.top,box!.bottom,box!.far]}}:{})});
        }
        const mesh=o as Mesh;
        if(!mesh.isMesh) return;
        for(const material of [mesh.material].flat()){
          const standard=material as MeshStandardMaterial,glowing=standard.isMeshStandardMaterial&&standard.emissiveIntensity>0&&standard.emissive.getHex()!==0;
          const entry=materials.get(material.uuid)??{name:material.name,glow:glowing?standard.emissiveIntensity:null,meshes:[]};
          entry.meshes.push(mesh.name||((mesh as {isInstancedMesh?:boolean}).isInstancedMesh?'InstancedMesh':mesh.type));
          materials.set(material.uuid,entry);
        }
      });
      const fog=scene.fog as {color:Color;near:number;far:number}|null;
      return {background:hex(scene.background as Color),fog:fog&&{color:hex(fog.color),near:fog.near,far:fog.far},lights,
        shadowMap:{enabled:gl.shadowMap.enabled,type:gl.shadowMap.type,autoUpdate:gl.shadowMap.autoUpdate},materials:[...materials.values()]};
    };
    Object.assign(gl.domElement,{__hexEnvironment:environment});
  },[gl,scene]);
  return null;
}

