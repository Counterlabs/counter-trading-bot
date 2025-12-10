import { Suspense } from 'react';
import { WebGPUCanvas } from './WebGPUCanvas';
import { WebGPUEffectScene } from './WebGPUEffectScene';
import { WebGPUPostProcessing } from './WebGPUPostProcessing';

const Scene = () => {
  return (
    <div className="fixed inset-0 z-0 bg-[#050505]">
      <WebGPUCanvas camera={{ position: [0, 0, 1], fov: 75 }}>
        <Suspense fallback={null}>
          <WebGPUEffectScene />
          <WebGPUPostProcessing strength={1} threshold={1} />
        </Suspense>
      </WebGPUCanvas>
      {/* Lighter overlay since base image is now much darker */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/40 pointer-events-none" />
    </div>
  );
};

export default Scene;
