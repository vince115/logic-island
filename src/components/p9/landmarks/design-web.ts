import { C, ball, beam, box, cyl, dome, group, hall, hipRoof, lamp, mast, on, panel, plinth, ring, tower, type Part, type Piece } from './kit';

/*
 * P9.3 Batch 3, 數位設計群島: studios, a research centre, a gallery; warm walls, bright swatches.
 * P9.3 Batch 4, 網頁與應用開發群島: modular buildings, components, a phone tower; cool walls, code colours.
 * Tile 0 is each island's main landmark.
 */
const SWATCH = ['#d81b60', '#f4b400', '#34a853', '#4285f4', '#7c5cff', '#ff7043'] as const;
const CODE = ['#e44d26', '#264de4', '#f7df1e', '#61dafb', '#34a853'] as const;

// ——— Design ———

/** UX 研究島: the UX Research Center (observation gallery), an interview pavilion, persona statues and a sticky-note wall. */
function uxResearch(accent: string): Piece[] {
  const center: Part[] = [
    ...plinth(1.2, 1),
    cyl(.5, .55, .7, C.wallWarm, [0, .49, 0], 12), cyl(.56, .56, .2, C.glass, [0, .95, 0], 12, { glow: true }), cyl(.58, .58, .06, accent, [0, 1.08, 0], 12),
    dome(.5, C.wall, [0, 1.11, 0]), cyl(.06, .08, .4, C.slate, [.25, 1.55, .1], 6, { tilt: -.7 }),
  ];
  const pavilion: Part[] = [box(.9, .06, .7, C.stoneDark, [0, .03, 0]), ...[[-.35, -.26], [.35, -.26], [-.35, .26], [.35, .26]].map(([x, z]): Part => cyl(.035, .035, .55, C.wood, [x, .33, z], 6)),
    hipRoof(.86, .66, .25, accent, .6), cyl(.18, .18, .25, C.woodDark, [0, .19, 0], 8), ...[-.3, .3].map((x): Part => box(.16, .2, .16, C.wall, [x, .16, 0]))];
  const persona = (c: string, x: number, z: number): Part[] => [cyl(.08, .12, .4, c, [x, .26, z], 8), ball(.09, C.wallWarm, [x, .55, z])];
  const personas: Part[] = [cyl(.55, .58, .06, C.path, [0, .03, 0], 10), ...persona(SWATCH[0], -.25, -.1), ...persona(SWATCH[3], .05, .2), ...persona(SWATCH[2], .3, -.15), ...lamp([-.35, .06, .3])];
  const notes: Part[] = [box(.9, .6, .06, C.wall, [0, .5, 0]), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Part => box(.14, .14, .012, SWATCH[i % 6], [-.33 + (i % 4) * .22, .38 + Math.floor(i / 4) * .24, .036], { turn: (i % 3 - 1) * .04 }))];
  return [...on(0, center), ...on(1, pavilion), ...on(2, personas), ...on(3, notes)];
}

/** UI 設計島: the UI Studio (a lit screen of layout blocks), a swatch tower, a button garden and an icon board. */
function uiDesign(accent: string): Piece[] {
  const studio: Part[] = [
    ...plinth(1.25, .9),
    box(1.1, 1.05, .7, C.wall, [0, .66, 0]), box(.96, .76, .012, '#f7fbff', [0, .68, .356], { glow: true }),
    box(.9, .14, .014, accent, [0, .96, .36]), box(.28, .44, .014, '#c9d2d8', [-.3, .62, .36]), ...[0, 1].map((i): Part => box(.5, .16, .014, SWATCH[i + 2], [.15, .5 + i * .22, .36])),
    box(1.16, .08, .76, C.roofDark, [0, 1.22, 0]),
  ];
  const swatches: Part[] = [...plinth(.5, .5), ...SWATCH.map((c, i): Part => box(.36, .22, .08, c, [0, .3 + i * .24, 0], { turn: i * .45 })), cyl(.02, .02, 1.5, C.slate, [0, .87, 0], 5)];
  const buttons: Part[] = [box(1, .03, .7, '#e9e2d4', [0, .015, 0]), ...[[-.3, -.15, 0], [0, .1, 1], [.3, -.12, 2], [-.1, -.25, 3]].map(([x, z, i]): Part => cyl(.15, .15, .1, SWATCH[i], [x, .08, z], 16, { scale: [1.6, 1, 1] }))];
  const icons: Part[] = [...panel(.6, .4, C.white, C.slate, .25), ...[0, 1, 2, 3, 4, 5].map((i): Part => box(.1, .1, .012, SWATCH[i], [-.2 + (i % 3) * .2, .37 + Math.floor(i / 3) * .16, .05]))];
  return [...on(0, studio), ...on(1, swatches), ...on(2, buttons), ...on(3, icons)];
}

