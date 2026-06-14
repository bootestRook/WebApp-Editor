import type { CSSProperties, PointerEvent } from 'react';
import type { RuntimeElement } from './runtimeTypes';

type Props = {
  element: RuntimeElement;
  assetBaseUrl?: string;
  interactive?: boolean;
  selected?: boolean;
  onSelect?: (id: string, event: PointerEvent<HTMLDivElement>) => void;
};

function resolveAssetUrl(src: string | undefined, assetBaseUrl: string | undefined) {
  if (!src) {
    return '';
  }

  if (/^(https?:|data:|\/)/.test(src)) {
    return src;
  }

  return `${assetBaseUrl ?? '/__webapp_editor/assets'}/${src}`;
}

export function RuntimeElementRenderer({ element, assetBaseUrl, interactive, selected, onSelect }: Props) {
  if (element.visible === false) {
    return null;
  }

  const commonStyle: CSSProperties = {
    position: 'absolute',
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
    overflow: 'hidden',
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    transformOrigin: 'center center',
    userSelect: 'none',
    pointerEvents: interactive ? 'auto' : 'none'
  };

  const style = element.style ?? {};

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }

    event.stopPropagation();
    onSelect?.(element.id, event);
  };

  const className = `runtime-element runtime-element-${element.type}${selected ? ' is-selected' : ''}`;

  if (element.type === 'text') {
    return (
      <div
        className={className}
        data-element-id={element.id}
        onPointerDown={handlePointerDown}
        style={{
          ...commonStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            style.textAlign === 'right' ? 'flex-end' : style.textAlign === 'center' ? 'center' : 'flex-start',
          color: style.color ?? '#ffffff',
          fontSize: style.fontSize ?? 24,
          fontWeight: style.fontWeight ?? 500,
          lineHeight: 1.15,
          textAlign: style.textAlign ?? 'left',
          whiteSpace: 'pre-wrap'
        }}
      >
        {element.text}
      </div>
    );
  }

  if (element.type === 'button') {
    return (
      <div
        className={className}
        data-element-id={element.id}
        onPointerDown={handlePointerDown}
        style={{
          ...commonStyle,
          display: 'grid',
          placeItems: 'center',
          color: style.color ?? '#ffffff',
          background: style.fill ?? '#2f80ed',
          borderRadius: style.radius ?? 8,
          fontSize: style.fontSize ?? 24,
          fontWeight: style.fontWeight ?? 700
        }}
      >
        {element.text}
      </div>
    );
  }

  if (element.type === 'image') {
    return (
      <div
        className={className}
        data-element-id={element.id}
        onPointerDown={handlePointerDown}
        style={commonStyle}
      >
        <img
          alt=""
          draggable={false}
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
          src={resolveAssetUrl(element.src, assetBaseUrl)}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: style.fit ?? 'fill'
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      data-element-id={element.id}
      onPointerDown={handlePointerDown}
      style={{
        ...commonStyle,
        background: style.fill ?? '#1f2937',
        border: `${style.borderWidth ?? 0}px solid ${style.borderColor ?? 'transparent'}`,
        borderRadius: style.radius ?? 0
      }}
    />
  );
}
