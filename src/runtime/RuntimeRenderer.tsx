import type { PointerEvent, ReactNode } from 'react';
import { RuntimeElementRenderer } from './RuntimeElementRenderer';
import { BASE_RESOLUTION, type RuntimeElement, type WebAppLayout } from './runtimeTypes';

type Props = {
  layout: WebAppLayout;
  interactive?: boolean;
  selectedElementId?: string | null;
  selectedElementIds?: string[];
  assetBaseUrl?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  children?: ReactNode;
  onSelect?: (id: string | null, event: PointerEvent<HTMLDivElement>) => void;
};

function getLayerOrder(element: RuntimeElement) {
  return element.layerOrder ?? 0;
}

function getOrderInLayer(element: RuntimeElement) {
  return element.orderInLayer ?? 0;
}

function getSortedElements(elements: RuntimeElement[]) {
  return elements
    .map((element, index) => ({ element, index }))
    .sort((left, right) => {
      const layerDelta = getLayerOrder(left.element) - getLayerOrder(right.element);
      if (layerDelta !== 0) {
        return layerDelta;
      }

      const orderDelta = getOrderInLayer(left.element) - getOrderInLayer(right.element);
      if (orderDelta !== 0) {
        return orderDelta;
      }

      return left.index - right.index;
    })
    .map((item) => item.element);
}

export function RuntimeRenderer({
  layout,
  interactive = false,
  selectedElementId,
  selectedElementIds,
  assetBaseUrl,
  viewportWidth = BASE_RESOLUTION.width,
  viewportHeight = BASE_RESOLUTION.height,
  children,
  onSelect
}: Props) {
  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).classList.contains('runtime-canvas')) {
      onSelect?.(null, event);
    }
  };

  return (
    <div
      className="runtime-canvas"
      onPointerDown={interactive ? handleCanvasPointerDown : undefined}
      style={{
        position: 'relative',
        width: viewportWidth,
        height: viewportHeight,
        background: '#0f141d',
        overflow: 'hidden'
      }}
    >
      {getSortedElements(layout.elements).map((element) => (
        <RuntimeElementRenderer
          key={element.id}
          assetBaseUrl={assetBaseUrl}
          element={element}
          interactive={interactive}
          onSelect={onSelect}
          selected={selectedElementIds ? selectedElementIds.includes(element.id) : selectedElementId === element.id}
        />
      ))}
      {children}
    </div>
  );
}
