"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { absUrl, createJobsBatch, exportJobsZip, waitForImageJob, type BatchJobItem } from "@/lib/api";
import { createTryon } from "@/lib/assets";
import { switchToAvatar } from "@/lib/useHydrateAssets";
import {
  ClosetCategory,
  ClosetItem,
  POSES,
  PoseId,
  useAppStore,
} from "@/stores/useAppStore";

const CATEGORY_LABEL: Record<ClosetCategory, string> = {
  top: "上衣",
  pants: "裤子",
  skirt: "裙子",
  dress: "连衣裙",
  outerwear: "外套",
  suit: "套装",
  underwear: "贴身衣物",
  shoes: "鞋子",
  accessory: "配饰",
};

// 单次 vton 试穿的额度成本（与后端 credits COSTS 保持一致）
const TRYON_COST = 2;
// 后端单批上限
const BATCH_LIMIT = 50;

function comboKey(poseId: PoseId, garmentId: string) {
  return `${poseId}:${garmentId}`;
}

type CellStatus = "running" | "succeeded" | "failed";
type Cell = {
  key: string;
  poseId: PoseId;
  garment: ClosetItem;
  status: CellStatus;
  jobId?: string;
  imageUrl?: string;
  error?: string;
};

export default function WorkbenchPage() {
  const avatar = useAppStore((s) => s.avatar);
  const avatars = useAppStore((s) => s.avatars);
  const closet = useAppStore((s) => s.closet);
  const setTryOnRender = useAppStore((s) => s.setTryOnRender);

  const [selectedGarments, setSelectedGarments] = useState<Set<string>>(new Set());
  const [selectedPoses, setSelectedPoses] = useState<Set<PoseId>>(new Set());
  const [skipExisting, setSkipExisting] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  // 本次批量运行的逐格状态（key = pose:garment）
  const [cells, setCells] = useState<Record<string, Cell>>({});

  // 当前模特已就绪（已生成姿态图）的姿态集合
  const readyPoses = useMemo(
    () => POSES.filter((p) => avatar.poseRenders[p.id]?.status === "succeeded" && avatar.poseRenders[p.id]?.imageUrl),
    [avatar.poseRenders],
  );
  const readyPoseIds = useMemo(() => new Set(readyPoses.map((p) => p.id)), [readyPoses]);

  // 选中的「单品 × 姿态」组合；按是否已有成功试穿缓存拆分
  const combos = useMemo(() => {
    const out: Array<{ key: string; poseId: PoseId; garment: ClosetItem; cached: boolean }> = [];
    for (const gid of selectedGarments) {
      const garment = closet.find((c) => c.id === gid);
      if (!garment) continue;
      for (const pid of selectedPoses) {
        if (!readyPoseIds.has(pid)) continue;
        const key = comboKey(pid, gid);
        const cached = avatar.tryOnRenders[key]?.status === "succeeded";
        out.push({ key, poseId: pid, garment, cached });
      }
    }
    return out;
  }, [selectedGarments, selectedPoses, closet, readyPoseIds, avatar.tryOnRenders]);

  const toGenerate = useMemo(
    () => (skipExisting ? combos.filter((c) => !c.cached) : combos),
    [combos, skipExisting],
  );
  const estCost = toGenerate.length * TRYON_COST;
  const overLimit = toGenerate.length > BATCH_LIMIT;

  const succeededCells = useMemo(
    () => Object.values(cells).filter((c) => c.status === "succeeded" && c.jobId),
    [cells],
  );

  function toggleGarment(id: string) {
    setSelectedGarments((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function togglePose(id: PoseId) {
    setSelectedPoses((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAllGarments() {
    setSelectedGarments(new Set(closet.map((c) => c.id)));
  }
  function clearGarments() {
    setSelectedGarments(new Set());
  }
  function selectAllReadyPoses() {
    setSelectedPoses(new Set(readyPoses.map((p) => p.id)));
  }

  async function handleSwitchModel(id: string, imageUrlAbs: string) {
    if (running) return;
    try {
      await switchToAvatar(id, imageUrlAbs);
      setSelectedPoses(new Set());
      setCells({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换模特失败");
    }
  }

  async function handleRun() {
    setError(null);
    if (!avatar.avatarId || !avatar.avatarImageUrl) {
      setError("请先在「数字人」生成一个模特");
      return;
    }
    if (toGenerate.length === 0) {
      setError("没有需要生成的组合：请选择单品与已就绪的姿态");
      return;
    }
    if (overLimit) {
      setError(`单次最多 ${BATCH_LIMIT} 张，请减少选择（当前 ${toGenerate.length} 张）`);
      return;
    }

    setRunning(true);
    // 初始化逐格状态为 running
    const initial: Record<string, Cell> = {};
    for (const c of toGenerate) {
      initial[c.key] = { key: c.key, poseId: c.poseId, garment: c.garment, status: "running" };
    }
    setCells(initial);

    // 构造批量任务（每个组合一个 vton_tryon），顺序与 toGenerate 对齐
    const items: BatchJobItem[] = toGenerate.map((c) => {
      const poseUrl = avatar.poseRenders[c.poseId]!.imageUrl!;
      return {
        jobType: "vton_tryon",
        inputs: {
          avatarImageUrl: poseUrl,
          garmentImageUrl: c.garment.imageUrl,
          garmentCategory: c.garment.category,
          poseId: c.poseId,
        },
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      };
    });

    try {
      const batch = await createJobsBatch(items);
      // 把 jobId 回填到各格
      setCells((prev) => {
        const next = { ...prev };
        toGenerate.forEach((c, i) => {
          const jobId = batch.jobs[i]?.jobId;
          if (jobId && next[c.key]) next[c.key] = { ...next[c.key]!, jobId };
        });
        return next;
      });

      // 并发轮询每个任务，逐格更新结果
      await Promise.all(
        toGenerate.map(async (c, i) => {
          const jobId = batch.jobs[i]?.jobId;
          if (!jobId) {
            setCells((p) => ({ ...p, [c.key]: { ...p[c.key]!, status: "failed", error: "未创建任务" } }));
            return;
          }
          try {
            const { image } = await waitForImageJob(jobId);
            const meta = (image.meta ?? {}) as Record<string, unknown>;
            const isMock = meta.mode === "mock";
            const abs = absUrl(image.url);
            setCells((p) => ({ ...p, [c.key]: { ...p[c.key]!, status: "succeeded", imageUrl: abs } }));
            // 同步到 store，让「工作室」「历史」也能看到
            setTryOnRender(c.key, { status: "succeeded", progress: 1, imageUrl: abs });
            // 落库（mock 不入库，与工作室一致）
            if (avatar.avatarId && !isMock) {
              try {
                await createTryon({
                  avatarId: avatar.avatarId,
                  imageUrl: image.url,
                  closetItemId: c.garment.id,
                  poseKey: c.poseId,
                  jobId,
                });
              } catch {
                /* 持久化失败不影响展示 */
              }
            }
          } catch (e) {
            setCells((p) => ({
              ...p,
              [c.key]: { ...p[c.key]!, status: "failed", error: e instanceof Error ? e.message : "生成失败" },
            }));
          }
        }),
      );
    } catch (e) {
      // 整批被拒（如额度不足 402）：清空逐格状态并提示
      setCells({});
      setError(e instanceof Error ? e.message : "批量生成失败");
    } finally {
      setRunning(false);
    }
  }

  async function handleDownloadZip() {
    setError(null);
    setZipBusy(true);
    try {
      await exportJobsZip(succeededCells.map((c) => c.jobId!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "打包下载失败");
    } finally {
      setZipBusy(false);
    }
  }

  const cellList = Object.values(cells);
  const doneCount = cellList.filter((c) => c.status === "succeeded").length;
  const failCount = cellList.filter((c) => c.status === "failed").length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">批量出图工作台</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">
          新品批量试穿出图 · 替代模特摄影
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          选好模特、姿态与一批新品单品，一键生成全部「上身图」，完成后打包下载。
          每张约 {TRYON_COST} 额度，按需增量出图（已生成的可自动跳过）。
        </p>
      </section>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      {/* 前置条件守卫 */}
      {!avatar.avatarImageUrl ? (
        <Guard
          text="还没有模特（数字人）。先去生成一个，系统会自动预生成各个姿态。"
          href="/avatar"
          cta="去生成数字人"
        />
      ) : closet.length === 0 ? (
        <Guard text="衣橱是空的。先上传一批新品单品，再回来批量出图。" href="/closet" cta="去上传单品" />
      ) : (
        <>
          {/* Step 1：选模特 */}
          <Card step="1" title="选择模特" hint={`当前：${avatar.avatarId ? "已选" : "未选"}`}>
            <div className="flex flex-wrap gap-3">
              {avatars.map((a) => {
                const active = a.id === avatar.avatarId;
                return (
                  <button
                    key={a.id}
                    onClick={() => handleSwitchModel(a.id, a.imageUrl)}
                    disabled={running}
                    className={[
                      "block h-28 w-20 overflow-hidden rounded-2xl border-2 transition-colors disabled:opacity-50",
                      active ? "border-zinc-900" : "border-transparent hover:border-zinc-300",
                    ].join(" ")}
                    title={active ? "当前模特" : "点击切换"}
                  >
                    <img src={a.imageUrl} alt="model" className="h-full w-full bg-zinc-100 object-cover" />
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 2：选姿态 */}
          <Card
            step="2"
            title="选择姿态"
            hint={`已就绪 ${readyPoses.length}/${POSES.length}`}
            action={
              readyPoses.length > 0 ? (
                <button onClick={selectAllReadyPoses} disabled={running} className="text-xs text-zinc-600 underline">
                  全选就绪姿态
                </button>
              ) : null
            }
          >
            {readyPoses.length === 0 ? (
              <div className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
                当前模特还没有任何已生成的姿态图。姿态会在生成数字人后自动预生成，或到
                <Link href="/studio" className="mx-1 font-medium underline">
                  工作室
                </Link>
                手动生成后再回来。
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {POSES.map((p) => {
                  const ready = readyPoseIds.has(p.id);
                  const active = selectedPoses.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => ready && togglePose(p.id)}
                      disabled={!ready || running}
                      className={[
                        "rounded-full px-3 py-1.5 text-sm transition-colors",
                        !ready
                          ? "cursor-not-allowed border border-dashed border-zinc-200 text-zinc-300"
                          : active
                            ? "bg-zinc-950 text-zinc-50"
                            : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
                      ].join(" ")}
                      title={ready ? "" : "该姿态尚未生成"}
                    >
                      {p.label}
                      {!ready ? " · 未就绪" : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Step 3：选单品 */}
          <Card
            step="3"
            title="选择单品（新品）"
            hint={`已选 ${selectedGarments.size}/${closet.length}`}
            action={
              <div className="flex gap-3 text-xs text-zinc-600">
                <button onClick={selectAllGarments} disabled={running} className="underline">
                  全选
                </button>
                <button onClick={clearGarments} disabled={running} className="underline">
                  清空
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {closet.map((item) => {
                const active = selectedGarments.has(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleGarment(item.id)}
                    disabled={running}
                    className={[
                      "group relative overflow-hidden rounded-2xl border-2 p-1 text-left transition-colors",
                      active ? "border-zinc-900" : "border-transparent hover:border-zinc-300",
                    ].join(" ")}
                  >
                    <img src={item.imageUrl} alt="garment" className="h-24 w-full rounded-xl bg-zinc-50 object-contain" />
                    <div className="mt-1 truncate px-1 text-[11px] text-zinc-500">
                      {CATEGORY_LABEL[item.category] ?? item.category}
                    </div>
                    <span
                      className={[
                        "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                        active ? "bg-zinc-900 text-zinc-50" : "bg-white/80 text-transparent ring-1 ring-zinc-200",
                      ].join(" ")}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 4：开始 */}
          <Card step="4" title="开始批量生成">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-zinc-600">
                <div>
                  共 <strong className="text-zinc-900">{combos.length}</strong> 个组合
                  {skipExisting && combos.length !== toGenerate.length ? (
                    <span>（跳过 {combos.length - toGenerate.length} 个已生成）</span>
                  ) : null}
                  ，待生成 <strong className="text-zinc-900">{toGenerate.length}</strong> 张， 预计消耗{" "}
                  <strong className="text-zinc-900">{estCost}</strong> 额度。
                </div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={skipExisting}
                    onChange={(e) => setSkipExisting(e.target.checked)}
                    disabled={running}
                  />
                  跳过已生成的组合（增量出图）
                </label>
                {overLimit ? (
                  <div className="mt-1 text-xs text-red-600">单次最多 {BATCH_LIMIT} 张，请减少选择。</div>
                ) : null}
              </div>
              <button
                onClick={handleRun}
                disabled={running || toGenerate.length === 0 || overLimit}
                className={[
                  "shrink-0 rounded-full px-6 py-3 text-sm font-medium transition-colors",
                  running || toGenerate.length === 0 || overLimit
                    ? "bg-zinc-200 text-zinc-500"
                    : "bg-zinc-950 text-zinc-50 hover:bg-zinc-800",
                ].join(" ")}
              >
                {running ? `生成中… ${doneCount + failCount}/${cellList.length}` : `批量生成 ${toGenerate.length} 张`}
              </button>
            </div>
          </Card>

          {/* 结果网格 */}
          {cellList.length > 0 ? (
            <Card
              step="✓"
              title="生成结果"
              hint={`成功 ${doneCount} · 失败 ${failCount} · 共 ${cellList.length}`}
              action={
                succeededCells.length > 0 ? (
                  <button
                    onClick={handleDownloadZip}
                    disabled={zipBusy}
                    className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-zinc-50 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {zipBusy ? "打包中…" : `打包下载 ${succeededCells.length} 张`}
                  </button>
                ) : null
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {cellList.map((c) => (
                  <div key={c.key} className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white">
                    <div className="relative aspect-[3/4] bg-zinc-50">
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="result" className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {c.status === "running" ? (
                            <div className="h-2 w-16 animate-pulse rounded-full bg-zinc-300" />
                          ) : (
                            <div className="px-3 text-center text-[11px] text-red-500">{c.error ?? "失败"}</div>
                          )}
                        </div>
                      )}
                      <span
                        className={[
                          "absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px]",
                          c.status === "succeeded"
                            ? "bg-green-100 text-green-700"
                            : c.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700",
                        ].join(" ")}
                      >
                        {c.status === "succeeded" ? "完成" : c.status === "failed" ? "失败" : "生成中"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      <img src={c.garment.imageUrl} alt="g" className="h-6 w-6 rounded bg-zinc-50 object-contain" />
                      <div className="truncate text-[11px] text-zinc-500">
                        {POSES.find((p) => p.id === c.poseId)?.label ?? c.poseId}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Card({
  step,
  title,
  hint,
  action,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200/70 bg-white p-5 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-zinc-50">
            {step}
          </span>
          <div className="text-sm font-medium">{title}</div>
          {hint ? <div className="text-xs text-zinc-500">{hint}</div> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Guard({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 text-center">
      <div className="text-sm text-zinc-600">{text}</div>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-medium text-zinc-50 hover:bg-zinc-800"
      >
        {cta}
      </Link>
    </div>
  );
}