/** 互動設計島: the Prototype Workshop, a kinetic sculpture, a touch-pad plaza and a play arch. */
function interactionDesign(accent: string): Piece[] {
  const workshop: Part[] = [
    ...plinth(1.2, .9),
    ...group(hall({ w: 1.05, d: .72, h: .6, wall: C.wallWarm, roof: accent, kind: 'hip' }), [0, .14, 0]),
    cyl(.16, .16, .05, '#f4b400', [.42, 1.0, .1], 8, { tilt: Math.PI / 2 }), cyl(.1, .1, .05, '#4285f4', [.6, .88, .1], 8, { tilt: Math.PI / 2 }), cyl(.03, .03, .55, C.slate, [.42, .88, .08], 5),
  ];
  const kinetic: Part[] = [cyl(.3, .35, .1, C.stoneDark, [0, .05, 0], 8), cyl(.03, .03, 1.5, C.steel, [0, .85, 0], 6),
    ...[0, 1, 2].flatMap((i): Part[] => { const y = .9 + i * .3, a = i * 1.1; return [beam([Math.cos(a) * -.4, y, Math.sin(a) * -.4], [Math.cos(a) * .4, y, Math.sin(a) * .4], .03, .03, C.steel), ball(.09, SWATCH[i], [Math.cos(a) * .4, y, Math.sin(a) * .4]), ball(.07, SWATCH[i + 3], [Math.cos(a) * -.4, y, Math.sin(a) * -.4])]; }),
    ball(.06, C.window, [0, 1.62, 0], { glow: true })];
  const pads: Part[] = [box(1, .03, .8, C.path, [0, .015, 0]), ...[0, 1, 2, 3, 4, 5].map((i): Part => box(.2, .04, .2, SWATCH[i], [-.3 + (i % 3) * .3, .05, -.15 + Math.floor(i / 3) * .3], i % 2 ? {} : { glow: true }))];
  const arch: Part[] = [ring(.42, .07, accent, [0, .42, 0], { tilt: 0 }), box(.9, .06, .3, C.stoneDark, [0, .03, 0]), ...lamp([-.45, 0, .3]), ...lamp([.45, 0, .3])];
  return [...on(0, workshop), ...on(1, kinetic), ...on(2, pads), ...on(3, arch)];
}

/** 設計系統島: the Design System Gallery (identical modules), component shelves, a token totem and a type wall. */
function designSystems(accent: string): Piece[] {
  const gallery: Part[] = [
    ...plinth(1.3, 1),
    ...[0, 1, 2].flatMap(x => [0, 1].flatMap((z): Part[] => [box(.36, .36, .36, C.wall, [-.38 + x * .38, .34, -.18 + z * .38]), box(.3, .08, .012, C.window, [-.38 + x * .38, .38, z ? .385 : -.37], { glow: true })])),
    ...[0, 1].map((x): Part => box(.36, .36, .36, C.wall, [-.19 + x * .38, .7, 0])), box(.36, .36, .36, accent, [0, 1.06, 0]), box(.4, .04, .4, C.roofDark, [0, 1.26, 0]),
  ];
  const shelves: Part[] = [box(.9, .9, .3, C.woodDark, [0, .45, 0]), ...[0, 1, 2].flatMap(row => [0, 1, 2, 3].map((i): Part => box(.16, .16, .2, SWATCH[(row + i) % 6], [-.3 + i * .2, .2 + row * .28, .06])))];
  const totem: Part[] = [cyl(.25, .3, .1, C.stoneDark, [0, .05, 0], 8), ...SWATCH.map((c, i): Part => cyl(.2 - i * .02, .2 - i * .02, .2, c, [0, .2 + i * .21, 0], 8)), ball(.08, C.window, [0, 1.42, 0], { glow: true })];
  const type: Part[] = [...panel(.7, .45, C.white, C.slate, .25), ...[.24, .17, .11].map((h, i): Part => box(.5 - i * .1, h * .4, .012, C.ink, [0, .62 - i * .12, .05]))];
  return [...on(0, gallery), ...on(1, shelves), ...on(2, totem), ...on(3, type)];
}

