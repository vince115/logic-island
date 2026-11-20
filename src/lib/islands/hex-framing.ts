import { Vector3 } from 'three';
import { hexCorner, hexToWorld } from '@/lib/islands/hex';
import { placementPose, type HexGlbSettlement } from '@/lib/islands/hex-buildings';
import { tileTop } from '@/lib/islands/hex-terrain';
import { WATER_LEVEL, worldCenter, type HexWorld } from '@/lib/islands/hex-world';
import { MAP_VIEW } from '@/lib/islands/map-view';

/*
 * P9.8a: how a hex map is framed, as plain math with no React or renderer: the camera's view direction, the content
 * points it keeps in view (fitPoints) and the fit itself (frame). Moved unchanged out of hex-camera.tsx and
 * hex-world-scene.tsx, so the P9 world overview can work out a region page's opening view before that page (and its
 * scene code) has loaded, and end its flight there.
 */

// About 40° above the water, looking from the south-east like a board on a table (the numbers: lib/islands/map-view.ts).
export const VIEW = new Vector3(...MAP_VIEW).normalize();
const UP = new Vector3(0, 1, 0);

/**
 * Where the camera looks and how far it zooms to fit `points` seen along `view`, between the overlays: the caption
 * at the top, the hint bar at the bottom (two rows on phones, one once a settlement is focused there). `shift` is how
 * far the view moves along the screen's up so the content sits between them. 2026-11-02: `insetRight` pixels on the
 * right are covered by a panel (the home page's island list); the content fits left of it and `side` moves the view
 * along the screen's right by half that width. 0 (the default) frames exactly as before.
 * P8.3: `room` replaces the top and bottom allowances (px) for a stage whose caption and controls are not over the
 * map (a region map on a phone), plus whatever does cover its lower part (a sheet). Without it, exactly as before.
 */
export type StageRoom={top:number;bottom:number};
export function frame(points:Vector3[],view:Vector3,width:number,height:number,focused:boolean,insetRight=0,room?:StageRoom) {
  const right=new Vector3().crossVectors(UP,view).normalize(),up=new Vector3().crossVectors(view,right);
  // Extents on screen axes; the center is the middle of those extents (for a box, the box center).
  const rs=points.map(p=>p.dot(right)),us=points.map(p=>p.dot(up)),depth=points.reduce((sum,p)=>sum+p.dot(view),0)/points.length;
  const [r0,r1,u0,u1]=[Math.min(...rs),Math.max(...rs),Math.min(...us),Math.max(...us)];
  const center=right.clone().multiplyScalar((r0+r1)/2).addScaledVector(up,(u0+u1)/2).addScaledVector(view,depth);
  const halfWidth=(r1-r0)/2,halfHeight=(u1-u0)/2;
  const phone=width<700;
  const top=room?.top??(phone?72:40),bottom=room?.bottom??(phone?(focused?64:96):56);
  // An orthographic camera shows width/zoom world units across, so zoom = pixels / units.
  const pad=phone?1.1:1.12;
  const zoom=Math.min((width-insetRight)/(2*halfWidth*pad),(height-top-bottom)/(2*halfHeight*pad));
  return {center,zoom,up,right,shift:(top-bottom)/(2*zoom),side:insetRight/(2*zoom)};
}

export type CaptionSide='left'|'right'|'above'|'below';
/**
 * Where a compact caption goes: just off the coast on the side of the settlement facing away from the rest
 * of the world, and which screen side that is, so the caption can hang outward instead of over the island.
 */
export function captionPoint(world:HexWorld,settlement:HexWorld['settlements'][number],reach=1.2,view=VIEW):{point:[number,number];side:CaptionSide} {
  const [wx,wz]=worldCenter(world),[sx,sz]=hexToWorld(settlement.center,world.size);
  const length=Math.hypot(sx-wx,sz-wz)||1,out=[(sx-wx)/length,(sz-wz)/length];
  const far=settlement.tiles.reduce((best,t)=>{const [x,z]=hexToWorld(t,world.size),[bx,bz]=hexToWorld(best,world.size);
    return x*out[0]+z*out[1]>bx*out[0]+bz*out[1]?t:best;},settlement.tiles[0]);
  const [fx,fz]=hexToWorld(far,world.size);
  // Screen right and up for a ground direction, from the camera view (the fixed hex view unless the free camera turned).
  const right=new Vector3().crossVectors(new Vector3(0,1,0),view).normalize(),up=new Vector3().crossVectors(view,right);
  const r=right.x*out[0]+right.z*out[1],u=up.x*out[0]+up.z*out[1];
  const side:CaptionSide=Math.abs(r)>Math.abs(u)?(r>0?'right':'left'):(u>0?'above':'below');
  return {point:[fx+out[0]*world.size*reach,fz+out[1]*world.size*reach],side};
}
/** Points the camera must keep in view, in scene space: tile corners, the shore just beyond them, building tops. */
export function fitPoints(world:HexWorld,layouts:HexGlbSettlement[],[ox,oz]:[number,number],captions:boolean,reach?:number,view=VIEW) {
  const byId:Record<string,Vector3[]>={};
  for(const settlement of world.settlements){
    const points:Vector3[]=[];
    for(const tile of settlement.tiles){
      const [cx,cz]=hexToWorld(tile,world.size);
      for(let i=0;i<6;i++){
        const [x,z]=hexCorner(tile,world.size,i);
        points.push(new Vector3(x-ox,tileTop(tile),z-oz),new Vector3(cx+(x-cx)*1.5-ox,WATER_LEVEL,cz+(z-cz)*1.5-oz));
      }
    }
    for(const layout of layouts.filter(l=>l.islandId===settlement.islandId)) for(const placement of layout.placements){
      const [x,y,z]=placementPose(world,layout.islandId,placement).position;
      points.push(new Vector3(x-ox,y+2.7,z-oz));
    }
    byId[settlement.islandId]=points;
  }
  // The overview also keeps the island captions in view (only the overview shows them); a caption hangs
  // outward from its point, so keep about a caption's width beyond it.
  // M3.1: with `reach` (regional world), only captions hanging sideways on screen get it; above and below keep 4.2.
  const labels=captions?world.settlements.map(s=>{
    const sideways=reach!==undefined&&['left','right'].includes(captionPoint(world,s,1.2,view).side);
    const {point:[x,z]}=captionPoint(world,s,sideways?reach:4.2);return new Vector3(x-ox,WATER_LEVEL,z-oz);
  }):[];
  return {all:[...Object.values(byId).flat(),...labels],byId};
}
