"use client";

import Link from "next/link";

export default function StylistPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">AI 穿搭顾问</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">结构化建议 + 必带数字人预览（下一步）</div>
        <div className="mt-2 text-sm text-zinc-600">
          每条建议必须绑定数字人可视化预览图。当前阶段先把试穿渲染链路跑稳，随后接入订单数据、天气与趋势 RAG。
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700">
        <div className="font-medium">推荐引擎将使用</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>多模态风格识别：为历史购买与衣橱单品打标签（目标准确率≥90%）</li>
          <li>RAG：趋势知识库（VOGUE/WGSN等）+ 证据引用，降低幻觉</li>
          <li>Agent：Outfit Planner 产出结构化搭配，Try-on Renderer 输出预览图</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <Link
            href="/studio"
            className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
          >
            先把试穿跑通
          </Link>
          <Link
            href="/orders"
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            去接入订单
          </Link>
        </div>
      </div>
    </div>
  );
}

