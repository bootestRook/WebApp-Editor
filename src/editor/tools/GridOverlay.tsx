import { BASE_RESOLUTION } from '../../runtime/runtimeTypes';

type Props = {
  width?: number;
  height?: number;
};

export function GridOverlay({ width = BASE_RESOLUTION.width, height = BASE_RESOLUTION.height }: Props) {
  return (
    <div
      className="grid-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(rgba(71, 164, 255, 0.18) 2px, transparent 2px), linear-gradient(90deg, rgba(71, 164, 255, 0.18) 2px, transparent 2px)',
        backgroundSize: '40px 40px, 40px 40px, 200px 200px, 200px 200px',
        pointerEvents: 'none',
        zIndex: 900
      }}
    />
  );
}
