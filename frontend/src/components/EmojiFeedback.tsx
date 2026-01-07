import React, {
  useState,
  useEffect,
  memo,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  getPerformanceInfo,
  optimizeAnimation,
} from "../utils/performanceUtils";
import { Box, Typography } from "@mui/material";
import { visuallyHidden } from "@mui/utils";
import { EmotionState } from "../types/index";
import {
  calculateEmotionState,
  getEmojiForEmotion,
  validateAndCompleteEmojiMap,
  EMOTION_DESCRIPTIONS,
  EMOTION_DETAILED_DESCRIPTIONS,
  EMOTION_COLORS,
} from "../utils/emotionUtils";
import { getFocusStyles } from "../utils/accessibilityUtils";

/**
 * EmojiFeedbackコンポーネントのプロパティ
 */
export interface EmojiFeedbackProps {
  /** 怒りレベル (0-10) */
  angerLevel: number;
  /** 信頼度レベル (0-10) */
  trustLevel: number;
  /** 進捗度レベル (0-10) */
  progressLevel: number;
  /** 絵文字のサイズ */
  size?: "small" | "medium" | "large" | number;
  /** 絵文字の表示位置 */
  position?: "top" | "center" | "bottom";
  /** アニメーション有効/無効 */
  animationEnabled?: boolean;
  /** カスタム絵文字マッピング */
  customEmojis?: Record<EmotionState, string>;
  /** 感情状態変化時のコールバック */
  onEmotionChange?: (emotion: EmotionState) => void;
  /** アクセシビリティ用のラベルID */
  ariaLabelledBy?: string;
  /** アクセシビリティ用の説明ID */
  ariaDescribedBy?: string;
  /** カスタムスタイル */
  style?: React.CSSProperties;
  /** カスタムクラス名 */
  className?: string;
  /** テーマ設定 */
  theme?: "light" | "dark" | "auto";
  /** 高コントラストモード */
  highContrast?: boolean;
  /** キーボードフォーカス可能にする */
  focusable?: boolean;
  /** タブインデックス */
  tabIndex?: number;
  /** 状態変化通知の有効/無効 */
  announceStateChanges?: boolean;
}

/**
 * EmojiFeedbackコンポーネント
 *
 * メトリクス（怒り、信頼度、進捗度）に基づいて感情状態を絵文字で表示するコンポーネント
 */
