"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export const translations = {
  en: {
    common: {
      languageLabel: "Language",
      generated: "Generated",
      notGenerated: "Not generated",
      noImage: "None",
      loading: "Loading...",
      failed: "Failed",
      returnedNone: "Not returned",
      itemUnit: "items",
      avatarAlt: "avatar",
      garmentAlt: "garment",
      overlayAlt: "overlay",
      job: {
        missingImage: "No image returned",
        failed: "Job failed",
        timeout: "Job timed out after 5 minutes",
      },
      categories: {
        top: "Top",
        pants: "Pants",
        skirt: "Skirt",
        dress: "Dress",
        outerwear: "Outerwear",
        suit: "Suit",
        underwear: "Innerwear",
        shoes: "Shoes",
        accessory: "Accessory",
      },
      poses: {
        hands_on_hips: "Hands on hips",
        neutral_stand: "Neutral",
        hands_behind_back: "Hands behind back",
        runway_walk: "Runway",
        casual_sit: "Seated",
        side_stand: "Side pose",
      },
    },
    shell: {
      brand: "AI Dressroom",
      productTag: "nanobanana-first",
      footer: "Minimal illustrated UI, realistic identity-preserving output",
      headerTitle: "AI Smart Dressroom",
      headerSubtitle: "MVP: Avatar -> Pose -> Try-on",
      nav: {
        home: "Portal",
        workbench: "Workbench",
        avatar: "Avatar",
        studio: "Studio",
        closet: "Closet",
        orders: "Orders",
        stylist: "Stylist",
      },
    },
    home: {
      brand: "AI DRESSROOM",
      hero: "TRY ON",
      title: "AI Smart Dressroom",
      subtitle: "Avatar creation · pose control · virtual try-on · styling advisor. Enter the workbench to start.",
      discover: "DISCOVER IT",
      previous: "Previous",
      next: "Next",
    },
    workbench: {
      eyebrow: "Full-flow MVP",
      title: "Avatar creation · Pose tuning · Virtual try-on",
      description: "The UI keeps an Instagram-minimal illustration style while avatars and try-on previews render realistically with identity preservation first.",
      createAvatar: "Create avatar",
      tryOn: "Try on",
      avatarCard: "Avatar",
      uploadAtAvatar: "Go to /avatar to upload a photo",
      closetCard: "Personal closet",
      closetDescription: "Upload clean product images, organize them by category, and reuse them for one-click try-on.",
      openCloset: "Open closet",
      stylistCard: "Styling advisor",
      stylistStatus: "Structured advice + required preview",
      stylistDescription: "Orders/closet data -> style profile -> weather & trends -> outfits ready for try-on.",
      viewAdvice: "View advice",
    },
    avatar: {
      eyebrow: "Avatar generation",
      title: "Upload a full-body photo and enter body measurements",
      description: "Use a clear front-facing full-body photo only (>=1080x1920, <=10MB). Results are realistic with identity preservation first.",
      uploadPhoto: "Upload photo",
      chooseImage: "Choose an image to start",
      bodyParams: "Body measurements",
      fields: {
        heightCm: "Height (cm)",
        weightKg: "Weight (kg)",
        shoulderWidthCm: "Shoulder width (cm)",
        chestCm: "Chest (cm)",
        waistCm: "Waist (cm)",
        hipCm: "Hip (cm)",
      },
      validationLabels: {
        heightCm: "Height",
        weightKg: "Weight",
        shoulderWidthCm: "Shoulder width",
        chestCm: "Chest",
        waistCm: "Waist",
        hipCm: "Hip",
      },
      validation: {
        number: "{label} must be a number",
        integer: "{label} must be an integer",
        range: "{label} must be between {min} and {max}",
        invalidParams: "Invalid parameters",
        uploadFirst: "Please upload a photo first",
        fileTooLarge: "Image must be <=10MB",
      },
      stages: {
        validating: "Validating input",
        uploading: "Uploading image",
        creating: "Creating generation job",
        processing: "Processing",
        doneWithPrefetch: "Done, pre-generating poses in the background",
        done: "Done",
      },
      saveHint: "After generation, it will be saved as the current avatar.",
      generating: "Generating...",
      start: "Start generation",
      currentAvatar: "Current avatar",
      emptyAvatar: "Not generated yet",
      tipsTitle: "Tips",
      tips: [
        "If the photo is occluded, side-facing, or blurry, identity consistency will drop noticeably.",
        "Generation quality is controlled by quality gates; failed runs retry or fall back to a usable result.",
        "Next: go to Studio to switch poses and try on closet items.",
      ],
      fallbackError: "Something went wrong",
      posePrefetchFailed: "Pose pre-generation failed",
    },
    closet: {
      eyebrow: "Personal closet",
      title: "Upload product images and clean them into item-only references",
      description: "Single image <=8MB. After upload, the target garment is extracted by category and becomes available for one-click try-on in Studio.",
      chooseImage: "Choose image",
      helper: "Product model photos or clean product shots are supported. Choose a category first so the system can extract the target item.",
      category: "Category",
      selectImageError: "Please choose an image",
      fileTooLarge: "Garment image must be <=8MB",
      fallbackError: "Something went wrong",
      processing: "Processing... {progress}%",
      uploadButton: "Process and add to closet",
      empty: "No items yet. Upload a garment to start trying things on.",
      favorited: "Favorited",
      favorite: "Favorite",
    },
    studio: {
      eyebrow: "Pose and try-on",
      title: "Choose pose -> choose item -> one-click try-on",
      description: "After avatar generation, all poses are pre-generated automatically. Generated poses and try-on images are cached so you can return to them instantly.",
      generateAvatarFirst: "Please generate an avatar first",
      poseRegenerateFailed: "Pose regeneration failed",
      poseNotReady: "The current pose is not ready yet, so try-on is unavailable.",
      tryOnFailed: "Try-on failed",
      poseLibrary: "Pose library",
      generating: "Generating",
      regenerate: "Regenerate",
      tryOnItems: "Try-on items",
      closetEmpty: "Your closet is empty. Upload an item first.",
      tryOnRunning: "Trying on... {progress}%",
      retryTryOn: "Try on again",
      oneClickTryOn: "One-click try-on",
      posePreview: "Pose preview",
      tryOnPreview: "Try-on preview",
      poseEmptyWithAvatar: "Waiting for the current pose to finish",
      poseEmptyNoAvatar: "Please generate an avatar first",
      tryOnEmptyPoseNotReady: "Try-on will be available after the current pose is ready",
      tryOnEmptyWithGarment: "Click One-click try-on to generate this pose preview",
      tryOnEmptyNoGarment: "Choose an item, then click One-click try-on",
      emptyPreview: "Not generated yet",
      poseStatus: {
        running: "Generating",
        succeeded: "Generated",
        failed: "Failed",
        idle: "Not generated",
      },
      tryOnStatus: {
        running: "Trying on",
        succeeded: "Tried on",
        failed: "Try-on failed",
        idle: "Click to select",
      },
      poseSubtitle: {
        running: "Generating... {progress}%",
        succeeded: "Cached · switch poses without regenerating",
        failed: "Pose generation failed. Click regenerate to try again.",
        idle: "Not generated yet · click regenerate",
      },
      tryOnSubtitle: {
        running: "Generating... {progress}%",
        succeeded: "Cached · regenerate to replace",
        failed: "Try-on failed. Regenerate to try again.",
        idle: "Cached separately by pose and item",
      },
    },
    orders: {
      eyebrow: "Orders and authorization",
      title: "OAuth integration and Excel import (next step)",
      description: "The MVP first completes the Avatar/Pose/Try-on loop. Order integration and style profiling will plug into the same task system and RAG pipeline next.",
      upcoming: "Coming soon",
      items: [
        "Taobao/Amazon OAuth2 PKCE authorization and encrypted token storage",
        "Order sync and standardized schema (category filtering accuracy >=98%)",
        "Excel template download, column validation, and row-level error receipts (format error rate <=1%)",
      ],
    },
    stylist: {
      eyebrow: "AI styling advisor",
      title: "Structured advice + required avatar preview (next step)",
      description: "Every recommendation must include an avatar visualization preview. This phase stabilizes the try-on render loop first, then connects order data, weather, and trend RAG.",
      engineTitle: "The recommendation engine will use",
      items: [
        "Multimodal style recognition: tag historical purchases and closet items (target accuracy >=90%)",
        "RAG: trend knowledge base (VOGUE/WGSN etc.) + evidence citations to reduce hallucinations",
        "Agent: Outfit Planner creates structured outfits, Try-on Renderer outputs previews",
      ],
      goStudio: "Stabilize try-on first",
      goOrders: "Connect orders",
    },
    debug: {
      eyebrow: "Debug only",
      title: "Image generation workflow logs",
      refresh: "Refresh",
      refreshing: "Refreshing...",
      loadFailed: "Failed to load",
      refreshFailed: "Refresh failed",
      recentRecords: "Recent records",
      noLogs: "No generation logs",
      rounds: "rounds",
      calls: "calls",
      tokens: "tokens",
      selectLog: "Select a log",
      jobId: "jobId",
      metrics: {
        roundCount: "Rounds",
        remoteCalls: "Remote calls",
        successfulCalls: "Successful calls",
        failedCalls: "Failed calls",
        totalTokens: "Total tokens",
      },
      noFinalImage: "No final image",
      rawSummary: "Raw inputs / constraints / meta",
      round: "Round",
      roundKinds: {
        initial_generation: "Initial generation",
        self_correction: "Self-check correction",
      },
      metricCalls: "Calls",
      inputParts: "Input parts",
      inputImages: "Input images",
      outputImages: "Output images",
      model: "Model",
      status: "Status",
      duration: "Duration",
      fullPrompt: "Full prompt",
      taskLabels: {
        avatar_generate: "Avatar generation",
        pose_render: "Pose render",
        garment_extract: "Garment extraction",
        vton_tryon: "Virtual try-on",
        outfit_render: "Outfit render",
      },
      statusLabels: {
        running: "Running",
        succeeded: "Succeeded",
        failed: "Failed",
        queued: "Queued",
        canceled: "Canceled",
      },
    },
  },
  zh: {
    common: {
      languageLabel: "语言",
      generated: "已生成",
      notGenerated: "未生成",
      noImage: "无",
      loading: "加载中...",
      failed: "失败",
      returnedNone: "未返回",
      itemUnit: "件",
      avatarAlt: "数字人",
      garmentAlt: "服装",
      overlayAlt: "叠加服装",
      job: {
        missingImage: "未返回图片",
        failed: "任务失败",
        timeout: "任务超时（等待超过 5 分钟）",
      },
      categories: {
        top: "上衣",
        pants: "裤子",
        skirt: "裙子",
        dress: "连衣裙",
        outerwear: "外套",
        suit: "套装",
        underwear: "贴身衣物",
        shoes: "鞋子",
        accessory: "配饰",
      },
      poses: {
        hands_on_hips: "叉腰",
        neutral_stand: "垂立",
        hands_behind_back: "背手",
        runway_walk: "T台",
        casual_sit: "坐姿",
        side_stand: "侧身",
      },
    },
    shell: {
      brand: "AI 试衣间",
      productTag: "nanobanana-first",
      footer: "UI 极简插画风，出图写实身份保持",
      headerTitle: "AI 智能试衣间",
      headerSubtitle: "MVP：Avatar → Pose → Try-on",
      nav: {
        home: "门户",
        workbench: "工作台",
        avatar: "数字人",
        studio: "工作室",
        closet: "衣橱",
        orders: "订单",
        stylist: "穿搭顾问",
      },
    },
    home: {
      brand: "AI 试衣间",
      hero: "试穿",
      title: "AI 智能试衣间",
      subtitle: "数字人定制 · 姿态控制 · 虚拟换装 · 穿搭顾问。点击右下角进入工作台开始体验。",
      discover: "开始体验",
      previous: "上一张",
      next: "下一张",
    },
    workbench: {
      eyebrow: "全链路 MVP",
      title: "数字人定制 · 姿态调试 · 虚拟试穿",
      description: "UI 保持 ins 极简插画风，人物与试穿预览为写实输出，身份保持优先（nanobanana-first）。",
      createAvatar: "生成数字人",
      tryOn: "去试穿",
      avatarCard: "数字人",
      uploadAtAvatar: "去 /avatar 上传照片",
      closetCard: "个人衣橱",
      closetDescription: "上传白底单品图并分类管理，试穿时一键调用。",
      openCloset: "打开衣橱",
      stylistCard: "穿搭顾问",
      stylistStatus: "结构化建议 + 必带预览",
      stylistDescription: "订单/衣橱数据 → 风格画像 → 天气&趋势 → 可直接试穿的搭配方案。",
      viewAdvice: "查看建议",
    },
    avatar: {
      eyebrow: "数字人生成",
      title: "上传全身照并输入体型参数",
      description: "仅支持清晰正面免冠全身照（≥1080×1920，≤10MB）。生成结果为写实，身份保持优先。",
      uploadPhoto: "上传照片",
      chooseImage: "选择一张图片开始",
      bodyParams: "体型参数",
      fields: {
        heightCm: "身高(cm)",
        weightKg: "体重(kg)",
        shoulderWidthCm: "肩宽(cm)",
        chestCm: "胸围(cm)",
        waistCm: "腰围(cm)",
        hipCm: "臀围(cm)",
      },
      validationLabels: {
        heightCm: "身高",
        weightKg: "体重",
        shoulderWidthCm: "肩宽",
        chestCm: "胸围",
        waistCm: "腰围",
        hipCm: "臀围",
      },
      validation: {
        number: "{label}请输入数字",
        integer: "{label}必须是整数",
        range: "{label}范围应为 {min}~{max}",
        invalidParams: "参数不合法",
        uploadFirst: "请先上传照片",
        fileTooLarge: "图片需 ≤10MB",
      },
      stages: {
        validating: "校验输入",
        uploading: "上传图片",
        creating: "创建生成任务",
        processing: "处理中",
        doneWithPrefetch: "完成，正在后台预生成姿态",
        done: "完成",
      },
      saveHint: "生成后会自动保存为“当前数字人”",
      generating: "生成中…",
      start: "开始生成",
      currentAvatar: "当前数字人",
      emptyAvatar: "尚未生成",
      tipsTitle: "提示",
      tips: [
        "若照片遮挡/侧脸/模糊，身份一致性会明显下降。",
        "生成质量由质检门控决定，失败会自动重试或降级返回可用结果。",
        "下一步：进入「工作室」切换姿态并试穿衣橱单品。",
      ],
      fallbackError: "发生错误",
      posePrefetchFailed: "姿态预生成失败",
    },
    closet: {
      eyebrow: "个人衣橱",
      title: "上传商品图并自动清理成单品图",
      description: "单张图片 ≤8MB。上传后会按分类提取目标单品，处理完成后可在「工作室」中一键试穿。",
      chooseImage: "选择图片",
      helper: "支持商品模特图或白底图；请先选择分类，系统会按分类提取目标单品",
      category: "分类",
      selectImageError: "请选择图片",
      fileTooLarge: "服装图需 ≤8MB",
      fallbackError: "发生错误",
      processing: "处理中... {progress}%",
      uploadButton: "处理并上传到衣橱",
      empty: "暂无单品。先上传一件衣服开始试穿。",
      favorited: "已收藏",
      favorite: "收藏",
    },
    studio: {
      eyebrow: "姿态与试穿",
      title: "选择姿态 → 选择单品 → 一键试穿",
      description: "数字人生成后会自动预生成所有姿态；已生成的姿态和试穿图会被缓存，切换回来可直接查看。",
      generateAvatarFirst: "请先生成数字人",
      poseRegenerateFailed: "姿态重新生成失败",
      poseNotReady: "当前姿态还没有生成完成，暂时不能试穿",
      tryOnFailed: "试穿失败",
      poseLibrary: "姿态库",
      generating: "生成中",
      regenerate: "重新生成",
      tryOnItems: "试穿单品",
      closetEmpty: "衣橱为空，先去上传单品",
      tryOnRunning: "试穿中... {progress}%",
      retryTryOn: "重新试穿",
      oneClickTryOn: "一键试穿",
      posePreview: "姿态预览",
      tryOnPreview: "试穿预览",
      poseEmptyWithAvatar: "等待当前姿态生成完成",
      poseEmptyNoAvatar: "请先生成数字人",
      tryOnEmptyPoseNotReady: "当前姿态生成完成后可试穿",
      tryOnEmptyWithGarment: "点击「一键试穿」生成该姿态试穿图",
      tryOnEmptyNoGarment: "选择单品后点击「一键试穿」",
      emptyPreview: "尚未生成",
      poseStatus: {
        running: "生成中",
        succeeded: "已生成",
        failed: "失败",
        idle: "未生成",
      },
      tryOnStatus: {
        running: "试穿中",
        succeeded: "已试穿",
        failed: "试穿失败",
        idle: "点击选中",
      },
      poseSubtitle: {
        running: "生成中... {progress}%",
        succeeded: "已缓存 · 切换姿态无需重新生成",
        failed: "姿态生成失败，可点击重新生成",
        idle: "尚未生成 · 可点击重新生成",
      },
      tryOnSubtitle: {
        running: "生成中... {progress}%",
        succeeded: "已缓存 · 可重新试穿覆盖",
        failed: "试穿失败，可重新生成",
        idle: "按姿态与单品分别缓存",
      },
    },
    orders: {
      eyebrow: "订单与授权",
      title: "OAuth 接入与 Excel 导入（下一步）",
      description: "MVP 先打通 Avatar/姿态/试穿闭环；订单接入与风格画像将在下一阶段接入到同一任务系统与 RAG 管线。",
      upcoming: "即将实现",
      items: [
        "淘宝/亚马逊 OAuth2 PKCE 授权登录与 token 加密存储",
        "订单同步与标准化 schema（类目筛选准确率≥98%）",
        "Excel 模板下载、列级校验、行号错误回执（格式错误率≤1%）",
      ],
    },
    stylist: {
      eyebrow: "AI 穿搭顾问",
      title: "结构化建议 + 必带数字人预览（下一步）",
      description: "每条建议必须绑定数字人可视化预览图。当前阶段先把试穿渲染链路跑稳，随后接入订单数据、天气与趋势 RAG。",
      engineTitle: "推荐引擎将使用",
      items: [
        "多模态风格识别：为历史购买与衣橱单品打标签（目标准确率≥90%）",
        "RAG：趋势知识库（VOGUE/WGSN等）+ 证据引用，降低幻觉",
        "Agent：Outfit Planner 产出结构化搭配，Try-on Renderer 输出预览图",
      ],
      goStudio: "先把试穿跑通",
      goOrders: "去接入订单",
    },
    debug: {
      eyebrow: "Debug only",
      title: "图像生成工作流日志",
      refresh: "刷新",
      refreshing: "刷新中...",
      loadFailed: "加载失败",
      refreshFailed: "刷新失败",
      recentRecords: "最近记录",
      noLogs: "暂无生成日志",
      rounds: "轮",
      calls: "次调用",
      tokens: "tokens",
      selectLog: "选择一条日志",
      jobId: "jobId",
      metrics: {
        roundCount: "生成轮数",
        remoteCalls: "远程调用",
        successfulCalls: "成功调用",
        failedCalls: "失败调用",
        totalTokens: "总 tokens",
      },
      noFinalImage: "无最终图片",
      rawSummary: "原始 inputs / constraints / meta",
      round: "Round",
      roundKinds: {
        initial_generation: "初始生成",
        self_correction: "Self-check 修正",
      },
      metricCalls: "调用",
      inputParts: "输入 parts",
      inputImages: "输入图片",
      outputImages: "输出图片",
      model: "模型",
      status: "状态",
      duration: "耗时",
      fullPrompt: "完整 prompt",
      taskLabels: {
        avatar_generate: "数字人生成",
        pose_render: "姿态渲染",
        garment_extract: "服装提取",
        vton_tryon: "虚拟试穿",
        outfit_render: "穿搭渲染",
      },
      statusLabels: {
        running: "运行中",
        succeeded: "成功",
        failed: "失败",
        queued: "排队中",
        canceled: "已取消",
      },
    },
  },
  jp: {
    common: {
      languageLabel: "言語",
      generated: "生成済み",
      notGenerated: "未生成",
      noImage: "なし",
      loading: "読み込み中...",
      failed: "失敗",
      returnedNone: "未返却",
      itemUnit: "点",
      avatarAlt: "アバター",
      garmentAlt: "服",
      overlayAlt: "重ね合わせ服",
      job: {
        missingImage: "画像が返されませんでした",
        failed: "タスクに失敗しました",
        timeout: "タスクがタイムアウトしました（5分を超過）",
      },
      categories: {
        top: "トップス",
        pants: "パンツ",
        skirt: "スカート",
        dress: "ワンピース",
        outerwear: "アウター",
        suit: "セットアップ",
        underwear: "インナー",
        shoes: "シューズ",
        accessory: "アクセサリー",
      },
      poses: {
        hands_on_hips: "腰に手",
        neutral_stand: "直立",
        hands_behind_back: "後ろ手",
        runway_walk: "ランウェイ",
        casual_sit: "座り",
        side_stand: "横向き",
      },
    },
    shell: {
      brand: "AI 試着室",
      productTag: "nanobanana-first",
      footer: "ミニマルなイラストUI、写実的で本人性を保つ出力",
      headerTitle: "AI スマート試着室",
      headerSubtitle: "MVP：Avatar → Pose → Try-on",
      nav: {
        home: "ポータル",
        workbench: "ワークベンチ",
        avatar: "アバター",
        studio: "スタジオ",
        closet: "クローゼット",
        orders: "注文",
        stylist: "スタイリスト",
      },
    },
    home: {
      brand: "AI 試着室",
      hero: "試着",
      title: "AI スマート試着室",
      subtitle: "アバター作成 · ポーズ制御 · バーチャル試着 · スタイリング提案。ワークベンチから始めましょう。",
      discover: "始める",
      previous: "前へ",
      next: "次へ",
    },
    workbench: {
      eyebrow: "フルフロー MVP",
      title: "アバター作成 · ポーズ調整 · バーチャル試着",
      description: "UIはInstagram風のミニマルなイラスト表現を保ち、人物と試着プレビューは本人性を優先して写実的に出力します。",
      createAvatar: "アバター作成",
      tryOn: "試着へ",
      avatarCard: "アバター",
      uploadAtAvatar: "/avatar で写真をアップロード",
      closetCard: "マイクローゼット",
      closetDescription: "白背景の商品画像をアップロードして分類管理し、試着時にワンクリックで呼び出せます。",
      openCloset: "クローゼットを開く",
      stylistCard: "スタイリング提案",
      stylistStatus: "構造化提案 + 必須プレビュー",
      stylistDescription: "注文/クローゼットデータ → スタイルプロファイル → 天気&トレンド → すぐ試着できるコーデ案。",
      viewAdvice: "提案を見る",
    },
    avatar: {
      eyebrow: "アバター生成",
      title: "全身写真をアップロードし、体型パラメータを入力",
      description: "鮮明な正面全身写真のみ対応（>=1080x1920、<=10MB）。写実的に生成し、本人性を優先します。",
      uploadPhoto: "写真をアップロード",
      chooseImage: "画像を選んで開始",
      bodyParams: "体型パラメータ",
      fields: {
        heightCm: "身長(cm)",
        weightKg: "体重(kg)",
        shoulderWidthCm: "肩幅(cm)",
        chestCm: "胸囲(cm)",
        waistCm: "ウエスト(cm)",
        hipCm: "ヒップ(cm)",
      },
      validationLabels: {
        heightCm: "身長",
        weightKg: "体重",
        shoulderWidthCm: "肩幅",
        chestCm: "胸囲",
        waistCm: "ウエスト",
        hipCm: "ヒップ",
      },
      validation: {
        number: "{label}は数値で入力してください",
        integer: "{label}は整数で入力してください",
        range: "{label}は {min}〜{max} の範囲で入力してください",
        invalidParams: "パラメータが不正です",
        uploadFirst: "先に写真をアップロードしてください",
        fileTooLarge: "画像は10MB以下にしてください",
      },
      stages: {
        validating: "入力を確認中",
        uploading: "画像をアップロード中",
        creating: "生成タスクを作成中",
        processing: "処理中",
        doneWithPrefetch: "完了、バックグラウンドでポーズを事前生成中",
        done: "完了",
      },
      saveHint: "生成後は「現在のアバター」として自動保存されます。",
      generating: "生成中…",
      start: "生成開始",
      currentAvatar: "現在のアバター",
      emptyAvatar: "まだ生成されていません",
      tipsTitle: "ヒント",
      tips: [
        "写真に遮り、横顔、ぼけがあると本人性の一貫性が大きく下がります。",
        "生成品質は品質ゲートで制御され、失敗時は自動リトライまたは利用可能な結果へフォールバックします。",
        "次は「スタジオ」でポーズを切り替え、クローゼットのアイテムを試着します。",
      ],
      fallbackError: "エラーが発生しました",
      posePrefetchFailed: "ポーズの事前生成に失敗しました",
    },
    closet: {
      eyebrow: "マイクローゼット",
      title: "商品画像をアップロードし、単品画像へ自動クリーニング",
      description: "1枚あたり8MB以下。アップロード後、カテゴリに沿って対象アイテムを抽出し、スタジオでワンクリック試着できます。",
      chooseImage: "画像を選択",
      helper: "モデル着用の商品画像または白背景画像に対応。先にカテゴリを選ぶと対象アイテムを抽出しやすくなります。",
      category: "カテゴリ",
      selectImageError: "画像を選択してください",
      fileTooLarge: "服の画像は8MB以下にしてください",
      fallbackError: "エラーが発生しました",
      processing: "処理中... {progress}%",
      uploadButton: "処理してクローゼットへ追加",
      empty: "アイテムはまだありません。服をアップロードして試着を始めましょう。",
      favorited: "お気に入り済み",
      favorite: "お気に入り",
    },
    studio: {
      eyebrow: "ポーズと試着",
      title: "ポーズを選択 → アイテムを選択 → ワンクリック試着",
      description: "アバター生成後、すべてのポーズが自動で事前生成されます。生成済みのポーズと試着画像はキャッシュされ、すぐ戻れます。",
      generateAvatarFirst: "先にアバターを生成してください",
      poseRegenerateFailed: "ポーズの再生成に失敗しました",
      poseNotReady: "現在のポーズはまだ生成中のため、試着できません。",
      tryOnFailed: "試着に失敗しました",
      poseLibrary: "ポーズライブラリ",
      generating: "生成中",
      regenerate: "再生成",
      tryOnItems: "試着アイテム",
      closetEmpty: "クローゼットが空です。先にアイテムをアップロードしてください。",
      tryOnRunning: "試着中... {progress}%",
      retryTryOn: "再試着",
      oneClickTryOn: "ワンクリック試着",
      posePreview: "ポーズプレビュー",
      tryOnPreview: "試着プレビュー",
      poseEmptyWithAvatar: "現在のポーズ生成完了を待っています",
      poseEmptyNoAvatar: "先にアバターを生成してください",
      tryOnEmptyPoseNotReady: "現在のポーズ生成後に試着できます",
      tryOnEmptyWithGarment: "ワンクリック試着でこのポーズの試着画像を生成",
      tryOnEmptyNoGarment: "アイテムを選択してからワンクリック試着",
      emptyPreview: "まだ生成されていません",
      poseStatus: {
        running: "生成中",
        succeeded: "生成済み",
        failed: "失敗",
        idle: "未生成",
      },
      tryOnStatus: {
        running: "試着中",
        succeeded: "試着済み",
        failed: "試着失敗",
        idle: "クリックして選択",
      },
      poseSubtitle: {
        running: "生成中... {progress}%",
        succeeded: "キャッシュ済み · ポーズ切替で再生成不要",
        failed: "ポーズ生成に失敗しました。再生成してください。",
        idle: "未生成 · 再生成できます",
      },
      tryOnSubtitle: {
        running: "生成中... {progress}%",
        succeeded: "キャッシュ済み · 再生成で上書き",
        failed: "試着に失敗しました。再生成してください。",
        idle: "ポーズとアイテムごとにキャッシュ",
      },
    },
    orders: {
      eyebrow: "注文と認可",
      title: "OAuth連携とExcelインポート（次のステップ）",
      description: "MVPではまずAvatar/ポーズ/試着のループを完成させます。注文連携とスタイルプロファイルは次段階で同じタスクシステムとRAGパイプラインへ接続します。",
      upcoming: "近日対応",
      items: [
        "淘宝/Amazon OAuth2 PKCE 認可ログインとトークンの暗号化保存",
        "注文同期と標準化schema（カテゴリフィルタ精度>=98%）",
        "Excelテンプレートのダウンロード、列単位検証、行番号付きエラー返却（形式エラー率<=1%）",
      ],
    },
    stylist: {
      eyebrow: "AIスタイリング提案",
      title: "構造化提案 + 必須アバタープレビュー（次のステップ）",
      description: "各提案には必ずアバターの可視化プレビューを紐づけます。現段階では試着レンダリングを安定させ、その後に注文データ、天気、トレンドRAGを接続します。",
      engineTitle: "レコメンドエンジンで使用予定",
      items: [
        "マルチモーダルなスタイル認識：購入履歴とクローゼットアイテムにタグ付け（目標精度>=90%）",
        "RAG：トレンド知識ベース（VOGUE/WGSNなど）+ 根拠引用で幻覚を低減",
        "Agent：Outfit Plannerが構造化コーデを作成し、Try-on Rendererがプレビューを出力",
      ],
      goStudio: "まず試着を安定化",
      goOrders: "注文連携へ",
    },
    debug: {
      eyebrow: "Debug only",
      title: "画像生成ワークフローログ",
      refresh: "更新",
      refreshing: "更新中...",
      loadFailed: "読み込みに失敗しました",
      refreshFailed: "更新に失敗しました",
      recentRecords: "最近の記録",
      noLogs: "生成ログはありません",
      rounds: "ラウンド",
      calls: "回呼び出し",
      tokens: "tokens",
      selectLog: "ログを選択",
      jobId: "jobId",
      metrics: {
        roundCount: "生成ラウンド",
        remoteCalls: "リモート呼び出し",
        successfulCalls: "成功呼び出し",
        failedCalls: "失敗呼び出し",
        totalTokens: "総 tokens",
      },
      noFinalImage: "最終画像なし",
      rawSummary: "元の inputs / constraints / meta",
      round: "Round",
      roundKinds: {
        initial_generation: "初期生成",
        self_correction: "Self-check 修正",
      },
      metricCalls: "呼び出し",
      inputParts: "入力 parts",
      inputImages: "入力画像",
      outputImages: "出力画像",
      model: "モデル",
      status: "状態",
      duration: "所要時間",
      fullPrompt: "完全な prompt",
      taskLabels: {
        avatar_generate: "アバター生成",
        pose_render: "ポーズレンダー",
        garment_extract: "服の抽出",
        vton_tryon: "バーチャル試着",
        outfit_render: "コーデレンダー",
      },
      statusLabels: {
        running: "実行中",
        succeeded: "成功",
        failed: "失敗",
        queued: "待機中",
        canceled: "キャンセル済み",
      },
    },
  },
} as const;

