'use client';

import { Component, Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  Color, ConeGeometry, DodecahedronGeometry, InstancedMesh, MeshStandardMaterial, Object3D, type Material, type Mesh,
} from 'three';
import { glbAssets } from '@/lib/islands/asset-registry';
import { TREE_NODES, coastRocks, forestInstances, type ForestPatch, type RockInstance, type TreeInstance } from '@/lib/islands/hex-nature-data';
import { TERRAIN_MATERIAL, TERRAIN_PALETTE } from '@/lib/islands/hex-terrain';
import type { HexWorld } from '@/lib/islands/hex-world';
import { simplifyTree } from '@/lib/islands/tree-lod';

const noRaycast = () => undefined;

function fill(mesh: InstancedMesh | null, items: { position: number[]; rotation: number; scale: number }[], colors?: Color[]) {
  if (!mesh) return;
  const dummy = new Object3D();
  items.forEach((item, i) => {
    dummy.position.set(item.position[0], item.position[1], item.position[2]);
    dummy.rotation.set(0, item.rotation, 0);
    dummy.scale.setScalar(item.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colors) mesh.setColorAt(i, colors[i]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

const show=(meshes:(InstancedMesh|null)[],visible:boolean)=>meshes.forEach(mesh=>{if(mesh) mesh.visible=visible;});

/**
 * One instanced draw call per GLB tree kind; geometry and material are the GLB's own, shared.
 * D.2c-2 `lod`: below that many device pixels per world unit (orthographic zoom times pixel ratio) the view draws
 * a low-detail copy of each kind instead. The full trees skip only their main-pass draw (no instances while
 * rendering the view) and still draw into the shadow map, so shadows, and the static shadow map, never change.
 */
function GlbForest({trees,lod}:{trees:TreeInstance[];lod?:number}) {
  const {scene}=useGLTF(glbAssets['basics-island-v2.1'].url,false,false);
  const kinds=useMemo(()=>TREE_NODES.map(name=>{
    const mesh=scene.getObjectByName(name) as Mesh|undefined;
    return mesh?{geometry:mesh.geometry,material:mesh.material as Material}:null;
  }),[scene]);
  const far=useMemo(()=>kinds.map(kind=>lod&&kind?simplifyTree(kind.geometry):null),[kinds,lod]);
  useLayoutEffect(()=>()=>far.forEach(g=>g?.dispose()),[far]);
  const refs=useRef<(InstancedMesh|null)[]>([]),farRefs=useRef<(InstancedMesh|null)[]>([]);
  const distant=useRef(false);
  const groups=useMemo(()=>TREE_NODES.map((_,k)=>trees.filter(t=>t.kind===k)),[trees]);
  useLayoutEffect(()=>{
    groups.forEach((items,k)=>{
      fill(refs.current[k],items);
      fill(farRefs.current[k],items);
      const near=refs.current[k];
      if(!near||!lod) return;
      near.onBeforeRender=()=>{if(distant.current) near.count=0;};
      near.onAfterRender=()=>{near.count=items.length;};
    });
  },[groups,kinds,far,lod]);
  useFrame(({camera,gl})=>{
    if(!lod) return;
    distant.current=camera.zoom*gl.getPixelRatio()<lod;
    show(farRefs.current,distant.current);
  });
  return <group>
    {kinds.map((kind,k)=>kind&&groups[k].length?<instancedMesh key={k} ref={m=>{refs.current[k]=m;}}
      args={[kind.geometry,kind.material,groups[k].length]} castShadow receiveShadow raycast={noRaycast}/>:null)}
    {kinds.map((kind,k)=>kind&&far[k]&&groups[k].length?<instancedMesh key={`far-${k}`} ref={m=>{farRefs.current[k]=m;}}
      args={[far[k],kind.material,groups[k].length]} receiveShadow raycast={noRaycast}/>:null)}
  </group>;
}

/** Placeholder cones while the GLB loads or if it fails, so forests never disappear. */
function ConeForest({trees}:{trees:TreeInstance[]}) {
  const mesh=useRef<InstancedMesh>(null);
  const geometry=useMemo(()=>{const g=new ConeGeometry(.55,1.6,6);g.translate(0,.8,0);return g;},[]);
  const material=useMemo(()=>new MeshStandardMaterial({color:TERRAIN_PALETTE.grassEdge,flatShading:true,...TERRAIN_MATERIAL}),[]);
  useLayoutEffect(()=>{fill(mesh.current,trees);},[trees]);
  useLayoutEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  return <instancedMesh ref={mesh} args={[geometry,material,trees.length]} castShadow raycast={noRaycast}/>;
}

class ForestBoundary extends Component<{fallback:ReactNode;children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?this.props.fallback:this.props.children;}
}

/** Trees per forest patch, or (D.2c-1) a precomputed clustered layout passed as `trees`; `lod` as in GlbForest. */
export function HexForest({world,patches,trees:given,lod}:{world:HexWorld;patches:ForestPatch[];trees?:TreeInstance[];lod?:number}) {
  const trees=useMemo(()=>given??forestInstances(world,patches),[world,patches,given]);
  if(!trees.length) return null;
  const cones=<ConeForest trees={trees}/>;
  return <ForestBoundary fallback={cones}><Suspense fallback={cones}><GlbForest trees={trees} lod={lod}/></Suspense></ForestBoundary>;
}

/** Low-poly boulders along the coast, one instanced draw call, tinted with the cliff palette; `rocks` overrides the layout. */
export function HexRocks({world,rocks:given}:{world:HexWorld;rocks?:RockInstance[]}) {
  const rocks=useMemo(()=>given??coastRocks(world),[world,given]);
  const mesh=useRef<InstancedMesh>(null);
  const geometry=useMemo(()=>new DodecahedronGeometry(1,0),[]);
  const material=useMemo(()=>new MeshStandardMaterial({flatShading:true,...TERRAIN_MATERIAL}),[]);
  useLayoutEffect(()=>{
    const tints=[TERRAIN_PALETTE.cliffTop,TERRAIN_PALETTE.cliff,TERRAIN_PALETTE.cliffDeep].map(c=>new Color(c));
    fill(mesh.current,rocks.map(r=>({position:r.position,rotation:r.tint*6,scale:r.scale})),rocks.map(r=>tints[Math.floor(r.tint*3)]));
  },[rocks]);
  useLayoutEffect(()=>()=>{geometry.dispose();material.dispose();},[geometry,material]);
  if(!rocks.length) return null;
  return <instancedMesh ref={mesh} args={[geometry,material,rocks.length]} castShadow receiveShadow raycast={noRaycast}/>;
}
