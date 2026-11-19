import { C, ball, beam, box, cone, cyl, dome, group, hall, hipRoof, lamp, mast, on, panel, plinth, ring, tower, wall, type Part, type Piece, type V3 } from './kit';

/*
 * P9.3 Batch 1, 程式與資訊群島: the islands besides 基礎程式島 (GLB) and 資料結構島 (P9.2). Tile 0 is each island's
 * main landmark (its site nearest the plaza, raised a step), the others its secondary buildings and grounds.
 */
const BARS = ['#4285f4', '#34a853', '#f4b400', '#db4437', '#8a4fd1'] as const;

/** 演算法島: the Algorithm Research Tower, the Sorting Arena, the Search Maze and a pavilion. */
function algorithms(accent: string): Piece[] {
  // Research tower: three stepped tiers, a gallery and a lit lantern under a red cap.
  const research: Part[] = [
    ...plinth(1.1, 1.1),
    ...group(tower({ r: .48, h: .7, color: C.wall, sides: 6, cap: 'flat', capColor: C.stoneDark, windows: true }), [0, .14, 0]),
    ...group(tower({ r: .36, h: .65, color: C.wallWarm, sides: 6, cap: 'flat', capColor: accent, windows: true }), [0, .92, 0]),
    ...group(tower({ r: .24, h: .5, color: C.wall, sides: 6, cap: 'cone', capColor: '#db4437', windows: true }), [0, 1.65, 0]),
    ...[0, 1, 2, 3, 4, 5].map((i): Part => box(.04, .2, .04, C.slate, [Math.cos(i * Math.PI / 3) * .5, .96, Math.sin(i * Math.PI / 3) * .5], { fine: true })),
  ];
  // Sorting arena: an oval stand around a floor of bars in rising order.
  const arena: Part[] = [
    cyl(.72, .78, .1, C.stone, [0, .05, 0], 12), ring(.66, .07, C.stoneDark, [0, .2, 0]), ring(.6, .05, accent, [0, .32, 0]),
    ...[-.36, -.18, 0, .18, .36].map((x, i): Part => box(.12, .15 + i * .14, .12, BARS[i], [x, .1 + (.15 + i * .14) / 2, 0])),
    ...[0, 1, 2, 3].map((i): Part => box(.06, .5, .06, C.slate, [Math.cos(i * Math.PI / 2 + .6) * .74, .25, Math.sin(i * Math.PI / 2 + .6) * .74], { fine: true })),
    ...[0, 1, 2, 3].map((i): Part => ball(.05, C.window, [Math.cos(i * Math.PI / 2 + .6) * .74, .52, Math.sin(i * Math.PI / 2 + .6) * .74], { glow: true, fine: true })),
  ];
  // Search maze: low hedges in a square spiral, a red goal flag in the middle.
  const maze: Part[] = [
    box(1.1, .04, 1.1, C.path, [0, .02, 0]),
    wall(1.1, C.leaf, [0, 0, -.52]), wall(1.1, C.leaf, [0, 0, .52]), wall(1.04, C.leaf, [-.52, 0, 0], Math.PI / 2), wall(.7, C.leaf, [.52, 0, -.17], Math.PI / 2),
    wall(.7, C.leaf, [-.1, 0, -.26]), wall(.5, C.leaf, [.26, 0, .05], Math.PI / 2), wall(.6, C.leaf, [-.05, 0, .28]), wall(.3, C.leaf, [-.26, 0, .1], Math.PI / 2),
    cyl(.02, .02, .5, C.slate, [0, .25, 0], 5), box(.2, .12, .02, '#db4437', [.1, .44, 0]),
  ];
  // Pavilion: a hipped roof on four posts over a bench, the big-O signboard beside it.
  const pavilion: Part[] = [
    box(.8, .06, .6, C.stoneDark, [0, .03, 0]),
    ...[[-.32, -.22], [.32, -.22], [-.32, .22], [.32, .22]].map(([x, z]): Part => cyl(.04, .04, .55, C.wood, [x, .33, z], 6)),
    ...group(hall({ w: .8, d: .6, h: 0, roof: C.roofGreen, windows: null, door: null }).slice(1), [0, .6, 0]),
    box(.5, .08, .16, C.woodDark, [0, .2, 0]), ...group(panel(.4, .26, accent), [.6, 0, .1], -.4),
  ];
  return [...on(0, research), ...on(1, arena), ...on(2, maze), ...on(3, pavilion)];
}

