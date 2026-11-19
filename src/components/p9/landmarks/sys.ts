import { C, ball, beam, box, cone, cyl, dome, group, hall, lamp, mast, on, panel, plinth, ring, tower, type Part, type Piece } from './kit';

/*
 * P9.3 Batch 5, 系統與雲端工程群島: machine rooms, network bases, data centres and cloud facilities. Concrete greys,
 * steel, status lights in green and amber. Tile 0 is each island's main landmark.
 */
const CONCRETE = '#cfd5da', RACK = '#2f3a4a', OK = '#34d399', WARN = '#f4b400';
const CONTAINERS = ['#2b7bb9', '#e4572e', '#f4b400', '#3aa76d', '#8a4fd1', '#1f9aa8'] as const;

/** A row of server racks with status lights. */
const racks = (n: number, x0: number, z: number): Part[] => Array.from({ length: n }, (_, i) => i).flatMap((i): Part[] => [
  box(.16, .5, .26, RACK, [x0 + i * .2, .25, z]), box(.1, .02, .012, i % 3 ? OK : WARN, [x0 + i * .2, .38, z + .132], { glow: true }),
  box(.1, .02, .012, OK, [x0 + i * .2, .28, z + .132], { glow: true, fine: true }),
]);

/** Linux 系統島: the Linux Control Center (a terminal bunker, a penguin on the roof), the shell tower, file-tree racks and a lamp. */
function linuxSystems(accent: string): Piece[] {
  const penguin: Part[] = [ball(.16, C.ink, [0, .16, 0]), ball(.12, C.white, [0, .16, .07]), ball(.1, C.ink, [0, .38, 0]), cone(.04, .08, WARN, [0, .37, .1], 6, { tilt: Math.PI / 2 }),
    box(.12, .03, .08, WARN, [-.06, .015, .05]), box(.12, .03, .08, WARN, [.06, .015, .05])];
  const control: Part[] = [
    ...plinth(1.25, .95),
    box(1.1, .55, .8, CONCRETE, [0, .42, 0]), box(.9, .2, .012, '#0b1f17', [0, .5, .406]), box(.8, .03, .014, OK, [-.02, .54, .41], { glow: true }), box(.5, .03, .014, OK, [-.17, .47, .41], { glow: true }),
    box(1.16, .08, .86, RACK, [0, .73, 0]), ...group(penguin, [0, .77, 0]),
    ...group(mast(.6), [.42, .77, -.25]),
  ];
  const shell: Part[] = [...plinth(.6, .6), ...group(tower({ r: .2, h: 1.3, color: CONCRETE, sides: 6, cap: 'flat', capColor: RACK }), [0, .14, 0]), box(.26, .1, .012, OK, [0, 1.0, .2], { glow: true }), cone(.06, .3, accent, [0, 1.65, 0], 6)];
  const tree: Part[] = [box(.9, .04, .7, C.path, [0, .02, 0]), ...racks(4, -.3, -.15), beam([-.3, .55, .1], [.3, .55, .1], .03, .03, C.steel), ...[-.3, -.1, .1, .3].map((x): Part => box(.02, .2, .02, C.steel, [x, .45, .1], { fine: true }))];
  const lampPost: Part[] = [...lamp([0, 0, 0]), box(.3, .2, .3, accent, [.25, .1, .1])];
  return [...on(0, control), ...on(1, shell), ...on(2, tree), ...on(3, lampPost)];
}

/** 網路與伺服器島: the Network Comms Tower, a server hall, the DNS/TLS security gate and a cable house. */
function networkServers(accent: string): Piece[] {
  const comms: Part[] = [...plinth(.8, .8), cyl(.08, .16, 2.6, C.steel, [0, 1.44, 0], 6), ...[1.1, 1.7, 2.2].flatMap((y, i): Part[] => [cyl(.2, .2, .06, i === 1 ? accent : C.steel, [0, y, 0], 8), cone(.18, .1, C.white, [.2, y + .05, 0], 10, { roll: -Math.PI / 2.4, turn: i * 2 })]), ball(.07, '#ff6b5a', [0, 2.8, 0], { glow: true })];
  const hallParts: Part[] = [...plinth(1.15, .8), ...group(hall({ w: 1, d: .7, h: .6, wall: CONCRETE, roof: RACK, kind: 'flat', windows: null }), [0, .14, 0]), ...racks(5, -.4, .58)];
  // Security gate: two pylons, a lintel, a padlock in the accent, barrier arm.
  const gate: Part[] = [box(.3, .03, .9, C.path, [0, .015, 0]), box(.14, .9, .14, CONCRETE, [-.35, .45, 0]), box(.14, .9, .14, CONCRETE, [.35, .45, 0]), box(.9, .14, .18, RACK, [0, .97, 0]),
    box(.22, .18, .1, accent, [0, 1.18, 0]), ring(.07, .025, accent, [0, 1.3, 0], { tilt: 0 }), box(.6, .04, .04, '#db4437', [0, .4, .1]), ball(.04, OK, [-.35, .95, .08], { glow: true })];
  const cable: Part[] = [...plinth(.7, .55), ...group(hall({ w: .6, d: .45, h: .4, wall: C.wallCool, roof: accent, kind: 'hip' }), [0, .14, 0])];
  return [...on(0, comms), ...on(1, hallParts), ...on(2, gate), ...on(3, cable)];
}

