"use client";

import { useMemo, useState } from "react";

import { absUrl, createJob, getJob } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { ClosetItem, useAppStore } from "@/stores/useAppStore";

const poses = [
  { id: "hands_on_hips" },
  { id: "neutral_stand" },
  { id: "hands_behind_back" },
  { id: "runway_walk" },
  { id: "casual_sit" },
  { id: "side_stand" },
];

export default function StudioPage() {
  const { t } = useI18n();
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
          if (!out) throw new Error(t("studio.err.pose.noOutput"));
          setPoseImageUrl(absUrl(out));
          setPoseProgress(1);
          return;
        }
        if (latest.status === "failed") throw new Error(latest.error?.message ?? t("studio.err.pose.failed"));
        await new Promise((r) => setTimeout(r, 350));
        tries += 1;
      }
      throw new Error(t("studio.err.pose.timeout"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.err.generic"));
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
          if (!out) throw new Error(t("studio.err.tryon.noOutput"));
          setTryonImageUrl(absUrl(out));
          setTryonProgress(1);
          return;
        }
        if (latest.status === "failed") throw new Error(latest.error?.message ?? t("studio.err.tryon.failed"));
        await new Promise((r) => setTimeout(r, 350));
        tries += 1;
      }
      throw new Error(t("studio.err.tryon.timeout"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.err.generic"));
    } finally {
      setBusyTryon(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">{t("studio.section")}</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{t("studio.title")}</div>
        <div className="mt-2 text-sm text-zinc-600">{t("studio.desc")}</div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3 rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-sm font-medium">{t("studio.pose.lib")}</div>
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
                  <div className="text-xs font-medium">{t(`studio.pose.${p.id}`)}</div>
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
            <div className="text-sm font-medium">{t("studio.garment.title")}</div>
            <div className="mt-3 space-y-2">
              {closet.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-500">{t("studio.garment.empty")}</div>
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
                          {t("studio.garment.select")}
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
              {busyTryon ? t("studio.btn.tryon.busy", { pct: Math.round(tryonProgress * 100) }) : t("studio.btn.tryon.idle")}
            </button>
          </div>
        </div>

        <div className="lg:col-span-9 grid grid-cols-1 gap-4 md:grid-cols-2">
          <PreviewCard
            title={t("studio.preview.pose.title")}
            subtitle={
              busyPose
                ? t("studio.preview.pose.subtitle.busy", { pct: Math.round(poseProgress * 100) })
                : t("studio.preview.pose.subtitle.idle")
            }
            imageUrl={baseAvatarUrl}
            loading={busyPose}
          />
          <PreviewCard
            title={t("studio.preview.tryon.title")}
            subtitle={
              busyTryon
                ? t("studio.preview.tryon.subtitle.busy", { pct: Math.round(tryonProgress * 100) })
                : t("studio.preview.tryon.subtitle.idle")
            }
            imageUrl={tryonImageUrl}
            loading={busyTryon}
            emptyText={t("studio.preview.tryon.empty")}
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
  const { t } = useI18n();
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
            {emptyText ?? t("studio.preview.empty")}
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
