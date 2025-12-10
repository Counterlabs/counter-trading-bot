import { useMemo } from 'react';
import { useAspect, useTexture } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREEWebGPU from 'three/webgpu';
import {
  abs,
  blendScreen,
  float,
  mod,
  mx_cell_noise_float,
  oneMinus,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

const WIDTH = 1600;
const HEIGHT = 900;

export const WebGPUEffectScene = () => {
  const [rawMap, depthMap] = useTexture(['/dark-image.png', '/depth-1.png']);

  const { material, uniforms } = useMemo(() => {
    const uPointer = uniform(new THREEWebGPU.Vector2(0, 0));
    const uProgress = uniform(0);

    const strength = 0.01;

    const tDepthMap = texture(depthMap);

    const tMap = texture(
      rawMap,
      uv().add(tDepthMap.r.mul(uPointer).mul(strength))
    );

    // Apply subtle darkening to the new dark image (adjust if needed)
    const darkenedMap = tMap.mul(0.5);

    const aspect = float(WIDTH).div(HEIGHT);
    const tUv = vec2(uv().x.mul(aspect), uv().y);

    const tiling = vec2(120.0);
    const tiledUv = mod(tUv.mul(tiling), 2.0).sub(1.0);

    const brightness = mx_cell_noise_float(tUv.mul(tiling).div(2));

    const dist = float(tiledUv.length());
    const dot = float(smoothstep(0.5, 0.49, dist)).mul(brightness);

    const depth = tDepthMap;

    // Flow shell in depth space
    const flow = oneMinus(smoothstep(0, 0.02, abs(depth.sub(uProgress))));

    // Cyan mask with boosted intensity for high visibility (increased to 15x)
    const mask = dot.mul(flow).mul(vec3(0, 15, 15));

    const final = blendScreen(darkenedMap, mask);

    const material = new THREEWebGPU.MeshBasicNodeMaterial({
      colorNode: final,
    });

    return {
      material,
      uniforms: {
        uPointer,
        uProgress,
      },
    };
  }, [rawMap, depthMap]);

  const [w, h] = useAspect(WIDTH, HEIGHT);

  useFrame(({ pointer, clock }) => {
    uniforms.uPointer.value = pointer;

    const duration = 3.0;
    const t = clock.getElapsedTime();
    const cycle = (t / duration) % 1.0;
    // Approximate power1.out easing: 1 - (1 - x)^2
    const eased = 1.0 - Math.pow(1.0 - cycle, 2.0);
    uniforms.uProgress.value = eased;
  });

  return (
    <mesh scale={[w, h, 1]} material={material as any}>
      <planeGeometry />
    </mesh>
  );
};