/** 資料庫應用島: the Storage Fortress, the Index Tower, the Query Center and a loading quay. */
function databases(accent: string): Piece[] {
  // Storage fortress: stacked disks inside a crenellated wall.
  const fortress: Part[] = [
    cyl(.7, .74, .3, C.stoneDark, [0, .15, 0], 8),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i): Part => box(.16, .14, .1, C.stone, [Math.cos(i * Math.PI / 4) * .66, .37, Math.sin(i * Math.PI / 4) * .66], { turn: -i * Math.PI / 4, fine: true })),
    ...[0, 1, 2].map((i): Part => cyl(.42, .42, .26, i % 2 ? C.wallCool : C.wall, [0, .44 + i * .3, 0], 16)),
    ...[0, 1, 2].map((i): Part => cyl(.43, .43, .05, accent, [0, .58 + i * .3, 0], 16)),
    ...[0, 1, 2].map((i): Part => box(.18, .06, .012, C.window, [0, .44 + i * .3, .425], { glow: true })),
    dome(.42, C.roofBlue, [0, 1.32, 0]),
  ];
  // Index tower: a slim tower with fins, one per index entry, and a key on top.
  const index: Part[] = [
    ...plinth(.6, .6),
    ...group(tower({ r: .2, h: 2, color: C.wallCool, sides: 4, cap: 'flat', capColor: C.roofDark, windows: true }), [0, .14, 0]),
    ...[0, 1, 2, 3, 4, 5].map((i): Part => box(.56 - (i % 3) * .1, .04, .1, i % 2 ? accent : C.slate, [0, .45 + i * .28, 0], { turn: i * .5 })),
    cyl(.1, .1, .04, C.gold, [0, 2.3, 0], 10, { tilt: Math.PI / 2 }), box(.04, .2, .04, C.gold, [0, 2.18, 0]),
  ];
  // Query center: a hall under a glass dome, a lit query screen on its front.
  const query: Part[] = [
    ...plinth(1.05, .8),
    ...group(hall({ w: .95, d: .7, h: .55, wall: C.wall, roof: C.roofDark, kind: 'glass' }), [0, .14, 0]),
    ...group(panel(.5, .22, '#bfe3ff', C.slate, .2, true), [0, .14, .45]),
  ];
  // Quay: crates of records on a deck, a small crane and lamps.
  const quay: Part[] = [
    box(.9, .06, .6, C.wood, [0, .03, 0]),
    ...[[-.25, -.1, 0], [0, -.1, 1], [-.12, .15, 2]].map(([x, y, i]): Part => box(.24, .24, .24, BARS[i], [x, .18 + y + .1, 0])),
    cyl(.04, .05, .9, C.steel, [.32, .45, -.1], 6), beam([.32, .9, -.1], [.02, .9, -.1], .05, .05, C.steel), cyl(.01, .01, .3, C.slate, [.04, .75, -.1], 4, { fine: true }),
    ...lamp([-.38, .06, .22]), ...lamp([.38, .06, .22]),
  ];
  return [...on(0, fortress), ...on(1, index), ...on(2, query), ...on(3, quay)];
}

