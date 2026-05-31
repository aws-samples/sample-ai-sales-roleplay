/**
 * AgentCore Runtime サービス
 * 
 * フロントエンドからAgentCore Runtimeを直接呼び出すサービス
 * JWT認証（Cognito）を使用してHTTPS直接リクエストを行う
 * 
 * 注意: JWT認証を使用する場合、AWS SDKではなくHTTPS直接リクエストを使用する必要がある
 * https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-oauth.html
 */
import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";
import type { Message, NPC, Goal, GoalStatus } from "../types/index";
import type { ComplianceCheck } from "../types/api";
import { transformComplianceCheck } from "../utils/apiTransformers";
import { mergeGoalStatus, serializeGoalStatus } from "../utils/goalUtils";

// 環境変数からAgentCore Runtime設定を取得
const AGENTCORE_ENABLED = import.meta.env.VITE_AGENTCORE_ENABLED === 'true';
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'us-west-2';

// AgentCore Runtime ARNs
// CDKデプロイ時: VITE_AGENTCORE_NPC_CONVERSATION_ARN / VITE_AGENTCORE_REALTIME_SCORING_ARN
// ローカル開発時: VITE_NPC_CONVERSATION_RUNTIME_ARN / VITE_REALTIME_SCORING_RUNTIME_ARN
const NPC_CONVERSATION_RUNTIME_ARN = import.meta.env.VITE_AGENTCORE_NPC_CONVERSATION_ARN || import.meta.env.VITE_NPC_CONVERSATION_RUNTIME_ARN || '';
const REALTIME_SCORING_RUNTIME_ARN = import.meta.env.VITE_AGENTCORE_REALTIME_SCORING_ARN || import.meta.env.VITE_REALTIME_SCORING_RUNTIME_ARN || '';

// AgentCore Data Plane エンドポイント
const AGENTCORE_ENDPOINT = `https://bedrock-agentcore.${AWS_REGION}.amazonaws.com`;

// アクセストークンの先回り更新しきい値（秒）
// AgentCoreは「あと1分以内に失効するトークン」を拒否するため、
// それより十分手前（2分）を切ったら更新し、長いペイロード送信中の失効も吸収する
const TOKEN_REFRESH_THRESHOLD_SEC = 120;

/**
 * AgentCore Runtimeが401（認証エラー）を返した場合に投げる専用エラー
 *
 * トークン失効・失効間近（"Ineffectual token, will expire within the next minute"）が
 * 主因のため、呼び出し元はこのエラーを検知してトークンを強制更新し、リトライ判定に使う。
 */
class AgentCoreUnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentCoreUnauthorizedError";
  }
}

/**
 * AgentCore Runtime サービスクラス
 * 
 * フロントエンドからAgentCore Runtimeを直接呼び出す
 * JWT認証（Cognito IDトークン）を使用
 */
export class AgentCoreService {
  private static instance: AgentCoreService;