// ——— Web ———

/** 前端開發島: the React Component Research Center (an atom on the roof), stacked components, a dev board and lamps. */
function frontend(accent: string): Piece[] {
  const center: Part[] = [
    ...plinth(1.2, .9),
    ...group(hall({ w: 1.05, d: .75, h: .7, wall: C.wallCool, roof: C.roofDark, kind: 'flat' }), [0, .14, 0]),
    ball(.1, '#61dafb', [0, 1.45, 0], { glow: true }), ...[0, 1, 2].map((i): Part => ring(.36, .022, '#61dafb', [0, 1.45, 0], { tilt: Math.PI / 2 + .9, turn: i * Math.PI / 3 })),
    cyl(.03, .03, .45, C.slate, [0, 1.12, 0], 5),
  ];
  const stack: Part[] = [...plinth(.6, .6), ...[0, 1, 2, 3, 4].map((i): Part => box(.44 - (i % 2) * .08, .22, .3, CODE[i], [0, .27 + i * .24, 0], { turn: i * .2 })), box(.1, .1, .1, accent, [0, 1.48, 0])];
  const board: Part[] = [...panel(.75, .45, '#20232a', C.slate, .25, true), ...[0, 1, 2, 3].map((i): Part => box(.3 + (i % 2) * .2, .03, .012, CODE[i], [-.1 + (i % 2) * .05, .58 - i * .08, .05], { glow: true }))];
  const lamps: Part[] = [box(.9, .03, .5, C.path, [0, .015, 0]), ...lamp([-.35, 0, 0]), ...lamp([.35, 0, 0]), box(.3, .2, .3, CODE[3], [0, .1, 0], { turn: .4 })];
  return [...on(0, center), ...on(1, stack), ...on(2, board), ...on(3, lamps)];
}

/** 網頁基礎島: the HTML/CSS Workshop (a box-model house: margin, border, padding, content), a tag arch, style shelves and a lantern. */
function webFoundations(accent: string): Piece[] {
  const workshop: Part[] = [
    box(1.3, .08, 1.1, '#f9c99a', [0, .04, 0]), box(1.1, .1, .9, '#fce8b2', [0, .13, 0]), box(.9, .08, .7, '#c3e6cb', [0, .22, 0]),
    ...group(hall({ w: .7, d: .5, h: .7, wall: '#9fc5f8', roof: '#e44d26', kind: 'hip' }), [0, .26, 0]),
  ];
  const tag = (s: number): Part[] => [box(.1, .55, .1, accent, [s * .38, .6, 0], { roll: s * .55 }), box(.1, .55, .1, accent, [s * .38, .2, 0], { roll: -s * .55 })];
  const arch: Part[] = [box(.3, .03, .9, C.path, [0, .015, 0]), ...tag(-1), ...tag(1), box(.06, .9, .06, C.slate, [.05, .45, 0], { roll: -.35 }), ...lamp([0, 0, .4])];
  const shelves: Part[] = [box(.85, .7, .26, C.woodDark, [0, .35, 0]), ...[0, 1].flatMap(row => CODE.map((c, i): Part => box(.12, .2, .18, c, [-.3 + i * .15, .2 + row * .3, .05])))];
  const lantern: Part[] = [...plinth(.5, .5), ...group(tower({ r: .16, h: 1.2, color: C.wall, sides: 6, cap: 'cone', capColor: '#e44d26' }), [0, .14, 0])];
  return [...on(0, workshop), ...on(1, arch), ...on(2, shelves), ...on(3, lantern)];
}

