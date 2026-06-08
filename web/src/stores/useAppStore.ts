import { create } from "zustand";

export type ClosetCategory =
  | "top"
  | "pants"
  | "skirt"
  | "outerwear"
  | "accessory"
  | "dress"
  | "suit"
  | "underwear"
  | "shoes";

export type ClosetItem = {
  id: string;
  category: ClosetCategory;
  imageUrl: string;
  originalImageUrl?: string;
  favorited: boolean;
};

export type PoseId =
  | "hands_on_hips"
  | "neutral_stand"
  | "hands_behind_back"
  | "runway_walk"
  | "casual_sit"
  | "side_stand";

export const POSES: Array<{ id: PoseId; label: string }> = [
  { id: "hands_on_hips", label: "叉腰" },
  { id: "neutral_stand", label: "垂立" },
  { id: "hands_behind_back", label: "背手" },
  { id: "runway_walk", label: "T台" },
  { id: "casual_sit", label: "坐姿" },
  { id: "side_stand", label: "侧身" },
];

export type OverlayTransform = {
  cx: number;
  cy: number;
  w: number;
  rotationDeg?: number;
  opacity?: number;
  blendMode?: string;
};

export type AsyncImageStatus = "idle" | "running" | "succeeded" | "failed";

export type PoseRenderState = {
  status: AsyncImageStatus;
  progress: number;
  imageUrl?: string;
  error?: string;
};

export type TryOnRenderState = {
  status: AsyncImageStatus;
  progress: number;
  imageUrl?: string;
  overlayGarmentUrl?: string | null;
  overlayTransform?: OverlayTransform | null;
  error?: string;
};

type AvatarState = {
  avatarImageUrl?: string;
  refFaceUrl?: string;
  poseRenders: Partial<Record<PoseId, PoseRenderState>>;
  tryOnRenders: Record<string, TryOnRenderState>;
};

type AppState = {
  avatar: AvatarState;
  closet: ClosetItem[];
  setAvatar: (avatar: Partial<AvatarState>) => void;
  setPoseRender: (poseId: PoseId, render: PoseRenderState) => void;
  patchPoseRender: (poseId: PoseId, patch: Partial<PoseRenderState>) => void;
  setTryOnRender: (key: string, render: TryOnRenderState) => void;
  patchTryOnRender: (key: string, patch: Partial<TryOnRenderState>) => void;
  clearTryOnRendersForPose: (poseId: PoseId) => void;
  upsertClosetItem: (item: ClosetItem) => void;
  toggleFavorite: (id: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  avatar: { poseRenders: {}, tryOnRenders: {} },
  closet: [],
  setAvatar: (avatar) => set({ avatar: { poseRenders: {}, tryOnRenders: {}, ...avatar } }),
  setPoseRender: (poseId, render) =>
    set((s) => ({
      avatar: {
        ...s.avatar,
        poseRenders: { ...s.avatar.poseRenders, [poseId]: render },
      },
    })),
  patchPoseRender: (poseId, patch) =>
    set((s) => ({
      avatar: {
        ...s.avatar,
        poseRenders: {
          ...s.avatar.poseRenders,
          [poseId]: { ...(s.avatar.poseRenders[poseId] ?? { status: "idle", progress: 0 }), ...patch },
        },
      },
    })),
  setTryOnRender: (key, render) =>
    set((s) => ({
      avatar: {
        ...s.avatar,
        tryOnRenders: { ...s.avatar.tryOnRenders, [key]: render },
      },
    })),
  patchTryOnRender: (key, patch) =>
    set((s) => ({
      avatar: {
        ...s.avatar,
        tryOnRenders: {
          ...s.avatar.tryOnRenders,
          [key]: { ...(s.avatar.tryOnRenders[key] ?? { status: "idle", progress: 0 }), ...patch },
        },
      },
    })),
  clearTryOnRendersForPose: (poseId) =>
    set((s) => ({
      avatar: {
        ...s.avatar,
        tryOnRenders: Object.fromEntries(
          Object.entries(s.avatar.tryOnRenders).filter(([key]) => !key.startsWith(`${poseId}:`)),
        ),
      },
    })),
  upsertClosetItem: (item) =>
    set((s) => {
      const idx = s.closet.findIndex((x) => x.id === item.id);
      if (idx === -1) return { closet: [item, ...s.closet] };
      const next = s.closet.slice();
      next[idx] = item;
      return { closet: next };
    }),
  toggleFavorite: (id) =>
    set((s) => ({
      closet: s.closet.map((x) => (x.id === id ? { ...x, favorited: !x.favorited } : x)),
    })),
}));