/** 程式語言島 (three sites): the Compiler Temple, the Language Library and the brace gate. */
function programmingLanguages(accent: string): Piece[] {
  const temple: Part[] = [
    ...plinth(1.2, .95, C.stone, .2),
    box(1, .08, .78, C.stoneDark, [0, .24, 0]),
    ...[-.4, -.13, .13, .4].flatMap((x): Part[] => [cyl(.06, .07, .7, C.wall, [x, .63, .32], 8), cyl(.06, .07, .7, C.wall, [x, .63, -.32], 8)]),
    box(.66, .62, .5, C.wallWarm, [0, .6, 0]), box(.4, .14, .012, C.window, [0, .7, .255], { glow: true }),
    box(1.04, .1, .8, C.stoneDark, [0, 1.03, 0]),
    hipRoof(.92, .66, .34, accent, 1.08),
  ];
  // Library: shelves of coloured spines behind a glass front, a ladder.
  const library: Part[] = [
    ...plinth(.9, .7),
    ...group(hall({ w: .82, d: .6, h: 1.05, wall: C.wallCool, roof: C.roofBlue, kind: 'flat', windows: null }), [0, .14, 0]),
    ...[0, 1, 2].flatMap((row): Part[] => BARS.map((c, i) => box(.1, .2, .02, c, [-.28 + i * .14, .4 + row * .3, .31]))),
    box(.03, .9, .03, C.wood, [.36, .6, .34], { roll: .15, fine: true }),
  ];
  // Brace gate: { } as two stone brackets on a path, a pennant-free arch in the accent.
  const brace = (sx: number): Part[] => [
    box(.1, .9, .12, C.stone, [sx * .4, .55, 0]), box(.2, .1, .12, C.stone, [sx * .32, 1.02, 0]), box(.2, .1, .12, C.stone, [sx * .32, .06, 0]),
    box(.16, .1, .12, C.stone, [sx * .5, .55, 0]),
  ];
  const gate: Part[] = [box(.3, .03, 1, C.path, [0, .015, 0]), ...brace(-1), ...brace(1), box(.66, .1, .14, accent, [0, 1.12, 0]), ...lamp([-.5, 0, .4]), ...lamp([.5, 0, .4])];
  return [...on(0, temple), ...on(1, library), ...on(2, gate)];
}

/** 計算機網路島 (three sites): the Communication Tower, the Router Hub and the Relay Station, cabled together. */
function networks(accent: string): Piece[] {
  const lattice = (h: number): Part[] => {
    const legs: V3[] = [[-.32, 0, -.32], [.32, 0, -.32], [.32, 0, .32], [-.32, 0, .32]];
    return [
      ...legs.map(([x, , z]): Part => beam([x, 0, z], [x * .25, h, z * .25], .06, .06, C.steel)),
      ...[.35, .7].flatMap(f => legs.map((a, i): Part => { const b = legs[(i + 1) % 4], k = 1 - f * .75; return beam([a[0] * k, h * f, a[2] * k], [b[0] * k, h * f, b[2] * k], .04, .04, C.steel, { fine: true }); })),
      cyl(.12, .12, .2, accent, [0, h * .75, 0], 8), cone(.24, .12, C.white, [.2, h * .8, 0], 12, { roll: -Math.PI / 2.4 }), cone(.2, .1, C.white, [-.18, h * .62, .05], 12, { roll: Math.PI / 2.4 }),
      cyl(.025, .025, .5, C.steel, [0, h + .25, 0], 5), ball(.07, '#ff6b5a', [0, h + .52, 0], { glow: true }),
    ];
  };
  const router: Part[] = [
    ...plinth(1, 1),
    cyl(.5, .52, .5, C.wallCool, [0, .39, 0], 8), cyl(.52, .52, .1, accent, [0, .68, 0], 8), cyl(.5, .5, .06, C.window, [0, .5, 0], 8, { glow: true }),
    dome(.42, C.roofDark, [0, .73, 0]), ...[-1, 1].flatMap(s => group(mast(.6), [s * .25, 1.05, 0])),
  ];
  const relay: Part[] = [
    ...plinth(.9, .7),
    ...group(hall({ w: .78, d: .56, h: .5, wall: C.wall, roof: C.roofBlue, kind: 'hip' }), [0, .14, 0]),
    ...group(mast(1.3), [.36, .14, -.2]),
  ];
  return [...on(0, lattice(2.6)), ...on(1, router), ...on(2, relay)];
}