/** 行動應用島: the Phone Tower (a phone standing on end, its screen lit), app-icon tiles, a charging pad and an antenna. */
function mobileApps(accent: string): Piece[] {
  const phone: Part[] = [
    ...plinth(.9, .7),
    box(.6, 1.6, .16, C.ink, [0, .94, 0]), box(.52, 1.4, .012, '#bfe3ff', [0, .94, .086], { glow: true }),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i): Part => box(.12, .12, .014, [...CODE, ...CODE][i], [-.15 + (i % 3) * .15, 1.38 - Math.floor(i / 3) * .2, .094])),
    box(.18, .03, .014, accent, [0, .32, .094]),
  ];
  const tiles: Part[] = [box(1, .03, .8, '#e9e2d4', [0, .015, 0]), ...[0, 1, 2, 3, 4, 5].map((i): Part => box(.22, .12, .22, [...CODE, accent][i], [-.3 + (i % 3) * .3, .09, -.15 + Math.floor(i / 3) * .3], { turn: .1 }))];
  const pad: Part[] = [cyl(.5, .55, .1, C.wallCool, [0, .05, 0], 16), ring(.4, .03, '#34a853', [0, .11, 0], { glow: true }), box(.3, .5, .06, C.ink, [0, .4, 0], { tilt: -.4 })];
  const antenna: Part[] = [...plinth(.45, .45), ...group(mast(1.6), [0, .14, 0])];
  return [...on(0, phone), ...on(1, tiles), ...on(2, pad), ...on(3, antenna)];
}

/** 響應式設計島: the Responsive Pavilion (desktop, tablet and phone screens side by side), a flexible grid, rulers and a lamp. */
function responsiveDesign(accent: string): Piece[] {
  const pavilion: Part[] = [
    ...plinth(1.3, .9),
    ...group(panel(.7, .45, '#e8f0fe', C.ink, .45, true), [-.25, .14, -.1]), ...group(panel(.32, .45, '#e6f4ea', C.ink, .35, true), [.32, .14, 0]),
    ...group(panel(.14, .28, '#fef7e0', C.ink, .3, true), [.55, .14, .2]), box(1.3, .06, .2, accent, [0, 1.12, -.14]), cyl(.03, .03, .98, C.slate, [-.6, .63, -.14], 5),
  ];
  const grid: Part[] = [box(.9, .03, .9, C.path, [0, .015, 0]),
    ...[-.3, 0, .3].flatMap((x): Part[] => [box(.04, .9, .04, C.steel, [x, .45, -.3]), box(.04, .9, .04, C.steel, [x, .45, .3])]),
    ...[.3, .6, .9].flatMap((y): Part[] => [box(.64, .04, .04, C.steel, [0, y, -.3]), box(.64, .04, .04, C.steel, [0, y, .3])]),
    box(.26, .26, .5, accent, [-.15, .45, 0]), box(.26, .26, .5, '#f4b400', [.15, .75, 0])];
  const rulers: Part[] = [...[-.25, 0, .25].map((x, i): Part => box(.08, .6 + i * .3, .04, '#f4b400', [x, .3 + i * .15, 0])), ...[-.25, 0, .25].flatMap((x, i): Part[] => [0, 1, 2].map((k): Part => box(.04, .01, .045, C.ink, [x + .02, .2 + k * .2 + i * .1, 0], { fine: true })))];
  const lampPost: Part[] = [box(.5, .03, .5, C.path, [0, .015, 0]), ...lamp([0, 0, 0]), box(.2, .2, .2, CODE[1], [.18, .1, .12])];
  return [...on(0, pavilion), ...on(1, grid), ...on(2, rulers), ...on(3, lampPost)];
}

export const DESIGN_LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  'ux-research': uxResearch, 'ui-design': uiDesign, 'interaction-design': interactionDesign, 'design-systems': designSystems,
};
export const WEB_LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  frontend, 'web-foundations': webFoundations, 'mobile-apps': mobileApps, 'responsive-design': responsiveDesign,
};
