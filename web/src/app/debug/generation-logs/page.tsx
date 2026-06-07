"use client";

import { useEffect, useMemo, useState } from "react";

import {
  absUrl,
  GenerationLogDetail,
  GenerationLogListItem,
  GenerationRound,
  getGenerationLog,
  listGenerationLogs,
} from "@/lib/api";

function formatTime(ms?: number) {
  if (!ms) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

function formatDuration(ms?: number) {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function tokenText(round: GenerationRound) {
  const total = round.attempts.reduce((sum, attempt) => sum + (attempt.usageMetadata?.totalTokenCount ?? 0), 0);
  return total > 0 ? total.toLocaleString("zh-CN") : "未返回";
}

export default function GenerationLogsPage() {
  const [logs, setLogs] = useState<GenerationLogListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GenerationLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextSelectedId?: string | null) {
    const items = await listGenerationLogs(100);
    setLogs(items);
    const targetId = nextSelectedId ?? selectedId ?? items[0]?.id ?? null;
    setSelectedId(targetId);
    if (targetId) {
      setDetail(await getGenerationLog(targetId));
    } else {
      setDetail(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => logs.find((item) => item.id === selectedId), [logs, selectedId]);

  async function selectLog(id: string) {
    setSelectedId(id);
    setError(null);
    setLoading(true);
    try {
      setDetail(await getGenerationLog(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <section className="border-b border-zinc-200 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs text-zinc-500">Debug only</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">图像生成工作流日志</h1>
          </div>
          <button
            className="w-fit rounded-full bg-zinc-950 px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
            onClick={() => {
              setError(null);
              setLoading(true);
              refresh(selectedId)
                .catch((e) => setError(e instanceof Error ? e.message : "刷新失败"))
                .finally(() => setLoading(false));
            }}
          >
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>
        {error ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      </section>

      <div className="grid min-h-[680px] grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="overflow-hidden border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3 text-sm font-medium">
            最近记录 {logs.length}
          </div>
          <div className="max-h-[760px] overflow-auto">
            {logs.length === 0 ? (
              <div className="px-4 py-8 text-sm text-zinc-500">暂无生成日志</div>
            ) : (
              logs.map((item) => {
                const active = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    className={[
                      "block w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors",
                      active ? "bg-zinc-950 text-zinc-50" : "bg-white text-zinc-900 hover:bg-zinc-50",
                    ].join(" ")}
                    onClick={() => selectLog(item.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium">{item.task}</div>
                      <div className={["text-xs", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                        {item.status}
                      </div>
                    </div>
                    <div className={["mt-1 truncate text-xs", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                      {formatTime(item.createdAtMs)} · {item.summary?.roundCount ?? 0} 轮 ·{" "}
                      {item.summary?.remoteCallCount ?? 0} 次调用
                    </div>
                    <div className={["mt-1 text-xs", active ? "text-zinc-300" : "text-zinc-500"].join(" ")}>
                      tokens: {item.summary?.totalTokenCount?.toLocaleString("zh-CN") ?? "未返回"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <main className="min-w-0">
          {!detail ? (
            <div className="flex h-full min-h-[420px] items-center justify-center border border-zinc-200 bg-white text-sm text-zinc-500">
              {loading ? "加载中..." : "选择一条日志"}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <section className="border border-zinc-200 bg-white p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_260px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">{detail.task}</h2>
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">
                        {detail.status}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">jobId: {detail.jobId ?? "-"}</div>
                    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                      <Metric label="生成轮数" value={String(detail.summary?.roundCount ?? 0)} />
                      <Metric label="远程调用" value={String(detail.summary?.remoteCallCount ?? 0)} />
                      <Metric label="成功调用" value={String(detail.summary?.successfulCallCount ?? 0)} />
                      <Metric label="失败调用" value={String(detail.summary?.failedCallCount ?? 0)} />
                      <Metric
                        label="总 tokens"
                        value={detail.summary?.totalTokenCount?.toLocaleString("zh-CN") ?? "未返回"}
                      />
                    </div>
                  </div>
                  <div>
                    {detail.finalImageUrl ? (
                      <img
                        src={absUrl(detail.finalImageUrl)}
                        alt="final result"
                        className="h-64 w-full bg-zinc-50 object-contain"
                      />
                    ) : (
                      <div className="flex h-64 w-full items-center justify-center bg-zinc-50 text-xs text-zinc-500">
                        无最终图片
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-5">
                {detail.rounds.map((round) => (
                  <RoundPanel key={`${round.roundIndex}-${round.kind}`} round={round} />
                ))}
              </section>

              <details className="border border-zinc-200 bg-white p-5">
                <summary className="cursor-pointer text-sm font-medium">原始 inputs / constraints / meta</summary>
                <pre className="mt-4 overflow-auto bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
                  {JSON.stringify(
                    { inputs: detail.inputs, constraints: detail.constraints, meta: detail.meta, selected },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-50 px-3 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-zinc-950">{value}</div>
    </div>
  );
}

function RoundPanel({ round }: { round: GenerationRound }) {
  return (
    <article className="border border-zinc-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs text-zinc-500">Round {round.roundIndex}</div>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            {round.kind === "initial_generation" ? "初始生成" : round.kind === "self_correction" ? "Self-check 修正" : round.kind}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Metric label="调用" value={String(round.attempts.length)} />
          <Metric label="tokens" value={tokenText(round)} />
          <Metric label="输入 parts" value={String(round.inputPartCount ?? "-")} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <ImageStrip title="输入图片" urls={round.inputImageUrls} />
          <ImageStrip title="输出图片" urls={round.outputImageUrl ? [round.outputImageUrl] : []} />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="py-2 pr-3 font-medium">模型</th>
                  <th className="py-2 pr-3 font-medium">状态</th>
                  <th className="py-2 pr-3 font-medium">耗时</th>
                  <th className="py-2 pr-3 font-medium">prompt tokens</th>
                  <th className="py-2 pr-3 font-medium">output tokens</th>
                  <th className="py-2 pr-3 font-medium">total tokens</th>
                </tr>
              </thead>
              <tbody>
                {round.attempts.map((attempt, index) => (
                  <tr key={`${attempt.model}-${index}`} className="border-b border-zinc-100">
                    <td className="py-2 pr-3 font-mono text-xs">{attempt.model}</td>
                    <td className="py-2 pr-3">{attempt.status}</td>
                    <td className="py-2 pr-3">{formatDuration(attempt.durationMs)}</td>
                    <td className="py-2 pr-3">{attempt.usageMetadata?.promptTokenCount ?? "-"}</td>
                    <td className="py-2 pr-3">{attempt.usageMetadata?.candidatesTokenCount ?? "-"}</td>
                    <td className="py-2 pr-3">{attempt.usageMetadata?.totalTokenCount ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details open>
            <summary className="cursor-pointer text-sm font-medium">完整 prompt</summary>
            <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap bg-zinc-950 p-4 text-xs leading-5 text-zinc-50">
              {round.prompt}
            </pre>
          </details>

          {round.error ? <div className="bg-red-50 px-3 py-2 text-sm text-red-700">{round.error}</div> : null}
        </div>
      </div>
    </article>
  );
}

function ImageStrip({ title, urls }: { title: string; urls: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-zinc-500">{title}</div>
      {urls.length === 0 ? (
        <div className="flex h-32 items-center justify-center bg-zinc-50 text-xs text-zinc-500">无</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
          {urls.map((url) => (
            <a key={url} href={absUrl(url)} target="_blank" rel="noreferrer" className="block bg-zinc-50">
              <img src={absUrl(url)} alt={title} className="h-40 w-full object-contain" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