/** DevOps 與 CI/CD 島: the Pipeline Factory (build → test → release on a conveyor), its build tower, a test station and a release ramp. */
function devopsCicd(accent: string): Piece[] {
  const factory: Part[] = [
    ...plinth(1.3, .9),
    ...group(hall({ w: 1.15, d: .7, h: .6, wall: CONCRETE, roof: RACK, kind: 'flat' }), [0, .14, -.05]),
    ...group(tower({ r: .14, h: .9, color: C.steel, sides: 8, cap: 'flat', capColor: accent, windows: false }), [.4, .74, -.2]),
    box(1.35, .07, .2, RACK, [0, .3, .5]), ...[-.45, -.15, .15, .45].map((x, i): Part => box(.16, .14, .16, [WARN, '#4285f4', OK, accent][i], [x, .41, .5])),
    ...[-.45, .45].map((x): Part => ball(.05, OK, [x, .9, .3], { glow: true })),
  ];
  const tests: Part[] = [...plinth(.8, .6), ...group(hall({ w: .7, d: .5, h: .45, wall: C.wall, roof: '#4285f4', kind: 'hip' }), [0, .14, 0]), ...[0, 1, 2].map((i): Part => ball(.05, i < 2 ? OK : '#db4437', [-.15 + i * .15, .5, .26], { glow: true }))];
  const ramp: Part[] = [box(.4, .06, 1, C.stoneDark, [0, .25, 0], { tilt: -.45 }), box(.3, .3, .3, OK, [0, .55, -.25]), cone(.12, .3, accent, [0, .85, -.25], 4), ...lamp([.35, 0, .3])];
  const gears: Part[] = [ring(.22, .06, C.steel, [-.15, .3, 0], { tilt: 0 }), ring(.15, .05, accent, [.2, .22, .05], { tilt: 0 }), box(.9, .04, .4, C.path, [0, .02, 0])];
  return [...on(0, factory), ...on(1, tests), ...on(2, ramp), ...on(3, gears)];
}

/** Docker 容器島: the Container Base (stacked containers under a gantry crane), a container yard, the harbour crane and a whale. */
function dockerContainers(accent: string): Piece[] {
  const container = (c: string, x: number, y: number, z: number, turn = 0): Part[] => [box(.5, .22, .22, c, [x, y + .11, z], { turn }), box(.5, .02, .23, C.white, [x, y + .23, z], { turn, fine: true })];
  const base: Part[] = [
    box(1.3, .08, 1, CONCRETE, [0, .04, 0]),
    ...container(CONTAINERS[0], -.3, .08, -.15), ...container(CONTAINERS[1], .25, .08, -.15), ...container(CONTAINERS[2], -.3, .08, .15), ...container(CONTAINERS[3], .25, .08, .15),
    ...container(CONTAINERS[4], -.02, .32, -.05), ...container(accent, -.02, .56, 0),
    ...[-.6, .6].flatMap((x): Part[] => [box(.06, 1.3, .06, WARN, [x, .65, -.35]), box(.06, 1.3, .06, WARN, [x, .65, .35])]), box(1.3, .08, .08, WARN, [0, 1.3, -.35]), box(1.3, .08, .08, WARN, [0, 1.3, .35]),
    box(.2, .1, .78, RACK, [.2, 1.22, 0]), ball(.05, '#ff6b5a', [-.6, 1.4, -.35], { glow: true }),
  ];
  const yard: Part[] = [box(1, .04, .8, CONCRETE, [0, .02, 0]), ...container(CONTAINERS[5], -.2, .04, -.2, .1), ...container(CONTAINERS[2], .2, .04, .2, -.1), ...container(CONTAINERS[0], -.15, .28, -.15, .2), ...lamp([.4, 0, -.3])];
  const crane: Part[] = [box(.4, .1, .4, CONCRETE, [0, .05, 0]), box(.1, 1.6, .1, WARN, [0, .9, 0]), beam([-.3, 1.7, 0], [.8, 1.7, 0], .08, .08, WARN), cyl(.01, .01, .6, C.slate, [.6, 1.4, 0], 4, { fine: true }), box(.3, .14, .14, CONTAINERS[1], [.6, 1.05, 0]), box(.22, .22, .2, RACK, [-.22, 1.7, 0])];
  const whale: Part[] = [ball(.3, '#2b7bb9', [0, .22, 0], { scale: [1.5, .9, 1] }), cone(.12, .2, '#2b7bb9', [-.48, .28, 0], 4, { roll: Math.PI / 2 }), ...[0, 1, 2].map((i): Part => box(.12, .08, .12, CONTAINERS[i], [-.12 + i * .13, .5, 0])), ball(.03, C.white, [.3, .3, .2])];
  return [...on(0, base), ...on(1, yard), ...on(2, crane), ...on(3, whale)];
}

