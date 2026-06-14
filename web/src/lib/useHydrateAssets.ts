"use client";

import { useEffect, useRef } from "react";

import { absUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  listAvatars,
  listClosetItems,
  listPoses,
  listTryons,
  type ClosetItemRecord,
  type PoseRecord,
  type TryonRecord,
} from "@/lib/assets";
import {
  useAppStore,
  type ClosetCategory,
  type ClosetItem,
  type PoseId,
  type PoseRenderState,
  type TryOnRenderState,
} from "@/stores/useAppStore";

function toClosetItem(c: ClosetItemRecord): ClosetItem {
  return {
    id: c.id,
    category: c.garmentType as ClosetCategory,
    imageUrl: absUrl(c.extractedImageUrl),
    originalImageUrl: c.originalImageUrl ? absUrl(c.originalImageUrl) : undefined,
    favorited: c.favorited,
  };
}

function toPoseRenders(poses: PoseRecord[]): Partial<Record<PoseId, PoseRenderState>> {
  const out: Partial<Record<PoseId, PoseRenderState>> = {};
  for (const p of poses) {
    out[p.poseKey as PoseId] = { status: "succeeded", progress: 1, imageUrl: absUrl(p.imageUrl) };
  }
  return out;
}

function toTryOnRenders(tryons: TryonRecord[]): Record<string, TryOnRenderState> {
  const out: Record<string, TryOnRenderState> = {};
  for (const t of tryons) {
    if (!t.poseKey || !t.closetItemId) continue;
    out[`${t.poseKey}:${t.closetItemId}`] = { status: "succeeded", progress: 1, imageUrl: absUrl(t.imageUrl) };
  }
  return out;
}

// 切换到某个数字人：拉取其姿态与试穿缓存并载入工作集（可在 React 外调用）
export async function switchToAvatar(avatarId: string, avatarImageUrlAbs: string): Promise<void> {
  const [poses, tryons] = await Promise.all([listPoses(avatarId), listTryons(avatarId)]);
  useAppStore.getState().loadWorkingSet({
    avatarId,
    avatarImageUrl: avatarImageUrlAbs,
    poseRenders: toPoseRenders(poses),
    tryOnRenders: toTryOnRenders(tryons),
  });
}

// 登录后把当前用户的资产从后端载入 store（每个用户只跑一次）。
export function useHydrateAssets(): void {
  const { me } = useAuth();
  const setAvatars = useAppStore((s) => s.setAvatars);
  const setCloset = useAppStore((s) => s.setCloset);
  const loadWorkingSet = useAppStore((s) => s.loadWorkingSet);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    if (!me) {
      lastUser.current = null;
      return;
    }
    if (lastUser.current === me.id) return;
    lastUser.current = me.id;

    let cancelled = false;
    (async () => {
      try {
        const [avatars, closet] = await Promise.all([listAvatars(), listClosetItems()]);
        if (cancelled) return;
        setAvatars(
          avatars.map((a) => ({ id: a.id, name: a.name, imageUrl: absUrl(a.imageUrl), isDefault: a.isDefault })),
        );
        setCloset(closet.map(toClosetItem));

        const def = avatars.find((a) => a.isDefault) ?? avatars[0];
        if (def) {
          const [poses, tryons] = await Promise.all([listPoses(def.id), listTryons(def.id)]);
          if (cancelled) return;
          loadWorkingSet({
            avatarId: def.id,
            avatarImageUrl: absUrl(def.imageUrl),
            poseRenders: toPoseRenders(poses),
            tryOnRenders: toTryOnRenders(tryons),
          });
        }
      } catch {
        /* 静默失败：未登录或网络问题时不阻塞页面 */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, setAvatars, setCloset, loadWorkingSet, setHydrated]);
}