  private constructor() { }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): AgentCoreService {
    if (!AgentCoreService.instance) {
      AgentCoreService.instance = new AgentCoreService();
    }
    return AgentCoreService.instance;
  }

  /**
   * Cognito Access Tokenを取得
   *
   * 注意: AgentCore RuntimeのJWT認証ではAccess Tokenを使用する
   * （ID Tokenではない）
   *
   * AgentCoreは「あと1分以内に失効するトークン」を予防的に拒否する
   * （401 "Ineffectual token, will expire within the next minute"）。
   * Amplifyの fetchAuthSession はトークンが完全失効するまでキャッシュを返すため、
   * 残り時間がしきい値（TOKEN_REFRESH_THRESHOLD_SEC）を下回る場合は
   * forceRefresh で先回り更新し、この隙間による401を防ぐ。
   *
   * @param forceRefresh trueの場合、残り時間に関わらずトークンを強制更新する
   *                     （401リトライ時に使用）
   */
  private async getAccessToken(forceRefresh = false): Promise<string> {
    try {
      await getCurrentUser();
      let authSession = await fetchAuthSession(
        forceRefresh ? { forceRefresh: true } : undefined,
      );

      // 強制更新でない場合は、失効が近ければ先回りで更新する
      if (!forceRefresh) {
        const expSec = authSession.tokens?.accessToken?.payload?.exp;
        if (typeof expSec === "number") {
          const remainingSec = expSec - Math.floor(Date.now() / 1000);
          if (remainingSec < TOKEN_REFRESH_THRESHOLD_SEC) {
            authSession = await fetchAuthSession({ forceRefresh: true });
          }
        }
      }

      if (!authSession.tokens?.accessToken) {
        throw new Error("Access Tokenが取得できません");
      }

      return authSession.tokens.accessToken.toString();
    } catch (error) {
      console.error("認証エラー:", error);
      throw new Error("ユーザーがログインしていません");
    }
  }

  /**
   * AgentCore Runtimeが利用可能かチェック
   */
  public isAvailable(): boolean {
    return AGENTCORE_ENABLED && !!NPC_CONVERSATION_RUNTIME_ARN && !!REALTIME_SCORING_RUNTIME_ARN;
  }

  /**
   * AgentCore Runtimeを直接呼び出す（HTTPS）
   * 
   * JWT認証を使用する場合、AWS SDKではなくHTTPS直接リクエストを使用
   * タイムアウト: 120秒（API Gatewayの29秒制限を回避）
   *
   * 401（トークン失効・失効間近）の場合は、トークンを強制更新して1回だけリトライする。
   * AgentCoreは残り1分以内のトークンを拒否するため、先回り更新（getAccessToken）を
   * すり抜けたケースの保険となる。
   */
  private async invokeAgentCoreRuntime<T>(
    runtimeArn: string,
    sessionId: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    // 1回目は通常取得（必要なら内部で先回り更新）
    const accessToken = await this.getAccessToken();

    try {
      return await this.sendAgentCoreRequest<T>(
        runtimeArn,
        sessionId,
        payload,
        accessToken,
      );
    } catch (error) {
      // 401（認証エラー）の場合のみ、トークンを強制更新して1回リトライ
      if (error instanceof AgentCoreUnauthorizedError) {
        console.warn(
          "AgentCore Runtime 401（トークン失効間近の可能性）。トークンを強制更新して再試行します。",
        );
        const refreshedToken = await this.getAccessToken(true);
        return await this.sendAgentCoreRequest<T>(
          runtimeArn,
          sessionId,
          payload,
          refreshedToken,
        );
      }
      throw error;
    }
  }

  /**
   * AgentCore Runtimeへ実際のHTTPSリクエストを送信する
   *
   * invokeAgentCoreRuntimeのリトライ機構から、トークンを差し替えて再利用できるよう
   * 単一リクエストの送信処理を切り出したもの。
   * 401を受け取った場合は AgentCoreUnauthorizedError を投げ、呼び出し元でリトライ判定する。
   */
  private async sendAgentCoreRequest<T>(
    runtimeArn: string,
    sessionId: string,
    payload: Record<string, unknown>,
    accessToken: string,
  ): Promise<T> {
    // ARNをURLエンコード
    const encodedArn = encodeURIComponent(runtimeArn);
    // エンドポイント形式: /runtimes/{encodedArn}/invocations
    // 注意: qualifierパラメータは不要（エンドポイントが見つからないエラーの原因）
    const url = `${AGENTCORE_ENDPOINT}/runtimes/${encodedArn}/invocations`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 120秒タイムアウト

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AgentCore Runtime エラー: ${response.status}`, errorText);
        // 401はトークン失効系のため、呼び出し元でのリトライ対象として専用エラーを投げる
        if (response.status === 401) {
          throw new AgentCoreUnauthorizedError(errorText);
        }
        throw new Error(`AgentCore Runtime呼び出しエラー: ${response.status} - ${errorText}`);
      }

      // ストリーミングレスポンスを処理
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream')) {
        // Server-Sent Events形式のストリーミングレスポンス
        return await this.processStreamingResponse<T>(response);
      } else {
        // 通常のJSONレスポンス
        // AgentCore Runtimeのレスポンスは {"output": {...}} 形式でラップされている
        const rawData = await response.json() as { output?: T } | T;

        // outputラッパーを解除
        const data = (rawData && typeof rawData === 'object' && 'output' in rawData && rawData.output)
          ? rawData.output
          : rawData as T;
        return data;
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('AgentCore Runtime呼び出しがタイムアウトしました（120秒）');
      }

      console.error('AgentCore Runtime呼び出しエラー:', error);
      throw error;
    }
  }

  /**
   * ストリーミングレスポンスを処理
   */
  private async processStreamingResponse<T>(response: Response): Promise<T> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('レスポンスボディが読み取れません');
    }

    const decoder = new TextDecoder();
    const chunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Server-Sent Events形式をパース
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            chunks.push(line.slice(6));
          } else if (line.trim() && !line.startsWith(':')) {
            chunks.push(line);
          }
        }
      }

      // 結合してJSONとしてパース
      const fullContent = chunks.join('');

      try {
        const rawData = JSON.parse(fullContent) as { output?: T } | T;
        // outputラッパーを解除
        const data = (rawData && typeof rawData === 'object' && 'output' in rawData && rawData.output)
          ? rawData.output
          : rawData as T;
        return data;
      } catch {
        // JSONパースに失敗した場合、メッセージとして返す
        return { message: fullContent } as T;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * NPC会話エージェントを呼び出す（直接呼び出し）
   * 
   * 注意: 会話履歴はAgentCore Memoryで管理されるため、previousMessagesは不要です。
   * Session Managerがセッションごとの会話履歴を自動的に復元・永続化します。
   */
  public async chatWithNPC(
    message: string,
    npc: NPC,
    _previousMessages: Message[], // AgentCore Memoryで管理されるため未使用（互換性のため残す）
    sessionId?: string,
    messageId?: string,
    emotionParams?: {
      angerLevel?: number;
      trustLevel?: number;
      progressLevel?: number;
    },
    scenarioId?: string,
    language?: string,
    presentedSlides?: Array<{ pageNumber: number; imageKey: string }>,
  ): Promise<{ response: string; sessionId: string; messageId: string }> {
    if (!this.isAvailable()) {
      throw new Error('AgentCore Runtimeが利用できません');
    }

    const currentSessionId = sessionId || crypto.randomUUID();
    const currentMessageId = messageId || crypto.randomUUID();

    // ユーザーIDを取得（AgentCore Memoryでのデータ分離用）
    let userId: string;
    try {
      const currentUser = await getCurrentUser();
      userId = currentUser.userId;
    } catch (error) {
      console.error('ユーザーID取得エラー:', error);
      throw new Error('ユーザーが認証されていません');
    }

    // 会話履歴はAgentCore Memoryで管理されるため、previousMessagesは送信しない
    const payload = {
      action: 'conversation',
      message,
      userId: userId, // ユーザーIDを追加（AgentCore MemoryのactorIdとして使用）
      npcInfo: {
        name: npc.name,
        role: npc.role,
        company: npc.company,
        personality: npc.personality,
        description: npc.description,
      },
      sessionId: currentSessionId,
      messageId: currentMessageId,
      ...(scenarioId ? { scenarioId } : {}),
      ...(emotionParams ? {
        emotionParams: {
          angerLevel: emotionParams.angerLevel || 1,
          trustLevel: emotionParams.trustLevel || 1,
          progressLevel: emotionParams.progressLevel || 1,
        },
      } : {}),
      ...(language ? { language } : {}),
      ...(presentedSlides && presentedSlides.length > 0 ? { presentedSlides } : {}),
    };

    try {
      const result = await this.invokeAgentCoreRuntime<{
        message?: string;
        response?: string;
        sessionId?: string;
        messageId?: string;
        error?: string;
      }>(NPC_CONVERSATION_RUNTIME_ARN, currentSessionId, payload);

      if (result.error) {
        throw new Error(result.error);
      }

      return {
        response: result.message || result.response || '',
        sessionId: result.sessionId || currentSessionId,
        messageId: result.messageId || currentMessageId,
      };
    } catch (error) {
      console.error("NPC会話エージェント呼び出しエラー:", error);
      return {
        response: "申し訳ありません、応答の生成中にエラーが発生しました。少し経ってからもう一度お試しください。",
        sessionId: currentSessionId,
        messageId: currentMessageId,
      };
    }
  }

  /**
   * リアルタイムスコアリングエージェントを呼び出す（直接呼び出し）
   * 
   * 注意: 会話履歴はAgentCore Memoryで管理されるため、previousMessagesは不要です。
   * エージェントがセッションIDを使ってMemoryから会話履歴を取得します。
   */
  public async getRealtimeEvaluation(
    message: string,
    _previousMessages: Message[], // AgentCore Memoryで管理されるため未使用（互換性のため残す）
    sessionId?: string,
    goalStatuses?: GoalStatus[],
    goals?: Goal[],
    scenarioId?: string,
    language?: string,
    currentScores?: {
      angerLevel: number;
      trustLevel: number;
      progressLevel: number;
    }
  ): Promise<{
    scores?: {
      angerLevel: number;
      trustLevel: number;
      progressLevel: number;
    };
    analysis?: string;
    goalStatuses?: GoalStatus[];
    compliance?: ComplianceCheck;
    npcEmotion?: string;
    npcEmotionIntensity?: number;
    gesture?: string;
  }> {
    if (!this.isAvailable()) {
      throw new Error('AgentCore Runtimeが利用できません');
    }

    const currentSessionId = sessionId || crypto.randomUUID();

    // ユーザーIDを取得（AgentCore Memoryでのデータ分離用）
    let userId: string;
    try {
      const currentUser = await getCurrentUser();
      userId = currentUser.userId;
    } catch (error) {
      console.error('ユーザーID取得エラー:', error);
      throw new Error('ユーザーが認証されていません');
    }

    // 会話履歴はAgentCore Memoryで管理されるため、previousMessagesは送信しない
    const payload = {
      action: 'scoring',
      message,
      userId: userId, // ユーザーIDを追加（AgentCore MemoryのactorIdとして使用）
      // 現在のスコアを含める（エージェントが差分を計算するため）
      currentScores: currentScores || {
        angerLevel: 1,
        trustLevel: 1,
        progressLevel: 1,
      },
      sessionId: currentSessionId,
      ...(goalStatuses ? {
        goalStatuses: goalStatuses.map(status => serializeGoalStatus(status))
      } : {}),
      ...(goals ? {
        goals: goals.map(goal => ({
          id: goal.id,
          description: goal.description || "",
          priority: typeof goal.priority === "number" ? goal.priority : 3,
          criteria: Array.isArray(goal.criteria) ? goal.criteria : [],
          isRequired: Boolean(goal.isRequired)
        }))
      } : {}),
      ...(scenarioId ? { scenarioId } : {}),
      ...(language ? { language } : {}),
    };

    try {
      // AgentCore Runtimeレスポンス形式:
      // {
      //   success: boolean,
      //   scores: { angerLevel, trustLevel, progressLevel },
      //   analysis: string,
      //   goalUpdates: [{ goalId, achieved, reason }],
      //   sessionId: string,
      //   memoryEnabled: boolean
      // }
      const result = await this.invokeAgentCoreRuntime<{
        success?: boolean;
        scores?: {
          angerLevel: number;
          trustLevel: number;
          progressLevel: number;
        };
        analysis?: string;
        goalUpdates?: Array<{
          goalId: string;
          achieved: boolean;
          reason?: string;
        }>;
        compliance?: ComplianceCheck;
        npcEmotion?: string;
        npcEmotionIntensity?: number;
        gesture?: string;
        sessionId?: string;
        memoryEnabled?: boolean;
        error?: string;
      }>(REALTIME_SCORING_RUNTIME_ARN, currentSessionId, payload);

      if (result.error) {
        throw new Error(result.error);
      }

      if (result.success !== false) {
        // goalUpdatesをgoalStatusesに変換（AgentCore Runtime形式: { goalId, achieved, reason }）
        let convertedGoalStatuses: GoalStatus[] | undefined;
        if (result.goalUpdates && Array.isArray(result.goalUpdates)) {
          // goalStatusesから現在のprogressを参照し、共通関数でマージする
          const currentStatusMap = new Map(
            (goalStatuses || []).map(s => [s.goalId, s])
          );
          convertedGoalStatuses = result.goalUpdates.map((update) => {
            const currentStatus = currentStatusMap.get(update.goalId);
            const updateStatus: GoalStatus = {
              goalId: update.goalId,
              progress: update.achieved ? 100 : 0,
              achieved: update.achieved,
              reason: update.reason || '',
            };
            if (currentStatus) {
              return mergeGoalStatus(currentStatus, updateStatus);
            }
            return updateStatus;
          });
        }

        return {
          scores: result.scores ? {
            angerLevel: result.scores.angerLevel || 1,
            trustLevel: result.scores.trustLevel || 1,
            progressLevel: result.scores.progressLevel || 1,
          } : {
            angerLevel: 1,
            trustLevel: 1,
            progressLevel: 1,
          },
          analysis: result.analysis || "",
          goalStatuses: convertedGoalStatuses,
          ...(result.compliance ? { compliance: transformComplianceCheck(result.compliance) } : {}),
          npcEmotion: result.npcEmotion || 'neutral',
          npcEmotionIntensity: result.npcEmotionIntensity ?? 0.5,
          gesture: result.gesture || 'none',
        };
      }

      return {
        scores: { angerLevel: 1, trustLevel: 1, progressLevel: 1 },
        analysis: "",
        compliance: undefined,
      };
    } catch (error) {
      console.error("リアルタイムスコアリングエージェント呼び出しエラー:", error);
      return {
        scores: { angerLevel: 1, trustLevel: 1, progressLevel: 1 },
        analysis: "",
        compliance: undefined,
      };
    }
  }
}
