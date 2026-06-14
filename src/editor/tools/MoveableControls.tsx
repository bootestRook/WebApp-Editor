import { useRef, type PointerEvent } from 'react';
import type { RuntimeElement } from '../../runtime/runtimeTypes';

export type DragMode = 'move' | 'resize';
export type DragChangeOptions = {
  constrainProportions: boolean;
};

type DragState = {
  pointerId: number;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startElement: RuntimeElement;
};

type Props = {
  element: RuntimeElement;
  scale: number;
  onChange: (
    patch: Pick<RuntimeElement, 'x' | 'y' | 'width' | 'height'>,
    mode: DragMode,
    options: DragChangeOptions
  ) => void;
  onBeginChange: (mode: DragMode) => void;
  onEndChange: () => void;
};

function toInt(value: number) {
  return Math.round(value);
}

function getConstrainedSize(start: RuntimeElement, width: number, height: number) {
  const minScale = Math.max(8 / start.width, 8 / start.height);
  const widthScale = width / start.width;
  const heightScale = height / start.height;
  const uniformScale =
    Math.abs(widthScale - 1) >= Math.abs(heightScale - 1) ? widthScale : heightScale;
  const nextScale = Math.max(minScale, uniformScale);

  return {
    width: Math.max(8, toInt(start.width * nextScale)),
    height: Math.max(8, toInt(start.height * nextScale))
  };
}

export function MoveableControls({ element, scale, onChange, onBeginChange, onEndChange }: Props) {
  const drag = useRef<DragState | null>(null);

  const startDrag = (mode: DragMode) => (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onBeginChange(mode);
    drag.current = {
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startElement: element
    };
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = (event.clientX - drag.current.startClientX) / scale;
    const deltaY = (event.clientY - drag.current.startClientY) / scale;
    const start = drag.current.startElement;

    if (drag.current.mode === 'resize') {
      const rawWidth = Math.max(8, start.width + deltaX);
      const rawHeight = Math.max(8, start.height + deltaY);
      const nextSize = event.shiftKey
        ? getConstrainedSize(start, rawWidth, rawHeight)
        : { width: toInt(rawWidth), height: toInt(rawHeight) };

      onChange(
        {
          x: start.x,
          y: start.y,
          width: nextSize.width,
          height: nextSize.height
        },
        'resize',
        { constrainProportions: event.shiftKey }
      );
      return;
    }

    onChange(
      {
        x: toInt(start.x + deltaX),
        y: toInt(start.y + deltaY),
        width: start.width,
        height: start.height
      },
      'move',
      { constrainProportions: false }
    );
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null;
      onEndChange();
    }
  };

  return (
    <div
      className="moveable-frame"
      onPointerDown={startDrag('move')}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: 'center center'
      }}
    >
      <div
        aria-label="Resize selected element"
        className="moveable-handle moveable-handle-se"
        onPointerDown={startDrag('resize')}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  );
}
