import * as THREEWebGPU from 'three/webgpu';
import { Canvas, extend } from '@react-three/fiber';
import type { CanvasProps } from '@react-three/fiber';

extend(THREEWebGPU as any);

export const WebGPUCanvas = (props: CanvasProps) => {
  return (
    <Canvas
      {...props}
      flat
      gl={async (canvasProps) => {
        const renderer = new THREEWebGPU.WebGPURenderer(canvasProps as any);
        await renderer.init();
        return renderer as any;
      }}
    >
      {props.children}
    </Canvas>
  );
};
