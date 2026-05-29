/**
 * ビデオ録画設定の永続化ユーティリティ
 *
 * localStorageを介してビデオ録画機能のオン/オフ設定を読み書きする。
 * Safariプライベートモードやストレージ無効環境での例外を考慮し、
 * すべてのアクセスをtry-catchで保護する。
 */

/** localStorageのキー名 */
const STORAGE_KEY = "videoRecordingEnabled";

/**
 * ビデオ録画設定のデフォルト値（true = 録画オン）
 * 既存動作の維持のため、未設定時は録画オンとする。
 * デフォルト値の単一の真実の源（Single Source of Truth）。
 */
export const DEFAULT_VIDEO_RECORDING_ENABLED = true;

/**
 * ビデオ録画設定をlocalStorageから読み込む
 *
 * @returns 録画が有効な場合はtrue。未設定または読み込み失敗時はデフォルト値
 */
export function loadVideoRecordingEnabled(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // 未設定（null）の場合はデフォルト値を返す（既存動作を維持）
    if (saved === null) {
      return DEFAULT_VIDEO_RECORDING_ENABLED;
    }
    return saved === "true";
  } catch (error) {
    // localStorageが利用できない環境（プライベートモード等）ではデフォルト値にフォールバック
    console.warn(
      "ビデオ録画設定の読み込みに失敗しました。デフォルト値を使用します。 / Failed to load video recording setting, using default.",
      error,
    );
    return DEFAULT_VIDEO_RECORDING_ENABLED;
  }
}

/**
 * ビデオ録画設定をlocalStorageに保存する
 *
 * @param enabled 録画を有効にする場合はtrue
 */
export function saveVideoRecordingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch (error) {
    // 保存失敗時もアプリの動作は継続する（設定が永続化されないだけ）
    console.warn(
      "ビデオ録画設定の保存に失敗しました。 / Failed to save video recording setting.",
      error,
    );
  }
}