/** 雲端基礎設施島: the Cloud Deployment Center (a cloud on the roof), a data-centre hall, cooling and a landing pad. */
function cloudInfrastructure(accent: string): Piece[] {
  const center: Part[] = [
    ...plinth(1.2, .9),
    ...group(hall({ w: 1, d: .75, h: .7, wall: C.wallCool, roof: C.roofDark, kind: 'flat' }), [0, .14, 0]),
    cyl(.04, .04, .4, C.steel, [0, 1.15, 0], 5),
    ...[[0, 0, 0, .28], [-.28, -.05, .05, .2], [.28, -.04, -.05, .22], [.12, .14, .1, .18], [-.12, .1, -.1, .17]].map(([x, y, z, r]): Part => ball(r, C.white, [x, 1.5 + y, z])),
    ball(.06, accent, [0, 1.85, 0], { glow: true }),
  ];
  const dc: Part[] = [...plinth(1.15, .8), ...group(hall({ w: 1, d: .7, h: .5, wall: CONCRETE, roof: RACK, kind: 'flat', windows: null }), [0, .14, 0]), ...racks(5, -.4, .58)];
  const cooling: Part[] = [...plinth(.9, .6), ...[-.22, .22].flatMap((x): Part[] => [cyl(.2, .2, .5, C.steel, [x, .39, 0], 12), ring(.15, .03, RACK, [x, .66, 0])])];
  const pad: Part[] = [cyl(.5, .5, .08, CONCRETE, [0, .04, 0], 12), ring(.38, .03, WARN, [0, .09, 0]), box(.3, .02, .06, WARN, [0, .09, 0]), ...lamp([.42, .08, 0]), ...lamp([-.42, .08, 0])];
  return [...on(0, center), ...on(1, dc), ...on(2, cooling), ...on(3, pad)];
}

/** Kubernetes 與可靠性工程島: the SLO Observatory (a dome and a helm wheel), a pod cluster, a monitoring wall and a gauge garden. */
function kubernetesReliability(accent: string): Piece[] {
  const observatory: Part[] = [
    ...plinth(1.1, 1),
    cyl(.45, .5, .55, C.wall, [0, .42, 0], 10), cyl(.47, .47, .06, C.window, [0, .55, 0], 10, { glow: true }), dome(.45, '#326ce5', [0, .7, 0]),
    ring(.32, .04, accent, [0, 1.38, 0], { tilt: 0 }), ...[0, 1, 2, 3, 4, 5, 6].map((i): Part => { const a = i * Math.PI * 2 / 7; return beam([0, 1.38, 0], [Math.cos(a) * .32, 1.38 + Math.sin(a) * .32, 0], .03, .03, accent); }),
    cyl(.04, .04, .4, C.slate, [0, 1.1, 0], 5),
  ];
  const pods: Part[] = [cyl(.55, .58, .06, CONCRETE, [0, .03, 0], 6), ...[[0, 0], [.32, .18], [-.32, .18], [0, -.36]].flatMap(([x, z], i): Part[] => [cyl(.15, .15, .28, i ? '#326ce5' : accent, [x, .2, z], 6), ball(.03, OK, [x, .38, z], { glow: true })])];
  const wall: Part[] = [...panel(.8, .45, '#0b1f17', C.slate, .25, true), ...[0, 1, 2, 3, 4, 5, 6].map((i): Part => box(.08, .03, .012, i === 5 ? WARN : OK, [-.3 + i * .1, .4 + (i % 3) * .1, .05], { glow: true }))];
  const gauges: Part[] = [box(.9, .03, .6, C.path, [0, .015, 0]), ...[-.28, 0, .28].flatMap((x, i): Part[] => [cyl(.12, .12, .04, C.white, [x, .45, 0], 16, { tilt: Math.PI / 2 }), box(.02, .1, .01, i === 2 ? WARN : OK, [x, .48, .03], { roll: -.6 + i * .5 }), box(.04, .4, .04, C.slate, [x, .2, -.03], { fine: true })])];
  return [...on(0, observatory), ...on(1, pods), ...on(2, wall), ...on(3, gauges)];
}

export const SYS_LANDMARKS: Record<string, (accent: string) => Piece[]> = {
  'linux-systems': linuxSystems, 'network-servers': networkServers, 'devops-cicd': devopsCicd,
  'docker-containers': dockerContainers, 'cloud-infrastructure': cloudInfrastructure, 'kubernetes-reliability': kubernetesReliability,
};
