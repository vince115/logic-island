import { C, ball, beam, box, cone, cyl, dome, group, hall, lamp, mast, on, panel, plinth, ring, tower, type Part, type Piece, type V3 } from './kit';

/*
 * P9.3 Batch 2, AI 人工智慧群島: a research base. White and cool-grey buildings, glass, dark roofs, glowing nodes; each
 * island's accent marks its main landmark. Tile 0 is the main landmark (the raised site nearest the plaza).
 */
const NODE_2 = '#2bb5c9', DARK = '#2f3a4a';

/** A layer of nodes on a ring at height y, and the beams that join each node to the layer below. */
function layers(counts: number[], radius: number[], y0: number, dy: number, color: string): Part[] {
  const at = (layer: number, i: number): V3 => { const a = i * Math.PI * 2 / counts[layer] + layer * .4; return [Math.cos(a) * radius[layer], y0 + layer * dy, Math.sin(a) * radius[layer]]; };
  const parts: Part[] = [];
  counts.forEach((n, layer) => { for (let i = 0; i < n; i++) parts.push(ball(.07, layer % 2 ? NODE_2 : color, at(layer, i), { glow: true })); });
  for (let layer = 1; layer < counts.length; layer++) for (let i = 0; i < counts[layer]; i++) for (let j = 0; j < counts[layer - 1]; j += 2)
    parts.push(beam(at(layer - 1, j), at(layer, i), .018, .018, C.steel, { fine: true }));
  return parts;
}

/** 大型語言模型島: the LLM Library under its dome, the Token Tower, a reading pavilion and scroll stands. */
function largeLanguageModels(accent: string): Piece[] {
  const library: Part[] = [
    ...plinth(1.3, 1.1, C.stone, .18),
    box(1.1, .7, .9, C.wall, [0, .53, 0]), ...[-.42, -.14, .14, .42].map((x): Part => cyl(.05, .06, .7, C.wallWarm, [x, .53, .47], 8)),
    box(.8, .16, .012, C.window, [0, .62, .455], { glow: true }), box(1.16, .08, .96, C.stoneDark, [0, .92, 0]),
    cyl(.38, .4, .3, C.wallCool, [0, 1.11, 0], 12), dome(.38, accent, [0, 1.26, 0]), ball(.07, C.gold, [0, 1.68, 0]),
  ];
  const tokens: Part[] = [
    ...plinth(.6, .6),
    ...['#7c5cff', '#2bb5c9', '#f4b400', '#34a853', '#db4437', '#4285f4', '#8a4fd1'].map((c, i): Part => box(.34, .2, .34, c, [((i % 2) - .5) * .06, .26 + i * .22, 0], { turn: i * .3 })),
    ball(.09, C.window, [0, 1.85, 0], { glow: true }),
  ];
  const pavilion: Part[] = [
    cyl(.5, .52, .08, C.stoneDark, [0, .04, 0], 8), ...[0, 1, 2, 3, 4, 5].map((i): Part => cyl(.035, .035, .6, C.wall, [Math.cos(i * Math.PI / 3) * .42, .38, Math.sin(i * Math.PI / 3) * .42], 6)),
    cone(.6, .3, C.roofDark, [0, .83, 0], 6), box(.4, .1, .2, C.woodDark, [0, .15, 0], { fine: true }),
  ];
  const scrolls: Part[] = [box(.9, .03, .5, C.path, [0, .015, 0]), ...[-.3, 0, .3].flatMap((x): Part[] => [box(.04, .45, .04, C.woodDark, [x, .22, 0]), cyl(.06, .06, .3, '#f3ead6', [x, .5, 0], 8, { roll: Math.PI / 2 })]), ...lamp([.42, 0, .2])];
  return [...on(0, library), ...on(1, tokens), ...on(2, pavilion), ...on(3, scrolls)];
}

