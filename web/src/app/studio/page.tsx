"use client";

import { useMemo, useState } from "react";

import { absUrl, createJob, getJob } from "@/lib/api";
import { ClosetItem, useAppStore } from "@/stores/useAppStore";

const poses = [
  { id: "hands_on_hips", label: "叉腰" },
  { id: "neutral_stand", label: "垂立" },
  { id: "hands_behind_back", label: "背手" },
  { id: "runway_walk", label: "T台" },
  { id: "casual_sit", label: "坐姿" },
  { id: "side_stand", label: "侧身" },
];

export default function StudioPage() {
  const avatar = useAppStore((s) => s.avatar);
  const closet = useAppStore((s) => s.closet);

  const [poseId, setPoseId] = useState(poses[0]!.id);
  const [garment, setGarment] = useState<ClosetItem | null>(null);

  const [busyPose, setBusyPose] = useState(false);
  const [busyTryon, setBusyTryon] = useState(false);
  const [poseProgress, setPoseProgress] = useState(0);
  const [tryonProgress, setTryonProgress] = useState(0);
  const [poseImageUrl, setPoseImageUrl] = useState<string | null>(null);
  const [tryonImageUrl, setTryonImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseAvatarUrl = poseImageUrl ?? avatar.avatarImageUrl ?? null;

  const canPose = useMemo(() => !!avatar.avatarImageUrl && !busyPose, [avatar.avatarImageUrl, busyPose]);
  const canTryOn = useMemo(() => !!baseAvatarUrl && !!garment && !busyTryon, [baseAvatarUrl, garment, busyTryon]);

  async function handlePose(nextPoseId: string) {
    setError(null);
    setPoseId(nextPoseId);
    if (!avatar.avatarImageUrl) return;

    setBusyPose(true);
    setPoseProgress(0.05);
    setTryonImageUrl(null);

    try {
      const job = await createJob({
        jobType: "pose_render",
        inputs: { avatarImageUrl: avatar.avatarImageUrl, poseId: nextPoseId },
        constraints: { identityLock: true, poseLock: true, qualityLevel: "high" },
      });

      let tries = 0;
      while (tries < 80) {
        const latest = await getJob(job.jobId);
        setPoseProgress(Math.max(latest.progress ?? 0.05, 0.05));

        if (latest.status === "succeeded") {
          const out = latest.artifacts?.find((a) => a.kind === "image")?.url;
          if (!out) throw new Error("未返回姿态图");
          setPoseImageUrl(absUrl(out));
          setPoseProgress(1);
          return;
        }
        if (latest.status === "failed") throw new Error(latest.error?.message ?? "姿态切换失败");
        await new Promise((r) => setTimeout(r, 350));
        tries += 1;
      }
      throw new Error("姿态任务超时");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发生错误");
    } finally {
      setBusyPose(false);
    }
  }

  async function handleTryOn() {
    setError(null);
    if (!baseAvatarUrl) return;
    if (!garment) return;

    setBusyTryon(true);
    setTryonProgress(0.05);

    try {
      const job = await createJob({
        jobType: "vton_tryon",
        inputs: { avatarImageUrl: baseAvatarUrl, garmentImageUrl: garment.imageUrl, poseId },
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high" },
      });

      let tries = 0;
      while (tries < 90) {
        const latest = await getJob(job.jobId);
        setTryonProgress(Math.max(latest.progress ?? 0.05, 0.05));
        if (latest.status === "succeeded") {
          const out = latest.artifacts?.find((a) => a.kind === "image")?.url;
          if (!out) throw new Error("未返回试穿图");
          setTryonImageUrl(absUrl(out));
          setTryonProgress(1);
          return;
        }
        if (latest.status === "failed") throw new Error(latest.error?.message ?? "试穿失败");
        await new Promise((r) => setTimeout(r, 350));
        tries += 1;
      }
      throw new Error("试穿任务超时");
    } catch (e) {
      setError(e instanceof Error ? e.message : "发生错误");
    } finally {
      setBusyTryon(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">姿态与试穿</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">选择姿态 → 选择单品 → 一键试穿</div>
        <div className="mt-2 text-sm text-zinc-600">姿态切换时展示骨架线加载态；试穿过程展示进度条。</div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3 rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-sm font-medium">姿态库</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {poses.map((p) => {
              const active = poseId === p.id;
              return (
                <button
                  key={p.id}
                  className={[
                    "group relative overflow-hidden rounded-2xl border px-3 py-3 text-left transition-colors",
                    active ? "border-zinc-900 bg-zinc-900 text-zinc-50" : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50",
                  ].join(" ")}
                  onClick={() => handlePose(p.id)}
                  disabled={!canPose}
                >
                  <div className="text-xs font-medium">{p.label}</div>
                  <div
                    className={[
                      "mt-2 h-10 rounded-xl",
                      active ? "bg-zinc-800" : "bg-zinc-100 group-hover:bg-zinc-200",
                    ].join(" ")}
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium">试穿单品</div>
            <div className="mt-3 space-y-2">
              {closet.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-500">衣橱为空，先去上传单品</div>
              ) : (
                closet.slice(0, 6).map((item) => {
                  const active = garment?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      className={[
                        "flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors",
                        active ? "border-zinc-900 bg-zinc-900 text-zinc-50" : "border-zinc-200 hover:bg-zinc-50",
                      ].join(" ")}
                      onClick={() => setGarment(item)}
                    >
                      <img
                        src={item.imageUrl}
                        alt="garment"
                        className="h-10 w-10 rounded-xl bg-white object-contain"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{item.id.slice(0, 8)}</div>
                        <div className={["text-[11px]", active ? "text-zinc-200" : "text-zinc-500"].join(" ")}>
                          点击选中
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <button
              className={[
                "mt-4 w-full rounded-full px-4 py-2.5 text-sm font-medium transition-colors",
                canTryOn ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
              ].join(" ")}
              onClick={handleTryOn}
              disabled={!canTryOn}
            >
              {busyTryon ? `试穿中… ${Math.round(tryonProgress * 100)}%` : "一键试穿"}
            </button>
          </div>
        </div>

        <div className="lg:col-span-9 grid grid-cols-1 gap-4 md:grid-cols-2">
          <PreviewCard
            title="姿态预览"
            subtitle={busyPose ? `切换中… ${Math.round(poseProgress * 100)}%` : "身份保持 · 骨架约束"}
            imageUrl={baseAvatarUrl}
            loading={busyPose}
          />
          <PreviewCard
            title="试穿预览"
            subtitle={busyTryon ? `生成中… ${Math.round(tryonProgress * 100)}%` : "边缘贴合 · 光影褶皱"}
            imageUrl={tryonImageUrl}
            loading={busyTryon}
            emptyText="选择单品后点击「一键试穿」"
          />
        </div>
      </div>
    </div>
  );
}

function PreviewCard({
  title,
  subtitle,
  imageUrl,
  loading,
  emptyText,
}: {
  title: string;
  subtitle: string;
  imageUrl: string | null | undefined;
  loading: boolean;
  emptyText?: string;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>
        </div>
        {loading ? <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-200" /> : null}
      </div>
      <div className="relative mt-4 h-[520px] overflow-hidden rounded-3xl bg-zinc-50">
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-10 text-center text-xs text-zinc-500">
            {emptyText ?? "尚未生成"}
          </div>
        )}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[240px] rounded-3xl border border-zinc-200/70 bg-white/80 p-5 backdrop-blur">
              <div className="h-2 w-28 rounded-full bg-zinc-200" />
              <div className="mt-4 space-y-3">
                <SkeletonLine />
                <SkeletonLine />
                <SkeletonLine />
                <SkeletonLine />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonLine() {
  return (
    <div className="flex items-center justify-between">
      <div className="h-2 w-24 animate-pulse rounded-full bg-zinc-200" />
      <div className="h-2 w-16 animate-pulse rounded-full bg-zinc-200" />
    </div>
  );
}
