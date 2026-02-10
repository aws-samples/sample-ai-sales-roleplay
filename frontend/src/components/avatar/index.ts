/**
 * アバターコンポーネント エクスポート
 * 3Dアバター機能に関連するすべてのコンポーネントとユーティリティをエクスポート
 */

// ===== メインコンポーネント =====
// VRMアバター表示コンポーネント（Three.js + @pixiv/three-vrm）
export { default as VRMAvatar } from './VRMAvatar';

// VRMアバターコンテナ（感情状態管理付き）
export { default as VRMAvatarContainer } from './VRMAvatarContainer';

// ===== Context =====
// アバター状態管理Context
export {
  default as AvatarContext,
  AvatarProvider,
  useAvatar,
} from './AvatarContext';

// ===== UI補助コンポーネント =====

// ===== ユーティリティクラス =====
// VRMファイルローダー
export { default as VRMLoader } from './VRMLoader';
export type { LoadProgressCallback } from './VRMLoader';

// 表情コントローラー
export { default as ExpressionController } from './ExpressionController';

// リップシンクコントローラー
export { default as LipSyncController } from './LipSyncController';

// アニメーションコントローラー（瞬き・呼吸）
export { default as AnimationController } from './AnimationController';

// ===== 型定義の再エクスポート =====
export type {
  AvatarInfo,
  AvatarContextState,
  VisemeData,
  VRMExpressionName,
  ExpressionMapping,
  VRMAvatarProps,
  VRMAvatarContainerProps,
} from '../../types/avatar';

// 感情から表情へのマッピング定数
export { EMOTION_TO_VRM_EXPRESSION } from '../../types/avatar';
