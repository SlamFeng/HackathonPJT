"use client";

import { useMemo, useState } from "react";
import { z } from "zod";

import { absUrl, createJob, uploadAsset, waitForImageJob } from "@/lib/api";
import {
  createAvatar,
  deleteAvatar as deleteAvatarApi,
  listAvatars,
  setDefaultAvatar,
  upsertPose,
} from "@/lib/assets";
import { switchToAvatar } from "@/lib/useHydrateAssets";
import { POSES, PoseId, useAppStore } from "@/stores/useAppStore";
import AutoAspectImage from "@/components/AutoAspectImage";
import { UploadField } from "@/components/UploadField";
import { JobProgress } from "@/components/JobProgress";

const optionalIntInRange = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((raw, ctx) => {
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}请输入数字` });
        return z.NEVER;
      }
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}必须是整数` });
        return z.NEVER;
      }
      if (n < min || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label}范围应为 ${min}~${max}` });
        return z.NEVER;
      }
      return n;
    });

const bodySchema = z.object({
  heightCm: optionalIntInRange("身高", 120, 220),
  weightKg: optionalIntInRange("体重", 30, 200),
  shoulderWidthCm: optionalIntInRange("肩宽", 20, 80),
  chestCm: optionalIntInRange("胸围", 50, 160),
  waistCm: optionalIntInRange("腰围", 40, 160),
  hipCm: optionalIntInRange("臀围", 50, 180),
});

type BodyFormState = {
  heightCm: string;
  weightKg: string;
  shoulderWidthCm: string;
  chestCm: string;
  waistCm: string;
  hipCm: string;
};

export default function AvatarPage() {
  const setAvatar = useAppStore((s) => s.setAvatar);
  const setPoseRender = useAppStore((s) => s.setPoseRender);
  const patchPoseRender = useAppStore((s) => s.patchPoseRender);
  const avatar = useAppStore((s) => s.avatar);
  const avatars = useAppStore((s) => s.avatars);
  const setAvatars = useAppStore((s) => s.setAvatars);

  async function refreshAvatars() {
    try {
      const list = await listAvatars();
      setAvatars(list.map((a) => ({ id: a.id, name: a.name, imageUrl: absUrl(a.imageUrl), isDefault: a.isDefault })));
    } catch {
      /* 忽略列表刷新失败 */
    }
  }

  async function handleSwitchAvatar(id: string, imageUrlAbs: string) {
    try {
      await setDefaultAvatar(id);
      await switchToAvatar(id, imageUrlAbs);
      await refreshAvatars();
    } catch (e) {
      setError(e instanceof Error ? e.message : "切换模特失败");
    }
  }

  async function handleDeleteAvatar(id: string) {
    try {
      await deleteAvatarApi(id);
      await refreshAvatars();
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  }

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<BodyFormState>({
    heightCm: "170",
    weightKg: "65",
    shoulderWidthCm: "42",
    chestCm: "92",
    waistCm: "78",
    hipCm: "96",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>("");
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const canSubmit = useMemo(() => !!file && !busy, [file, busy]);

  async function generatePoseInBackground(avatarImageUrl: string, nextPoseId: PoseId, avatarId?: string) {
    setPoseRender(nextPoseId, { status: "running", progress: 0.05 });
    try {
      const job = await createJob({
        jobType: "pose_render",
        inputs: { avatarImageUrl, poseId: nextPoseId },
        constraints: { identityLock: true, poseLock: true, qualityLevel: "high", timeoutSec: 300 },
      });
      const { image } = await waitForImageJob(job.jobId, {
        minProgress: 0.05,
        onUpdate: (latest) =>
          patchPoseRender(nextPoseId, {
            status: "running",
            progress: Math.max(latest.progress ?? 0.05, 0.05),
          }),
      });
      setPoseRender(nextPoseId, {
        status: "succeeded",
        progress: 1,
        imageUrl: absUrl(image.url),
      });
      // 落库：把姿态图持久化到该数字人名下（image.url 为相对 /static 路径）
      if (avatarId) {
        try {
          await upsertPose(avatarId, nextPoseId, { imageUrl: image.url, jobId: job.jobId });
        } catch {
          /* 持久化失败不影响前端展示 */
        }
      }
    } catch (e) {
      setPoseRender(nextPoseId, {
        status: "failed",
        progress: 1,
        error: e instanceof Error ? e.message : "姿态预生成失败",
      });
    }
  }

  function startPosePrefetch(avatarImageUrl: string, avatarId?: string) {
    void Promise.all(POSES.map((pose) => generatePoseInBackground(avatarImageUrl, pose.id, avatarId)));
  }

  async function handleGenerate() {
    setError(null);
    setBusy(true);
    setProgress(0);
    setStage("校验输入");
    setStartedAt(Date.now());

    try {
      const parsed = bodySchema.safeParse(form);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "参数不合法");
      }
      if (!file) throw new Error("请先上传照片");
      if (file.size > 10 * 1024 * 1024) throw new Error("图片需 ≤10MB");

      setStage("上传图片");
      setProgress(0.1);
      const uploaded = await uploadAsset(file);

      setStage("创建生成任务");
      setProgress(0.2);
      const job = await createJob({
        jobType: "avatar_generate",
        inputs: { imageUrl: uploaded.url, bodyParams: parsed.data },
        // 图像生成耗时可能较长（尤其是首次调用/高质量），这里显式放宽后端超时
        constraints: { identityLock: true, poseLock: true, garmentLock: true, qualityLevel: "high", timeoutSec: 300 },
      });

      // 移除过短的前端超时限制：改为“最多等待 5 分钟”，用于你先完成接口联调验证
      const { job: latest, image } = await waitForImageJob(job.jobId, {
        minProgress: 0.2,
        onUpdate: (current) => {
          setStage(current.stage ?? "处理中");
          setProgress(Math.max(current.progress ?? 0, 0.2));
        },
      });
      const avatarImageUrl = absUrl(image.url);
      // 后端通常返回 /static/xxx.png（相对 API 服务），这里转成绝对 URL，避免前端去请求 localhost:3000/static 导致看不到结果
      // 落库：保存为该用户的一个数字人（image.url 为相对路径，便于服务端统一存储）
      let avatarId: string | undefined;
      try {
        const saved = await createAvatar({
          imageUrl: image.url,
          paramsJson: parsed.data,
          sourceJobId: job.jobId,
          makeDefault: true,
        });
        avatarId = saved.id;
        await refreshAvatars();
      } catch {
        /* 持久化失败时仍然走本地展示 */
      }
      setAvatar({ avatarId, avatarImageUrl });
      setProgress(1);
      setStage(latest.status === "succeeded" ? "完成，正在后台预生成姿态" : "完成");
      startPosePrefetch(avatarImageUrl, avatarId);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "发生错误");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="rounded-3xl border border-zinc-200/70 bg-white p-6 md:p-8">
        <div className="text-xs text-zinc-500">创建模特</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">上传全身照并输入体型参数</div>
        <div className="mt-2 text-sm text-zinc-600">
          仅支持清晰正面免冠全身照（≥1080×1920，≤10MB）。生成结果为写实，身份保持优先。模特可复用于后续批量出图。
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-zinc-200/70 bg-zinc-50 p-5">
            <div className="text-sm font-medium">上传照片</div>
            <div className="mt-4">
              <UploadField
                file={file}
                onSelect={setFile}
                maxBytes={10 * 1024 * 1024}
                recommendW={1080}
                recommendH={1920}
                disabled={busy}
                hint="清晰正面免冠全身照，≥1080×1920，≤10MB"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
            <div className="text-sm font-medium">体型参数</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="身高(cm)" value={form.heightCm} onChange={(v) => setForm((s) => ({ ...s, heightCm: v }))} disabled={busy} />
              <Field label="体重(kg)" value={form.weightKg} onChange={(v) => setForm((s) => ({ ...s, weightKg: v }))} disabled={busy} />
              <Field label="肩宽(cm)" value={form.shoulderWidthCm} onChange={(v) => setForm((s) => ({ ...s, shoulderWidthCm: v }))} disabled={busy} />
              <Field label="胸围(cm)" value={form.chestCm} onChange={(v) => setForm((s) => ({ ...s, chestCm: v }))} disabled={busy} />
              <Field label="腰围(cm)" value={form.waistCm} onChange={(v) => setForm((s) => ({ ...s, waistCm: v }))} disabled={busy} />
              <Field label="臀围(cm)" value={form.hipCm} onChange={(v) => setForm((s) => ({ ...s, hipCm: v }))} disabled={busy} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            {busy ? (
              <JobProgress phase="running" label={stage} startedAtMs={startedAt} expectedText="通常 20–60 秒" />
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : (
              <div className="text-xs text-zinc-500">生成后会自动保存为“当前模特”，并在后台预生成各姿态</div>
            )}
          </div>
          <button
            className={[
              "shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-colors",
              canSubmit ? "bg-zinc-950 text-zinc-50 hover:bg-zinc-800" : "bg-zinc-200 text-zinc-500",
            ].join(" ")}
            onClick={handleGenerate}
            disabled={!canSubmit}
          >
            {busy ? "生成中…" : "开始生成"}
          </button>
        </div>
      </div>

      {avatars.length > 0 ? (
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">我的模特（点击切换当前模特）</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {avatars.map((a) => {
              const active = a.id === avatar.avatarId;
              return (
                <div key={a.id} className="relative">
                  <button
                    onClick={() => handleSwitchAvatar(a.id, a.imageUrl)}
                    className={[
                      "block h-28 w-20 overflow-hidden rounded-2xl border-2 transition-colors",
                      active ? "border-zinc-900" : "border-transparent hover:border-zinc-300",
                    ].join(" ")}
                    title={a.isDefault ? "默认数字人" : "点击设为当前"}
                  >
                    <img src={a.imageUrl} alt="avatar" className="h-full w-full bg-zinc-100 object-cover" />
                  </button>
                  {a.isDefault ? (
                    <span className="absolute left-1 top-1 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-50">
                      默认
                    </span>
                  ) : null}
                  <button
                    onClick={() => handleDeleteAvatar(a.id)}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs text-zinc-500 shadow ring-1 ring-zinc-200 hover:text-red-600"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">当前模特</div>
          <div className="mt-3">
            {avatar.avatarImageUrl ? (
              <AutoAspectImage
                src={avatar.avatarImageUrl}
                alt="avatar"
                className="w-full overflow-hidden rounded-3xl bg-zinc-100"
                initialAspectRatio={3 / 4}
              />
            ) : (
              <div className="flex h-[420px] w-full items-center justify-center rounded-3xl bg-zinc-50 text-xs text-zinc-500">
                尚未生成
              </div>
            )}
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200/70 bg-white p-5">
          <div className="text-xs text-zinc-500">提示</div>
          <div className="mt-2 text-sm leading-6 text-zinc-700">
            <ul className="list-disc space-y-2 pl-5">
              <li>若照片遮挡/侧脸/模糊，身份一致性会明显下降。</li>
              <li>生成质量由质检门控决定，失败会自动重试或降级返回可用结果。</li>
              <li>下一步：到「商品库」上传新品，再到「批量出图」一键产出整批上身图。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="text-xs text-zinc-500">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        inputMode="numeric"
        className="h-10 rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none ring-zinc-900/10 focus:ring-4 disabled:bg-zinc-100"
      />
    </label>
  );
}
