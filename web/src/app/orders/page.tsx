"use client";

export default function OrdersPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">订单与授权</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">OAuth 接入与 Excel 导入（下一步）</div>
        <div className="mt-2 text-sm text-zinc-600">
          MVP 先打通 Avatar/姿态/试穿闭环；订单接入与风格画像将在下一阶段接入到同一任务系统与 RAG 管线。
        </div>
      </div>
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-sm text-zinc-700">
        <div className="font-medium">即将实现</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600">
          <li>淘宝/亚马逊 OAuth2 PKCE 授权登录与 token 加密存储</li>
          <li>订单同步与标准化 schema（类目筛选准确率≥98%）</li>
          <li>Excel 模板下载、列级校验、行号错误回执（格式错误率≤1%）</li>
        </ul>
      </div>
    </div>
  );
}