/** 系統分析與設計島: the Design Studio, the Blueprint Hall, the Flowchart Garden and a drafting tower. */
function systemsAnalysis(accent: string): Piece[] {
  const studio: Part[] = [
    ...plinth(1.1, .9),
    box(.95, .9, .7, C.wall, [0, .59, 0]), box(.9, .6, .012, C.glass, [0, .62, .356], { glow: true }),
    box(.6, .45, .55, C.wallCool, [-.15, 1.27, 0]), box(.5, .18, .012, C.window, [-.15, 1.3, .28], { glow: true }),
    box(.35, .04, .55, accent, [.33, 1.06, 0]), ...[-.05, .2].map((x): Part => cyl(.12, .1, .2, C.leaf, [.3 + x * .3, 1.18, .1], 6, { fine: true })),
  ];
  const blueprint: Part[] = [
    ...plinth(1.15, .8),
    ...group(hall({ w: 1.05, d: .7, h: .45, wall: '#e6eef8', roof: C.roofBlue, kind: 'hip' }), [0, .14, 0]),
    box(.7, .02, .4, '#2f6fb7', [0, .02, .58]), ...[-.2, 0, .2].map((x): Part => box(.012, .022, .36, C.white, [x, .025, .58], { fine: true })),
  ];
  // Flowchart garden: a start oval, a diamond and two boxes on low plinths, joined by arrows (beams).
  const garden: Part[] = [
    cyl(.18, .18, .12, '#34a853', [-.45, .06, -.35], 12, { scale: [1.5, 1, 1] }), box(.3, .3, .3, '#f4b400', [0, .25, -.05], { turn: Math.PI / 4, roll: Math.PI / 4 }),
    box(.34, .18, .24, C.wall, [.42, .09, .3]), box(.34, .18, .24, C.wall, [-.4, .09, .35]),
    beam([-.38, .1, -.3], [-.08, .1, -.1], .05, .05, accent), beam([.1, .1, .05], [.36, .1, .25], .05, .05, accent), beam([-.1, .1, .08], [-.34, .1, .3], .05, .05, accent),
  ];
  const drafting: Part[] = [...plinth(.6, .6), ...group(tower({ r: .22, h: 1.2, color: C.wall, sides: 4, cap: 'cone', capColor: accent }), [0, .14, 0]), ...group(panel(.3, .22, C.white), [.35, 0, .25], -.6)];
  return [...on(0, studio), ...on(1, blueprint), ...on(2, garden), ...on(3, drafting)];
}

/** 管理資訊系統島: the Archive (finished), the Office Tower, the Dashboard Plaza and a warehouse. */
function informationSystems(accent: string): Piece[] {
  const archive: Part[] = [
    ...plinth(1.3, 1, C.stone, .2),
    ...[-.5, -.25, 0, .25, .5].map((x): Part => cyl(.06, .07, .75, C.wall, [x, .58, .4], 8)),
    box(1.2, .75, .62, C.wallWarm, [0, .58, -.12]), box(.8, .16, .012, C.window, [0, .7, .2], { glow: true }),
    box(1.3, .1, 1, C.stoneDark, [0, 1.0, 0]), hipRoof(1.18, .88, .36, C.roofRed, 1.05),
  ];
  const office: Part[] = [
    ...plinth(.8, .8),
    box(.6, 1.9, .6, C.wallCool, [0, 1.09, 0]),
    ...[0, 1, 2, 3, 4].map((i): Part => box(.62, .1, .62, i % 2 ? C.glass : C.window, [0, .45 + i * .34, 0], i % 2 ? {} : { glow: true })),
    box(.66, .08, .66, accent, [0, 2.08, 0]), ...group(mast(.4), [.15, 2.12, .1]),
  ];
  const dashboard: Part[] = [
    box(1.1, .04, .9, C.path, [0, .02, 0]),
    ...group(panel(.7, .4, '#bfe3ff', C.slate, .3, true), [0, 0, -.3]),
    ...[-.2, -.05, .1, .25].map((x, i): Part => box(.08, .1 + i * .06, .02, BARS[i], [x, .45 + (.1 + i * .06) / 2, -.26])),
    ...lamp([-.45, 0, .3]), ...lamp([.45, 0, .3]),
  ];
  const warehouse: Part[] = [...plinth(1, .7), ...group(hall({ w: .9, d: .6, h: .5, wall: C.wallWarm, roof: C.roofGreen, kind: 'hip' }), [0, .14, 0]), box(.22, .22, .22, BARS[2], [.55, .11, .2], { fine: true })];
  return [...on(0, archive), ...on(1, office), ...on(2, dashboard), ...on(3, warehouse)];
}

export const CS_LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  algorithms, databases, 'programming-languages': programmingLanguages, networks, 'systems-analysis': systemsAnalysis, 'information-systems': informationSystems,
};
