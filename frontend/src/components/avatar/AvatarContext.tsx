/**
 * アバターContext
 * アバター情報の状態管理とmanifest.jsonからのデータ取得を提供
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { AvatarInfo, AvatarManifest, AvatarContextState } from '../../types/avatar';

/**
 * アバターContextの値の型定義
 */
interface AvatarContextValue extends AvatarContextState {
  loadAvatar: (avatarId: string) => Promise<void>;
  getAvatarList: () => Promise<AvatarInfo[]>;
  getDefaultAvatarId: () => Promise<string | null>;
}

/**
 * アバターContextのデフォルト値
 */
const defaultContextValue: AvatarContextValue = {
  currentAvatarId: null,
  avatarInfo: null,
  isLoading: false,
  error: null,
  loadAvatar: async () => { },
  getAvatarList: async () => [],
  getDefaultAvatarId: async () => null,
};

/**
 * アバターContext
 */
const AvatarContext = createContext<AvatarContextValue>(defaultContextValue);

/**
 * マニフェストファイルのパス
 */
const MANIFEST_PATH = '/models/avatars/manifest.json';

/**
 * マニフェストファイルを取得する
 */
const fetchManifest = async (cache: React.MutableRefObject<AvatarManifest | null>): Promise<AvatarManifest> => {
  if (cache.current) {
    return cache.current;
  }

  try {
    const response = await fetch(MANIFEST_PATH);

    if (!response.ok) {
      throw new Error(`マニフェストの取得に失敗しました: ${response.status}`);
    }

    const manifest: AvatarManifest = await response.json();

    if (!manifest.avatars || !Array.isArray(manifest.avatars)) {
      throw new Error('マニフェストの形式が不正です: avatars配列が見つかりません');
    }

    cache.current = manifest;

    return manifest;
  } catch (error) {
    console.error('マニフェスト取得エラー:', error);
    throw error instanceof Error
      ? error
      : new Error('マニフェストの取得に失敗しました');
  }
};

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
  const manifestCacheRef = useRef<AvatarManifest | null>(null);

  /**
   * アバターを読み込む
   * @param avatarId - 読み込むアバターのID
   */
  const loadAvatar = useCallback(async (avatarId: string): Promise<void> => {
    // 同じアバターが既に読み込まれている場合はスキップ
    if (currentAvatarId === avatarId && avatarInfo) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const manifest = await fetchManifest(manifestCacheRef);

      // 指定されたIDのアバターを検索
      const avatar = manifest.avatars.find((a) => a.id === avatarId);

      if (!avatar) {
        throw new Error(`アバターが見つかりません: ${avatarId}`);
      }

      setCurrentAvatarId(avatarId);
      setAvatarInfo(avatar);
    } catch (err) {
      const errorObj = err instanceof Error
        ? err
        : new Error('アバターの読み込みに失敗しました');
      setError(errorObj);
      console.error('アバター読み込みエラー:', errorObj);
    } finally {
      setIsLoading(false);
    }
  }, [currentAvatarId, avatarInfo]);

  /**
   * アバター一覧を取得する
   */
  const getAvatarList = useCallback(async (): Promise<AvatarInfo[]> => {
    try {
      const manifest = await fetchManifest(manifestCacheRef);
      return manifest.avatars;
    } catch (err) {
      console.error('アバター一覧取得エラー:', err);
      return [];
    }
  }, []);

  /**
   * デフォルトアバターIDを取得する
   */
  const getDefaultAvatarId = useCallback(async (): Promise<string | null> => {
    try {
      const manifest = await fetchManifest(manifestCacheRef);
      return manifest.defaultAvatarId || null;
    } catch (err) {
      console.error('デフォルトアバターID取得エラー:', err);
      return null;
    }
  }, []);

  // Contextの値をメモ化
  const contextValue = useMemo<AvatarContextValue>(
    () => ({
      currentAvatarId,
      avatarInfo,
      isLoading,
      error,
      loadAvatar,
      getAvatarList,
      getDefaultAvatarId,
    }),
    [
      currentAvatarId,
      avatarInfo,
      isLoading,
      error,
      loadAvatar,
      getAvatarList,
      getDefaultAvatarId,
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
    throw new Error('useAvatarはAvatarProvider内で使用する必要があります');
  }

  return context;
};

export default AvatarContext;
