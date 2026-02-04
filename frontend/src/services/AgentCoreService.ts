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
   */
  private async getAccessToken(): Promise<string> {
    try {
      await getCurrentUser();
      const authSession = await fetchAuthSession();

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
   */
  private async invokeAgentCoreRuntime<T>(
    runtimeArn: string,
    sessionId: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    // ARNをURLエンコード
    const encodedArn = encodeURIComponent(runtimeArn);
    // エンドポイント形式: /runtimes/{encodedArn}/invocations
    // 注意: qualifierパラメータは不要（エンドポイントが見つからないエラーの原因）
    const url = `${AGENTCORE_ENDPOINT}/runtimes/${encodedArn}/invocations`;

    console.log('AgentCore Runtime呼び出し:', {
      url,
      runtimeArn,
      sessionId,
    });

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
    language?: string
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
        goalStatuses: goalStatuses.map(status => ({
          goalId: status.goalId,
          progress: typeof status.progress === "number" ? status.progress : 0,
          achieved: Boolean(status.achieved),
          ...(status.achievedAt ? {
            achievedAt: status.achievedAt instanceof Date
              ? status.achievedAt.toISOString()
              : typeof status.achievedAt === "string"
                ? status.achievedAt
                : undefined
          } : {})
        }))
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
          convertedGoalStatuses = result.goalUpdates.map((update) => ({
            goalId: update.goalId,
            progress: update.achieved ? 100 : 0,
            achieved: update.achieved,
            reason: update.reason || '',
          }));
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
          ...(result.compliance ? { compliance: result.compliance } : {}),
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
