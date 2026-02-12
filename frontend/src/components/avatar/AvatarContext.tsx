/**
 * アバターContext
 * アバター情報の状態管理とCloudFront経由のVRMモデル読み込みを提供
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { AvatarInfo, AvatarContextState } from '../../types/avatar';

/**
 * アバターContextの値の型定義
 */
interface AvatarContextValue extends AvatarContextState {
  loadAvatar: (avatarId: string, s3Key?: string) => Promise<void>;
}

/**
 * アバターContextのデフォルト値
 */
const defaultContextValue: AvatarContextValue = {
  currentAvatarId: null,
  avatarInfo: null,
  isLoading: false,
  error: null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadAvatar: async (_avatarId: string, _s3Key?: string) => { },
};

/**
 * アバターContext
 */
const AvatarContext = createContext<AvatarContextValue>(defaultContextValue);

/**
 * CloudFront経由のアバターCDN URL
 */
const AVATAR_CDN_URL = import.meta.env.VITE_AVATAR_CDN_URL || '';

/**
 * デフォルトアバターのモデルパス（ローカルアセット）
 */
const DEFAULT_AVATAR_MODEL_PATH = '/models/avatars/default_girl1.vrm';

/**
 * AvatarProviderのプロパティ
 */
interface AvatarProviderProps {
  children: ReactNode;
}

/**
 * アバターContextプロバイダー
 * アバター情報の状態管理を提供するコンポーネント
 */
export const AvatarProvider: React.FC<AvatarProviderProps> = ({ children }) => {
  // 状態管理
  const [currentAvatarId, setCurrentAvatarId] = useState<string | null>(null);
  const [avatarInfo, setAvatarInfo] = useState<AvatarInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  /**
   * アバターを読み込む
   * avatarIdが指定された場合はCloudFront経由でVRMモデルを参照
   * 未指定の場合はデフォルトアバターを使用
   * @param avatarId - 読み込むアバターのID
   * @param s3Key - S3キー（"avatars/{userId}/{avatarId}/{fileName}" 形式）
   */
  const loadAvatar = useCallback(async (avatarId: string, s3Key?: string): Promise<void> => {
    // 同じアバターが既に読み込まれている場合はスキップ
    // ただしs3Keyが新たに提供された場合は再読み込み
    if (currentAvatarId === avatarId && avatarInfo) {
      if (!s3Key || avatarInfo.s3Key === s3Key) {
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      if (avatarId === 'default' || !avatarId) {
        // デフォルトアバター
        setCurrentAvatarId('default');
        setAvatarInfo({
          id: 'default',
          name: 'default',
          modelPath: DEFAULT_AVATAR_MODEL_PATH,
        });
      } else if (AVATAR_CDN_URL && s3Key) {
        // s3Keyは "avatars/{userId}/{avatarId}/{fileName}" 形式
        // VITE_AVATAR_CDN_URLは "https://xxx.cloudfront.net/avatars" なので
        // s3Keyから先頭の "avatars/" を除去して結合
        const relativePath = s3Key.replace(/^avatars\//, '');
        const modelPath = `${AVATAR_CDN_URL}/${relativePath}`;
        setCurrentAvatarId(avatarId);
        setAvatarInfo({
          id: avatarId,
          name: avatarId,
          modelPath,
          s3Key,
        });
      } else if (AVATAR_CDN_URL) {
        console.warn('s3Key not provided, falling back to default avatar');
        setCurrentAvatarId('default');
        setAvatarInfo({
          id: 'default',
          name: 'default',
          modelPath: DEFAULT_AVATAR_MODEL_PATH,
        });
      } else {
        console.warn('VITE_AVATAR_CDN_URL not configured, falling back to default avatar');
        setCurrentAvatarId('default');
        setAvatarInfo({
          id: 'default',
          name: 'default',
          modelPath: DEFAULT_AVATAR_MODEL_PATH,
        });
      }
    } catch (err) {
      const errorObj = err instanceof Error
        ? err
        : new Error('Failed to load avatar');
      setError(errorObj);
      console.error('Avatar load error:', errorObj);
    } finally {
      setIsLoading(false);
    }
  }, [currentAvatarId, avatarInfo]);

  // Contextの値をメモ化
  const contextValue = useMemo<AvatarContextValue>(
    () => ({
      currentAvatarId,
      avatarInfo,
      isLoading,
      error,
      loadAvatar,
    }),
    [
      currentAvatarId,
      avatarInfo,
      isLoading,
      error,
      loadAvatar,
    ]
  );

  return (
    <AvatarContext.Provider value={contextValue}>
      {children}
    </AvatarContext.Provider>
  );
};

/**
 * アバターContextを使用するカスタムフック
 * @returns アバターContextの値
 * @throws AvatarProvider外で使用された場合にエラー
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAvatar = (): AvatarContextValue => {
  const context = useContext(AvatarContext);

  if (context === undefined) {
    throw new Error('useAvatar must be used within an AvatarProvider');
  }

  return context;
};

export default AvatarContext;