const EmojiFeedback: React.FC<EmojiFeedbackProps> = ({
  angerLevel,
  trustLevel,
  progressLevel,
  size = "medium",
  position = "center",
  animationEnabled = true,
  customEmojis,
  onEmotionChange,
  ariaLabelledBy,
  ariaDescribedBy,
  style,
  className,
  theme = "light",
  highContrast = false,
  focusable = false,
  tabIndex = -1,
  announceStateChanges = true,
}) => {
  // 感情状態の状態管理
  const [currentEmotion, setCurrentEmotion] = useState<EmotionState>("neutral");
  // 前回の感情状態を記録
  const [previousEmotion, setPreviousEmotion] = useState<EmotionState | null>(
    null,
  );
  // 絵文字マッピングの状態管理
  const [emojiMap, setEmojiMap] = useState(() =>
    validateAndCompleteEmojiMap(customEmojis),
  );
  // スクリーンリーダー用の通知メッセージ
  const [announcement, setAnnouncement] = useState<string>("");
  // コンポーネント参照
  const emojiRef = useRef<HTMLDivElement>(null);

  // サイズに基づくフォントサイズの設定（メモ化）
  const getFontSize = useMemo(() => {
    // 数値の場合はそのままrem単位で返す
    if (typeof size === "number") {
      return `${size}rem`;
    }

    // 文字列の場合はプリセットサイズを返す
    switch (size) {
      case "small":
        return "2rem";
      case "large":
        return "6rem";
      case "medium":
      default:
        return "4rem";
    }
  }, [size]);

  // 位置に基づくスタイルの設定（メモ化）
  const positionStyle = useMemo(() => {
    switch (position) {
      case "top":
        return { alignItems: "flex-start" };
      case "bottom":
        return { alignItems: "flex-end" };
      case "center":
      default:
        return { alignItems: "center" };
    }
  }, [position]);

  // デバイスのパフォーマンス情報を取得（メモ化）
  const performanceInfo = useMemo(() => {
    return getPerformanceInfo();
  }, []);

  // アニメーションタイプの選択（メモ化）
  const animationType = useMemo(() => {
    if (!animationEnabled) return "none";

    // ユーザーの設定でアニメーションを削減する場合はアニメーションを無効化
    if (performanceInfo.prefersReducedMotion) {
      return "none";
    }

    // デバイスの性能に基づいてアニメーションを最適化
    let baseAnimation = "none";
    switch (currentEmotion) {
      case "angry":
        baseAnimation = "shake 0.8s ease-in-out";
        break;
      case "annoyed":
        baseAnimation = "shake 0.5s ease-in-out";
        break;
      case "happy":
        baseAnimation = "bounce 1s ease-in-out";
        break;
      case "satisfied":
        baseAnimation = "pulse 1s ease-in-out";
        break;
      case "neutral":
      default:
        baseAnimation = "none";
    }

    // デバイスの性能に基づいてアニメーションを最適化
    return optimizeAnimation(baseAnimation);
  }, [animationEnabled, currentEmotion, performanceInfo]);

  // メトリクスの変更を検出するための前回値をstateで管理
  const [prevMetrics, setPrevMetrics] = useState({ angerLevel, trustLevel, progressLevel });

  // メトリクスが実際に変更されたかどうかを確認
  const metricsChanged = useMemo(() => {
    return (
      prevMetrics.angerLevel !== angerLevel ||
      prevMetrics.trustLevel !== trustLevel ||
      prevMetrics.progressLevel !== progressLevel
    );
  }, [angerLevel, trustLevel, progressLevel, prevMetrics]);

  // メトリクス参照値の更新
  useEffect(() => {
    setPrevMetrics({ angerLevel, trustLevel, progressLevel });
  }, [angerLevel, trustLevel, progressLevel]);

  // 感情状態の計算をメモ化
  const newEmotion = useMemo(() => {
    // メトリクスが変更された場合のみ再計算
    if (metricsChanged) {
      const calculatedEmotion = calculateEmotionState({
        angerLevel,
        trustLevel,
        progressLevel,
        previousEmotion: currentEmotion,
      });

      // 感情状態を計算

      return calculatedEmotion;
    }
    return currentEmotion;
  }, [angerLevel, trustLevel, progressLevel, currentEmotion, metricsChanged]);

  // 感情状態の更新処理をコールバックとして定義
  const updateEmotionState = useCallback(
    (emotion: EmotionState) => {
      // 前回の感情状態を保存
      setPreviousEmotion(currentEmotion);
      setCurrentEmotion(emotion);

      // 感情状態変化時のコールバックを呼び出し
      if (onEmotionChange) {
        onEmotionChange(emotion);
      }

      // スクリーンリーダー用の通知メッセージを設定
      if (announceStateChanges) {
        const fromText = previousEmotion
          ? EMOTION_DESCRIPTIONS[previousEmotion]
          : "";
        const toText = EMOTION_DESCRIPTIONS[emotion];
        const changeMessage = previousEmotion
          ? `感情状態が${fromText}から${toText}に変化しました`
          : `感情状態: ${toText}`;
        setAnnouncement(changeMessage);
      }
    },
    [currentEmotion, onEmotionChange, previousEmotion, announceStateChanges],
  );

  // 感情状態の更新
  useEffect(() => {
    if (newEmotion !== currentEmotion) {
      updateEmotionState(newEmotion);
    }
  }, [newEmotion, currentEmotion, updateEmotionState]);

  // カスタム絵文字マッピングの更新（メモ化）
  const validatedEmojiMap = useMemo(() => {
    return validateAndCompleteEmojiMap(customEmojis);
  }, [customEmojis]);

  // カスタム絵文字マッピングの更新
  useEffect(() => {
    setEmojiMap(validatedEmojiMap);
  }, [validatedEmojiMap]);

  // 現在の感情状態に対応する絵文字を取得（メモ化）
  const currentEmoji = useMemo(() => {
    return getEmojiForEmotion(currentEmotion, emojiMap);
  }, [currentEmotion, emojiMap]);

  // 現在の感情状態の説明テキスト（メモ化）
  const emotionDescription = useMemo(() => {
    return EMOTION_DESCRIPTIONS[currentEmotion];
  }, [currentEmotion]);

  // テーマと感情状態に基づくスタイルの設定（メモ化）
  const themeStyle = useMemo(() => {
    // 現在の感情状態に対応する色を取得
    const emotionColor = EMOTION_COLORS[currentEmotion];

    // 高コントラストモードの場合は、テーマに関わらず高コントラスト設定を適用
    if (highContrast) {
      return {
        backgroundColor: "#000000",
        color: emotionColor.highContrast,
        borderRadius: "8px",
        padding: "12px",
        border: "2px solid #ffffff",
        boxShadow: "0 0 0 2px #000000",
        textShadow: "0 0 2px rgba(255, 255, 255, 0.5)",
        outline: `4px ${currentEmotion === "angry" || currentEmotion === "annoyed" ? "dashed" : "solid"} #ffffff`,
        outlineOffset: "2px",
      };
    }

    // テーマに応じたスタイルを設定
    if (theme === "dark") {
      return {
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        color: emotionColor.dark,
        borderRadius: "8px",
        padding: "8px",
        textShadow: "0 0 2px rgba(255, 255, 255, 0.3)",
        border: `2px ${currentEmotion === "angry" || currentEmotion === "annoyed" ? "dashed" : "solid"} ${emotionColor.dark}`,
      };
    }

    if (theme === "light") {
      return {
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        color: emotionColor.light,
        borderRadius: "8px",
        padding: "8px",
        textShadow: "0 0 1px rgba(0, 0, 0, 0.3)",
        border: `2px ${currentEmotion === "angry" || currentEmotion === "annoyed" ? "dashed" : "solid"} ${emotionColor.light}`,
      };
    }

    // auto または default
    // システムの設定を取得するロジック
    const prefersDarkMode =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (prefersDarkMode) {
      return {
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        color: emotionColor.dark,
        borderRadius: "8px",
        padding: "8px",
        textShadow: "0 0 2px rgba(255, 255, 255, 0.3)",
        border: `2px ${currentEmotion === "angry" || currentEmotion === "annoyed" ? "dashed" : "solid"} ${emotionColor.dark}`,
      };
    } else {
      return {
        backgroundColor: "rgba(255, 255, 255, 0.9)",
        color: emotionColor.light,
        borderRadius: "8px",
        padding: "8px",
        textShadow: "0 0 1px rgba(0, 0, 0, 0.3)",
        border: `2px ${currentEmotion === "angry" || currentEmotion === "annoyed" ? "dashed" : "solid"} ${emotionColor.light}`,
      };
    }
  }, [currentEmotion, theme, highContrast]);

  // キーボードイベントハンドラー（コールバックとしてメモ化）
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // スペースキーまたはEnterキーで詳細情報を表示
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        // 詳細情報をスクリーンリーダーに通知
        setAnnouncement(EMOTION_DETAILED_DESCRIPTIONS[currentEmotion]);
      }

      // 矢印キーでナビゲーションをサポート
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        // キーボードナビゲーションのサポートを追加する場合はここに実装
      }
    },
    [currentEmotion, setAnnouncement],
  );

  // フォーカススタイルの設定（メモ化）
  const focusableProps = useMemo(() => {
    if (!focusable) return {};

    return {
      tabIndex: tabIndex,
      onKeyDown: handleKeyDown,
      "aria-pressed": false, // 押下状態を設定
      "aria-haspopup": true, // 詳細情報が利用可能であることを示す
      "aria-label": `感情状態: ${EMOTION_DESCRIPTIONS[currentEmotion]}`, // アクセシビリティ用のラベル
      sx: {
        "&:focus": getFocusStyles(),
        "&:focus-visible": getFocusStyles(),
        cursor: "pointer", // ポインタを表示してクリック可能であることを示す
        "&:hover": {
          opacity: 0.9,
          transform: "scale(1.05)",
          transition: "transform 0.2s ease-in-out",
        },
        "@media (prefers-reduced-motion: reduce)": {
          "&:hover": {
            transform: "none",
            transition: "none",
          },
        },
      },
    };
  }, [focusable, tabIndex, handleKeyDown, currentEmotion]);

  // クリックハンドラー（メモ化）
  const handleClick = useCallback(() => {
    if (focusable) {
      setAnnouncement(EMOTION_DETAILED_DESCRIPTIONS[currentEmotion]);
    }
  }, [focusable, currentEmotion, setAnnouncement]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      {...positionStyle}
      height="100%"
      component="div"
      role={focusable ? "button" : "img"}
      aria-labelledby={ariaLabelledBy || "emoji-feedback-label"}
      aria-describedby={`${ariaDescribedBy || "emoji-feedback-description"} ${ariaDescribedBy ? `${ariaDescribedBy}-detail` : "emoji-feedback-description-detail"}`}
      aria-live="polite"
      aria-atomic="true"
      className={className}
      ref={emojiRef}
      onClick={handleClick}
      sx={{
        ...themeStyle,
        ...style,
        ...(focusable && focusableProps.sx),
      }}
      {...(focusable
        ? {
            tabIndex: focusableProps.tabIndex,
            onKeyDown: focusableProps.onKeyDown,
            "aria-pressed": focusableProps["aria-pressed"],
            "aria-haspopup": focusableProps["aria-haspopup"],
            "aria-label": focusableProps["aria-label"],
          }
        : {})}
    >
      <Typography
        variant="h1"
        component="div"
        aria-hidden="true" // スクリーンリーダーは絵文字自体を読み上げる必要はない
        sx={{
          fontSize: getFontSize,
          lineHeight: 1,
          textAlign: "center",
          transition: animationEnabled ? "transform 0.3s ease-in-out" : "none",
          animation: animationType,
          "@keyframes pulse": {
            "0%": { transform: "scale(1)" },
            "50%": { transform: "scale(1.1)" },
            "100%": { transform: "scale(1)" },
          },
          "@keyframes shake": {
            "0%, 100%": { transform: "translateX(0)" },
            "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-5px)" },
            "20%, 40%, 60%, 80%": { transform: "translateX(5px)" },
          },
          "@keyframes bounce": {
            "0%, 20%, 50%, 80%, 100%": { transform: "translateY(0)" },
            "40%": { transform: "translateY(-20px)" },
            "60%": { transform: "translateY(-10px)" },
          },
          "@media (prefers-reduced-motion: reduce)": {
            animation: "none",
            transition: "none",
          },
          // モバイルデバイスの最適化
          "@media (max-width: 600px)": {
            fontSize:
              typeof size === "number"
                ? `${size * 0.8}rem`
                : size === "large"
                  ? "4.8rem"
                  : size === "medium"
                    ? "3.2rem"
                    : "1.6rem",
          },
          // 低スペックデバイスの最適化
          ...(performanceInfo.isLowEndDevice
            ? {
                // 低スペックデバイスではアニメーションを簡素化
                animationDuration: "1.5s",
                animationTimingFunction: "linear",
              }
            : {}),
          // ハードウェアアクセラレーションの有効化
          willChange:
            animationEnabled && !performanceInfo.isLowEndDevice
              ? "transform"
              : "auto",
          // レイヤー化によるパフォーマンス向上
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
          // モバイルデバイスでのタッチ操作の最適化
          touchAction: "manipulation",
          // テキストのレンダリング最適化
          textRendering: "optimizeSpeed",
          // スムーススクロールの最適化
          WebkitOverflowScrolling: "touch",
        }}
      >
        {currentEmoji}
      </Typography>

      {/* 感情状態を表すテキストラベル（色覚異常者向けの追加情報） */}
      <Typography
        variant="caption"
        component="div"
        sx={{
          fontSize: "0.8rem",
          textAlign: "center",
          marginTop: "4px",
          fontWeight: "bold",
          // 高コントラストモードでは表示、通常モードでは非表示
          display: highContrast ? "block" : "none",
        }}
      >
        {EMOTION_DESCRIPTIONS[currentEmotion]}
      </Typography>

      {/* スクリーンリーダー用の説明テキスト */}
      <Typography id={ariaDescribedBy} sx={{ ...visuallyHidden }}>
        現在の感情状態: {emotionDescription}
      </Typography>

      {/* 詳細な説明テキスト */}
      <Typography id={`${ariaDescribedBy}-detail`} sx={{ ...visuallyHidden }}>
        {EMOTION_DETAILED_DESCRIPTIONS[currentEmotion]}
      </Typography>

      {/* 状態変化通知用の領域 */}
      {announceStateChanges && (
        <div
          aria-live="polite"
          aria-atomic="true"
          role="status"
          style={visuallyHidden as React.CSSProperties}
        >
          {announcement}
        </div>
      )}

      {/* アクセシビリティテスト用の隠し要素 */}
      <span
        id="emoji-feedback-label"
        style={visuallyHidden as React.CSSProperties}
      >
        感情フィードバック
      </span>
      <span
        id="emoji-feedback-description"
        style={visuallyHidden as React.CSSProperties}
      >
        {emotionDescription}
      </span>
      <span
        id="emoji-feedback-description-detail"
        style={visuallyHidden as React.CSSProperties}
      >
        {EMOTION_DETAILED_DESCRIPTIONS[currentEmotion]}
      </span>
    </Box>
  );
};