/** 深度學習島: the Neural Network Tower, the GPU hall, a node garden and a cooling plant. */
function deepLearning(accent: string): Piece[] {
  const neural: Part[] = [
    ...plinth(1, 1),
    cyl(.16, .22, 2.1, DARK, [0, 1.19, 0], 8), cyl(.3, .3, .1, accent, [0, .3, 0], 8),
    ...layers([6, 5, 4, 2], [.5, .44, .36, .2], .6, .45, accent), ball(.12, accent, [0, 2.35, 0], { glow: true }),
  ];
  const gpu: Part[] = [
    ...plinth(1.1, .8),
    box(1, .5, .7, DARK, [0, .39, 0]), ...[-.36, -.18, 0, .18, .36].map((x): Part => box(.08, .52, .72, '#3c4a5c', [x, .4, 0])),
    box(.9, .08, .012, '#7ef0c8', [0, .5, .356], { glow: true }), box(1.04, .06, .74, accent, [0, .67, 0]),
  ];
  const garden: Part[] = [cyl(.55, .58, .06, C.path, [0, .03, 0], 12), ...layers([4, 3, 1], [.42, .3, 0], .2, .3, accent).map(p => ({ ...p, fine: undefined })), ...lamp([.5, 0, .3])];
  const cooling: Part[] = [...plinth(.9, .7), ...[-.22, .22].map((x): Part => cyl(.2, .26, .7, C.wallCool, [x, .49, 0], 10)), ...[-.22, .22].map((x): Part => cyl(.17, .17, .06, accent, [x, .87, 0], 10)), beam([-.22, .5, 0], [.22, .5, 0], .05, .05, C.steel)];
  return [...on(0, neural), ...on(1, gpu), ...on(2, garden), ...on(3, cooling)];
}

/** 機器學習島: the ML Research Center, data silos, the decision-tree sculpture and a learning-curve board. */
function machineLearning(accent: string): Piece[] {
  const center: Part[] = [
    ...plinth(1.2, 1),
    ...group(hall({ w: 1.05, d: .8, h: .6, wall: C.wall, roof: C.roofDark, kind: 'flat' }), [0, .14, 0]),
    cyl(.28, .3, .3, C.wallCool, [.2, 1.05, 0], 10), dome(.28, accent, [.2, 1.2, 0]), cyl(.04, .05, .4, C.slate, [.2, 1.45, .12], 6, { tilt: -.6 }),
  ];
  const silos: Part[] = [...plinth(1, .7), ...[-.3, 0, .3].map((x, i): Part[] => [cyl(.15, .15, .7 + i * .2, C.wallCool, [x, .49 + i * .1, 0], 10), cone(.17, .14, accent, [x, .91 + i * .2, 0], 10)]).flat()];
  // Decision tree: a root box, two branches, four leaves, all on rods.
  const n = (x: number, y: number, c: string): Part[] => [box(.14, .1, .14, c, [x, y, 0]), cyl(.015, .015, y, C.slate, [x, y / 2, 0], 4, { fine: true })];
  const tree: Part[] = [box(.9, .04, .4, C.path, [0, .02, 0]), ...n(0, 1.2, accent), ...n(-.25, .85, '#f4b400'), ...n(.25, .85, '#f4b400'), ...[-.4, -.12, .12, .4].flatMap(x => n(x, .5, '#34a853')),
    beam([0, 1.2, 0], [-.25, .85, 0], .03, .03, C.slate), beam([0, 1.2, 0], [.25, .85, 0], .03, .03, C.slate),
    beam([-.25, .85, 0], [-.4, .5, 0], .025, .025, C.slate), beam([-.25, .85, 0], [-.12, .5, 0], .025, .025, C.slate),
    beam([.25, .85, 0], [.12, .5, 0], .025, .025, C.slate), beam([.25, .85, 0], [.4, .5, 0], .025, .025, C.slate)];
  const curve: Part[] = [...panel(.7, .4, '#eaf4ff', C.slate, .3, true), ...[0, 1, 2, 3, 4].map((i): Part => box(.1, .03, .02, accent, [-.25 + i * .12, .4 + .25 * (1 - Math.exp(-i * .8)), .05]))];
  return [...on(0, center), ...on(1, silos), ...on(2, tree), ...on(3, curve)];
}