export type Language = keyof typeof translations;
type Translation = (typeof translations)[Language];

const languageOptions: Array<{ code: Language; label: string }> = [
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
  { code: "jp", label: "JP" },
];

const languageLocale: Record<Language, string> = {
  en: "en-US",
  zh: "zh-CN",
  jp: "ja-JP",
};

const languageHtml: Record<Language, string> = {
  en: "en",
  zh: "zh-CN",
  jp: "ja",
};

const languageStorageKey = "style-ai-language";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translation;
  locale: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(languageStorageKey);
    if (saved === "en" || saved === "zh" || saved === "jp") {
      const restore = window.setTimeout(() => setLanguage(saved), 0);
      return () => window.clearTimeout(restore);
    }
    return undefined;
  }, []);

  useEffect(() => {
    document.documentElement.lang = languageHtml[language];
    window.localStorage.setItem(languageStorageKey, language);
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: translations[language],
      locale: languageLocale[language],
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }
  return context;
}

export function formatMessage(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function LanguageToggle({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { language, setLanguage, t } = useI18n();
  const dark = variant === "dark";

  return (
    <div
      aria-label={t.common.languageLabel}
      className={[
        "inline-flex shrink-0 items-center rounded-full p-0.5 text-[11px] font-semibold",
        dark ? "border border-white/60 bg-white/10 text-white" : "border border-zinc-200 bg-white text-zinc-700",
      ].join(" ")}
    >
      {languageOptions.map((option) => {
        const active = option.code === language;
        return (
          <button
            key={option.code}
            type="button"
            className={[
              "min-w-9 rounded-full px-2.5 py-1 transition-colors",
              active
                ? dark
                  ? "bg-white text-zinc-950"
                  : "bg-zinc-950 text-zinc-50"
                : dark
                  ? "text-white/85 hover:bg-white/10"
                  : "text-zinc-600 hover:bg-zinc-100",
            ].join(" ")}
            onClick={() => setLanguage(option.code)}
            aria-pressed={active}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
