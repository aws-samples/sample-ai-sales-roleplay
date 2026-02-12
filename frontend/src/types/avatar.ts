/**
 * アバター関連の型定義
 */
import { EmotionState } from './index';

/**
 * アバター情報（DynamoDB管理）
 */
export interface AvatarInfo {
  id: string;
  name: string;
  modelPath: string;
  s3Key?: string;
  thumbnail?: string;
  description?: string;
  isDefault?: boolean;
}

/**
 * Polly visemeから日本語母音へのマッピング
 */
export const POLLY_VISEME_TO_VOWEL: Record<string, VisemeData['value']> = {
  // 母音系
  'a': 'a', '@': 'a', 'E': 'a',
  'i': 'i', 'I': 'i',
  'u': 'u', 'U': 'u',
  'e': 'e',
  'o': 'o', 'O': 'o',
  // 子音・無音系 → 閉口
  'sil': 'sil', 'p': 'sil', 't': 'sil', 'S': 'sil', 'T': 'sil',
  'f': 'sil', 'k': 'sil', 'r': 'sil', 's': 'sil', 'd': 'sil',
  'g': 'sil', 'n': 'sil', 'm': 'sil', 'N': 'sil', 'l': 'sil',
  'w': 'a', 'W': 'u', 'Y': 'i', 'j': 'i', 'z': 'sil', 'Z': 'sil',
  'th': 'sil', 'DH': 'sil',
};

/**
 * Visemeデータ（Phase 2: リップシンク用）
 */
export interface VisemeData {
  time: number;
  value: 'a' | 'i' | 'u' | 'e' | 'o' | 'sil';
}

/**
 * アバターContext状態
 */
export interface AvatarContextState {
  currentAvatarId: string | null;
  avatarInfo: AvatarInfo | null;
  isLoading: boolean;
  error: Error | null;
}

/**
 * VRM表情名
 */
export type VRMExpressionName = 'happy' | 'angry' | 'sad' | 'relaxed' | 'neutral';

/**
 * 表情ブレンドエントリ（表情名と強度のペア）
 */
export interface ExpressionBlendEntry {
  name: string;
  intensity: number;
}

/**
 * 表情マッピング設定
 * blendで複数表情の組み合わせを指定可能
 */
export interface ExpressionMapping {
  expression: VRMExpressionName;
  intensity: number;
  blend?: ExpressionBlendEntry[];
}

/**
 * EmotionStateからVRM表情へのマッピング
 * angry: angry + blink(0.3) のブレンドで目を細める怒り表現を採用
 */
export const EMOTION_TO_VRM_EXPRESSION: Record<EmotionState, ExpressionMapping> = {
  happy: { expression: 'happy', intensity: 1.0 },
  satisfied: { expression: 'relaxed', intensity: 0.8 },
  neutral: { expression: 'neutral', intensity: 0.0 },
  annoyed: { expression: 'angry', intensity: 0.6, blend: [{ name: 'blink', intensity: 0.15 }] },
  angry: { expression: 'angry', intensity: 1.0, blend: [{ name: 'blink', intensity: 0.3 }] },
};

/**
 * ジェスチャータイプ
 */
export type GestureType = 'nod' | 'headTilt' | 'none';

/**
 * VRMAvatarコンポーネントのプロパティ
 */
export interface VRMAvatarProps {
  modelUrl: string;
  emotion: EmotionState;
  isSpeaking: boolean;
  visemeData?: VisemeData[];
  directEmotion?: EmotionState;
  gesture?: GestureType;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

/**
 * VRMAvatarContainerのプロパティ
 */
export interface VRMAvatarContainerProps {
  avatarId?: string;
  avatarS3Key?: string;
  angerLevel: number;
  trustLevel: number;
  progressLevel: number;
  isSpeaking: boolean;
  directEmotion?: EmotionState;
  gesture?: GestureType;
  onEmotionChange?: (emotion: EmotionState) => void;
}
