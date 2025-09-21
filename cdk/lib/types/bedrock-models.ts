/** Bedrockモデル設定 */
export interface BedrockModelsConfig {
  /** 会話生成用モデル */
  conversation: string;
  /** リアルタイムスコアリング用モデル */
  scoring: string;
  /** フィードバック生成用モデル */
  feedback: string;
  /** Guardrail評価用モデル */
  guardrail: string;
  /** 動画分析用モデル */
  video: string;
  /** リファレンスチェック用モデル */
  referenceCheck: string;
}