/** AI 工程與 MLOps 島: the model pipeline factory, its control tower, a deployment pad and monitors. */
function aiEngineering(accent: string): Piece[] {
  const factory: Part[] = [
    ...plinth(1.25, .9),
    ...group(hall({ w: 1.1, d: .75, h: .65, wall: C.wallCool, roof: C.roofDark, kind: 'flat' }), [0, .14, 0]),
    cyl(.1, .12, .8, C.slate, [.38, 1.2, -.2], 8), cyl(.12, .12, .06, accent, [.38, 1.6, -.2], 8),
    box(1.3, .08, .2, DARK, [0, .3, .5]), ...[-.4, -.1, .2, .5].map((x, i): Part => box(.14, .12, .14, ['#7c5cff', '#2bb5c9', '#f4b400', accent][i], [x, .4, .5])),
  ];
  const control: Part[] = [...plinth(.6, .6), ...group(tower({ r: .16, h: 1.4, color: C.wall, sides: 6, cap: 'flat', capColor: DARK, windows: false }), [0, .14, 0]),
    cyl(.32, .28, .26, C.glass, [0, 1.67, 0], 8, { glow: true }), cyl(.34, .34, .06, accent, [0, 1.83, 0], 8)];
  const pad: Part[] = [cyl(.55, .55, .08, C.stoneDark, [0, .04, 0], 8), ring(.42, .03, accent, [0, .09, 0]), box(.44, .3, .3, '#2bb5c9', [0, .23, 0]), box(.46, .04, .32, C.white, [0, .4, 0]), ...lamp([.45, .08, .3]), ...lamp([-.45, .08, -.3])];
  const monitors: Part[] = [...group(panel(.4, .26, '#bfe3ff', C.slate, .25, true), [-.25, 0, 0], .3), ...group(panel(.4, .26, '#c6f6d5', C.slate, .25, true), [.25, 0, 0], -.3)];
  return [...on(0, factory), ...on(1, control), ...on(2, pad), ...on(3, monitors)];
}

/** AI 代理島: the Multi-Agent Control Center (a dome and its pods), agent robots, a comms mast and a relay. */
function aiAgents(accent: string): Piece[] {
  const pods: V3[] = [[.62, .25, 0], [-.31, .25, .54], [-.31, .25, -.54]];
  const center: Part[] = [
    cyl(.5, .55, .2, C.stoneDark, [0, .1, 0], 10), cyl(.45, .45, .35, C.wall, [0, .38, 0], 12), cyl(.46, .46, .07, C.window, [0, .45, 0], 12, { glow: true }), dome(.45, accent, [0, .55, 0]),
    ...pods.flatMap((p): Part[] => [dome(.17, C.wallCool, p), beam([0, .35, 0], [p[0], .3, p[2]], .06, .06, C.steel)]),
    ...group(mast(.5), [0, 1.0, 0]),
  ];
  const robot = (c: string): Part[] => [cyl(.1, .12, .3, C.wall, [0, .15, 0], 8), ball(.09, c, [0, .38, 0]), box(.1, .03, .02, '#7ef0c8', [0, .4, .085], { glow: true }), cyl(.01, .01, .12, C.slate, [0, .52, 0], 4, { fine: true })];
  const robots: Part[] = [box(.9, .03, .7, C.path, [0, .015, 0]), ...group(robot(accent), [-.25, 0, -.15]), ...group(robot('#2bb5c9'), [.2, 0, -.2]), ...group(robot('#f4b400'), [0, 0, .22])];
  const comms: Part[] = [...plinth(.5, .5), ...group(mast(1.8), [0, .14, 0])];
  const relay: Part[] = [...plinth(.8, .6), ...group(hall({ w: .7, d: .5, h: .45, wall: C.wallCool, roof: accent, kind: 'hip' }), [0, .14, 0])];
  return [...on(0, center), ...on(1, robots), ...on(2, comms), ...on(3, relay)];
}

