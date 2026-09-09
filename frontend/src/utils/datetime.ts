/**
 * サーバー由来の日時文字列を安全に Date へ変換するユーティリティ。
 *
 * バックエンドの一部は過去に、タイムゾーン指定のない ISO 8601 文字列
 * (例: "2026-09-07T08:41:40.999128") を保存していた。JavaScript の
 * `new Date()` はタイムゾーン指定のない文字列をブラウザのローカルタイム
 * (JST では UTC+9) として解釈するため、UTC を想定した値が実際より
 * 9 時間ずれる。一方 "Z" 付きの値は UTC として解釈される。
 *
 * この不統一により、例えば商談時間が実際より約 540 分 (9 時間) 長く
 * 表示される不具合が発生していた (Issue #111)。
 *
 * バックエンドは UTC・"Z" 付きへ統一したが、既に保存済みの "Z" なし
 * データも正しく扱えるよう、フロントエンド側でも UTC 補完を行う。
 */

/** 文字列に明示的なタイムゾーン指定 ("Z" もしくは ±hh:mm) が含まれるか判定する。 */
const hasTimezone = (value: string): boolean =>
  /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim());

/**
 * サーバー由来の日時文字列を Date に変換する。
 *
 * - タイムゾーン指定が無い ISO 8601 文字列は UTC とみなして "Z" を補完する。
 * - タイムゾーン指定済み、または日付のみ等それ以外の形式はそのまま解釈する。
 * - 空文字 / undefined / null は Invalid Date (NaN) を返す。
 *
 * @param value サーバーが返した日時文字列
 * @returns 変換後の Date (無効な入力の場合は Invalid Date)
 */
export const parseServerDate = (value?: string | null): Date => {
  if (!value) return new Date(NaN);

  const trimmed = value.trim();
  // "YYYY-MM-DDTHH:MM:SS" 形式でタイムゾーン指定が無い場合のみ UTC を補完する。
  const isDateTimeWithoutTz =
    /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}/.test(trimmed) && !hasTimezone(trimmed);

  return new Date(isDateTimeWithoutTz ? `${trimmed}Z` : trimmed);
};

/**
 * 2 つのサーバー日時文字列から経過ミリ秒を計算する。
 * どちらかが無効な場合は 0 を返す。
 */
export const durationMsBetween = (
  start?: string | null,
  end?: string | null,
): number => {
  const startMs = parseServerDate(start).getTime();
  const endMs = parseServerDate(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return 0;
  return endMs - startMs;
};
