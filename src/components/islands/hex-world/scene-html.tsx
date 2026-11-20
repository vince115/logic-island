'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

/*
 * P9.8b: when a hex map's HTML overlays (island labels, building anchors, info bubbles) may mount.
 *
 * drei's Html renders its overlay through a React root of its own, in the element the canvas's pointer events are
 * connected to (`events.connected`, else the canvas's parent). R3F connects the events in a layout effect after the
 * canvas's first children have mounted, inside React DOM's commit of the canvas. An Html mounted in that first pass
 * builds its root in the canvas's parent; when the events connect it unmounts that root and builds another in the event
 * element. React DOM is still committing, so it defers the unmount, and when the unmount runs it empties the overlay
 * element the new root has just drawn into: the label stays empty until something renders it again. That is what made
 * labels go missing after the list → 3D switch once the map's content left its canvas (P9.7), and development's
 * StrictMode, which mounts every effect twice, does the same to any Html mounted inside that commit.
 *
 * So an overlay mounts once the events are connected, from a passive effect: in a render of its own, after React DOM's
 * commit, in its final element. Its root is built once, and any unmount runs at once. No timer: it waits for the
 * connection, which comes once per canvas.
 */

/** True once the canvas's pointer events are connected to their element, where drei's Html puts its overlays. */
const useEventsConnected = () => useThree(state => Boolean(state.events.connected));

/** True from the first render after the canvas's events have connected (see above): the overlays can mount. */
export function useOverlaysReady() {
  const connected = useEventsConnected();
  const [ready, setReady] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the overlays mount in a render after React DOM's commit (see above)
  useEffect(() => { if (connected) setReady(true); }, [connected]);
  return ready && connected;
}

/** drei's Html, mounted once the map's overlays can be (useOverlaysReady). Same props. */
export function SceneHtml(props: ComponentProps<typeof Html>) {
  return useOverlaysReady() ? <Html {...props}/> : null;
}