/** AI 基礎島: the Academy with its clock tower, the math obelisk, a garden of shapes and benches. */
function aiFoundations(accent: string): Piece[] {
  const academy: Part[] = [
    ...plinth(1.25, .9),
    ...group(hall({ w: 1.1, d: .7, h: .6, wall: C.wallWarm, roof: C.roofRed, kind: 'hip' }), [-.12, .14, 0]),
    ...group(tower({ r: .17, h: 1.4, color: C.wall, sides: 4, cap: 'cone', capColor: accent }), [.45, .14, -.1]), cyl(.1, .1, .02, C.white, [.45, 1.2, .07], 12, { tilt: Math.PI / 2 }),
  ];
  const obelisk: Part[] = [box(.5, .12, .5, C.stoneDark, [0, .06, 0]), cyl(.08, .16, 1.5, C.stone, [0, .87, 0], 4, { turn: Math.PI / 4 }), cone(.12, .2, C.gold, [0, 1.72, 0], 4, { turn: Math.PI / 4 })];
  const shapes: Part[] = [box(1, .03, .7, '#cfe3c4', [0, .015, 0]), box(.26, .26, .26, '#4285f4', [-.3, .16, -.1]), ball(.15, '#db4437', [.05, .18, .15]), cone(.16, .32, '#f4b400', [.32, .19, -.12], 3), cyl(.12, .12, .3, '#34a853', [-.05, .18, -.25], 10)];
  const benches: Part[] = [...[-.25, .25].flatMap((x): Part[] => [box(.4, .05, .14, C.wood, [x, .2, 0]), box(.04, .18, .12, C.woodDark, [x - .16, .09, 0], { fine: true }), box(.04, .18, .12, C.woodDark, [x + .16, .09, 0], { fine: true })]), ...lamp([0, 0, .3])];
  return [...on(0, academy), ...on(1, obelisk), ...on(2, shapes), ...on(3, benches)];
}

/** 生成式 AI 島: the Creative Workshop (sawtooth roof), the prism sculpture, a gallery and colour blocks. */
function generativeAi(accent: string): Piece[] {
  const workshop: Part[] = [
    ...plinth(1.25, .9),
    box(1.1, .55, .75, C.wall, [0, .42, 0]), box(.9, .14, .012, C.window, [0, .5, .38], { glow: true }),
    ...[-.36, 0, .36].flatMap((x): Part[] => [box(.34, .3, .75, accent, [x, .82, 0], { roll: .5, scale: [1, 1, 1] }), box(.02, .28, .74, C.glass, [x - .15, .82, 0], { roll: .5, glow: true })]),
    // A spire with a lit lantern: the workshop's mark from afar.
    cyl(.06, .08, .9, C.wall, [-.48, 1.0, -.28], 6), ball(.09, C.window, [-.48, 1.5, -.28], { glow: true }), cone(.1, .3, accent, [-.48, 1.68, -.28], 6),
  ];
  const prism: Part[] = [cyl(.35, .4, .12, C.stoneDark, [0, .06, 0], 6), cone(.32, 1.5, C.glass, [0, .87, 0], 3, { glow: true }), ...['#db4437', '#f4b400', '#34a853', '#4285f4', '#7c5cff'].map((c, i): Part => box(.5, .04, .06, c, [.45, .5 + i * .07, .1 * i - .2], { turn: -.3 }))];
  const gallery: Part[] = [box(1, .03, .6, C.path, [0, .015, 0]), ...[[-.3, '#ffd1dc'], [0, '#c6f6d5'], [.3, '#bfe3ff']].flatMap(([x, c]): Part[] => group(panel(.24, .3, c as string, C.woodDark, .25), [x as number, 0, 0]))];
  const blocks: Part[] = [box(.3, .3, .3, '#db4437', [-.2, .15, -.1], { turn: .3 }), box(.24, .24, .24, '#f4b400', [.15, .12, .1], { turn: .8 }), box(.18, .18, .18, '#4285f4', [-.05, .39, -.08], { turn: .1 }), ...lamp([.35, 0, -.25])];
  return [...on(0, workshop), ...on(1, prism), ...on(2, gallery), ...on(3, blocks)];
}

export const AI_LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  'large-language-models': largeLanguageModels, 'deep-learning': deepLearning, 'machine-learning': machineLearning,
  'ai-engineering': aiEngineering, 'ai-agents': aiAgents, 'ai-foundations': aiFoundations, 'generative-ai': generativeAi,
};
