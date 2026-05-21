"use client";

import { useMemo, useState } from "react";

type Props = {
  src: string;
  alt: string;
  className?: string;
  /**
   * 初始宽高比（宽/高）。在图片未加载前用于占位，避免布局抖动。
   */
  initialAspectRatio?: number;
};

export default function AutoAspectImage({ src, alt, className, initialAspectRatio = 3 / 4 }: Props) {
  const [ratio, setRatio] = useState<number>(initialAspectRatio);

  const wrapperStyle = useMemo(() => ({ aspectRatio: `${ratio}` }), [ratio]);

  return (
    <div className={className} style={wrapperStyle}>
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-contain"
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setRatio(img.naturalWidth / img.naturalHeight);
          }
        }}
      />
    </div>
  );
}

