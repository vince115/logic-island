'use client';

import { Component, type ReactNode } from 'react';
import styles from '../islands.module.css';

/**
 * D.3-2: catches anything the 3D scene throws (R3F turns a WebGL context that cannot be created into a render
 * error) and hands over to the list, as the production /islands page does with its own boundary.
 */
export class SceneBoundary extends Component<{children:ReactNode;onUnavailable:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onUnavailable();}
  render(){return this.state.failed?<p className={styles.canvasFallback}>3D 場景暫時無法載入，教材清單仍可使用。</p>:this.props.children;}
}
