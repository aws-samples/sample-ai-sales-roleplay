/**
 * ビルド環境の判定ユーティリティ。
 *
 * `import.meta` は ESM 専用の構文であり、CommonJS で実行される Jest から
 * 直接参照するコンポーネントはテスト時にパースエラーになる。
 * 参照箇所をこのモジュールに集約することで、テストでは
 * `jest.mock("../../utils/env", ...)` によって差し替えられるようにしている。
 */
export const isDevEnvironment = (): boolean => Boolean(import.meta.env?.DEV);