// パフォーマンス最適化のためにメモ化
// カスタム比較関数を定義して不要な再レンダリングを防止
const arePropsEqual = (
  prevProps: EmojiFeedbackProps,
  nextProps: EmojiFeedbackProps,
) => {
  // メトリクス値の変更を確認（ヒステリシスを考慮）
  const METRICS_THRESHOLD = 0.2; // この値以上の変化がある場合のみ再レンダリング
  if (
    Math.abs(prevProps.angerLevel - nextProps.angerLevel) > METRICS_THRESHOLD ||
    Math.abs(prevProps.trustLevel - nextProps.trustLevel) > METRICS_THRESHOLD ||
    Math.abs(prevProps.progressLevel - nextProps.progressLevel) >
      METRICS_THRESHOLD
  ) {
    return false; // メトリクス値が変化した場合は再レンダリング
  }

  // サイズや位置などの表示設定の変更を確認
  if (
    prevProps.size !== nextProps.size ||
    prevProps.position !== nextProps.position ||
    prevProps.animationEnabled !== nextProps.animationEnabled ||
    prevProps.theme !== nextProps.theme ||
    prevProps.highContrast !== nextProps.highContrast ||
    prevProps.focusable !== nextProps.focusable
  ) {
    return false; // 表示設定が変化した場合は再レンダリング
  }

  // カスタム絵文字マッピングの変更を確認
  // JSON.stringifyはパフォーマンスコストが高いため、カスタム絵文字が存在する場合のみ比較
  if (prevProps.customEmojis || nextProps.customEmojis) {
    // 片方のみが存在する場合は変更あり
    if (
      (!prevProps.customEmojis && nextProps.customEmojis) ||
      (prevProps.customEmojis && !nextProps.customEmojis)
    ) {
      return false;
    }

    // 両方存在する場合は内容を比較
    if (prevProps.customEmojis && nextProps.customEmojis) {
      const prevEmojis = prevProps.customEmojis;
      const nextEmojis = nextProps.customEmojis;
      const emotionStates: EmotionState[] = [
        "angry",
        "annoyed",
        "neutral",
        "satisfied",
        "happy",
      ];

      for (const state of emotionStates) {
        if (prevEmojis[state] !== nextEmojis[state]) {
          return false;
        }
      }
    }
  }

  // スタイルやクラス名の変更を確認
  if (
    prevProps.className !== nextProps.className ||
    JSON.stringify(prevProps.style) !== JSON.stringify(nextProps.style)
  ) {
    return false;
  }

  // その他のプロパティは再レンダリングに影響しないと判断
  return true;
};

export default memo(EmojiFeedback, arePropsEqual);
