"use client";

import Link from "next/link";

type Props = {
  text: string;
  href: string;
  cta: string;
  /** 次要链接（可选），如「或先去别处」 */
  secondaryHref?: string;
  secondaryCta?: string;
};

/**
 * 关键动作完成后的「下一步」引导条，把四散的页面缝成一条主线
 * （模特创建 → 上传商品 → 批量出图 → 下载）。
 */
export function NextStepBar({ text, href, cta, secondaryHref, secondaryCta }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-900 bg-zinc-950 p-4 text-zinc-50 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm">{text}</div>
      <div className="flex items-center gap-2">
        {secondaryHref && secondaryCta ? (
          <Link
            href={secondaryHref}
            className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            {secondaryCta}
          </Link>
        ) : null}
        <Link
          href={href}
          className="rounded-full bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-200"
        >
          {cta} →
        </Link>
      </div>
    </div>
  );
}
