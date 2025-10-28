import * as React from "react";

export interface ARCanvasProps {
  /**
   * URL to the MindAR marker/target file (.mind file)
   */
  markerUrl: string;
  /**
   * React Three Fiber components to render in AR space
   */
  children?: React.ReactNode;
}

/**
 * ARCanvas component that provides AR tracking using MindAR and React Three Fiber
 *
 * @example
 * ```tsx
 * import { ARCanvas } from 'fiber-mind-ts';
 * import { Box } from '@react-three/drei';
 *
 * function App() {
 *   return (
 *     <ARCanvas markerUrl="/path/to/marker.mind">
 *       <Box args={[1, 1, 1]} />
 *     </ARCanvas>
 *   );
 * }
 * ```
 */
export function ARCanvas(props: ARCanvasProps): React.JSX.Element;

export interface ARContentProps {
  markerUrl: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  containerSize: {
    width: number;
    height: number;
  };
  setContainerSize: React.Dispatch<
    React.SetStateAction<{
      width: number;
      height: number;
    }>
  >;
  webcamRef: React.RefObject<any>;
  isCameraReady: boolean;
  children?: React.ReactNode;
}

/**
 * Internal component that handles AR content rendering
 * Not intended for direct use - use ARCanvas instead
 */
export function ARContent(props: ARContentProps): React.JSX.Element;
