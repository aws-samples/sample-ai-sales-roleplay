// aws-amplifyモジュールとユーティリティのインポートを集約（動的インポートをすべて静的インポートに変換）
import { post, get, put, del } from "aws-amplify/api";
import { getCurrentUser, fetchAuthSession, signOut } from "aws-amplify/auth";
import type { Message, Metrics, NPC, Goal, GoalStatus } from "../types/index";
import type {
  FeedbackAnalysisResult,
  SessionInfo,
  ScenarioInfo,
  SessionListResponse,
  MessageListResponse,
  ScenarioListResponse,
  RankingResponse,
  ComplianceCheck,
  ScenarioExportData,
  ImportResponse,
  SessionCompleteDataResponse,
} from "../types/api";
import { AgentCoreService } from "./AgentCoreService";
import { serializeGoalStatus } from "../utils/goalUtils";
import {
  transformImportResponse,
  transformVideoAnalysisResult,
  transformComplianceViolation,
} from "../utils/apiTransformers";

/**
 * API通信サービス - Amazon Bedrockとの通信を処理
 */
export class ApiService {
  private static instance: ApiService;

  private constructor() { }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * 認証トークンを取得する
   * @returns 認証ヘッダーを含むオブジェクト
   * @throws Error - 認証エラー時
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      // 認証状態を確認
      await getCurrentUser();

      // 認証セッション情報を取得
      const authSession = await fetchAuthSession();

      // 認証ヘッダーを作成
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authSession.tokens?.idToken) {
        authHeaders["Authorization"] = authSession.tokens.idToken.toString();

        // トークンのaud（Audience）クレームを確認
        const payload = authSession.tokens.idToken.payload;
        const expectedClientId = import.meta.env
          .VITE_COGNITO_USER_POOL_CLIENT_ID;

        if (payload.aud !== expectedClientId) {
          console.warn(
            "⚠️ トークンのClient IDが一致しません。再ログインが必要です。",
          );
          await signOut();
          throw new Error(
            "設定が更新されました。ページをリロードして再度ログインしてください。",
          );
        }
      }

      return authHeaders;
    } catch (error) {
      console.error("認証エラー:", error);
      throw new Error(
        "ユーザーがログインしていません。ログインしてから再度お試しください。",
      );
    }
  }

  /**
   * API GETリクエストを実行
   * @param path APIパス
   * @param queryParams クエリパラメータ
   * @returns レスポンス
   */
  private async apiGet<T>(
    path: string,
    queryParams?: Record<string, string | number>,
  ): Promise<T> {
    try {
      // 認証ヘッダーを取得
      const headers = await this.getAuthHeaders();

      // クエリパラメータ文字列を構築
      let queryString = "";
      if (queryParams) {
        const params = new URLSearchParams();
        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined) {
            params.append(key, String(value));
          }
        });
        queryString = params.toString();
      }

      // パスを構築（クエリ文字列付き）
      const fullPath = queryString ? `${path}?${queryString}` : path;

      // API呼び出し
      const restOperation = get({
        apiName: "AISalesRoleplayAPI",
        path: fullPath,
        options: {
          headers,
        },
      });

      // レスポンスを処理
      const response = await restOperation.response;
      const responseBody = await response.body.text();
      const data = JSON.parse(responseBody) as T;

      return data;
    } catch (error) {
      console.error(`API GET エラー (${path}):`, error);
      throw error;
    }
  }

  /**
   * API POSTリクエストを実行
   * @param path APIパス
   * @param requestBody リクエストボディ
   * @returns レスポンス
   */
  private async apiPost<T, R = unknown>(
    path: string,
    requestBody: R,
  ): Promise<T> {
    try {
      // 認証ヘッダーを取得
      const headers = await this.getAuthHeaders();

      // API呼び出し
      const restOperation = post({
        apiName: "AISalesRoleplayAPI",
        path: path,
        options: {
          body: requestBody as never,
          headers: headers,
        },
      });

      // レスポンスを処理
      const response = await restOperation.response;
      const responseBody = await response.body.text();
      const data = JSON.parse(responseBody) as T;

      return data;
    } catch (error) {
      console.error(`API POST エラー (${path}):`, error);
      throw error;
    }
  }

  /**
   * API PUTリクエストを実行
   * @param path APIパス
   * @param requestBody リクエストボディ
   * @returns レスポンス
   */
  private async apiPut<T, R = unknown>(
    path: string,
    requestBody: R,
  ): Promise<T> {
    try {
      // 認証ヘッダーを取得
      const headers = await this.getAuthHeaders();

      // API呼び出し（PUTメソッドを使用）
      const restOperation = put({
        apiName: "AISalesRoleplayAPI",
        path: path,
        options: {
          body: requestBody as never,
          headers: headers,
        },
      });

      // レスポンスを処理
      const response = await restOperation.response;
      const responseBody = await response.body.text();
      const data = JSON.parse(responseBody) as T;

      return data;
    } catch (error) {
      console.error(`API PUT エラー (${path}):`, error);
      throw error;
    }
  }

  /**
   * API DELETEリクエストを実行
   * @param path APIパス
   * @returns レスポンス
   */
  private async apiDelete<T>(path: string): Promise<T> {
    try {
      // 認証ヘッダーを取得
      const headers = await this.getAuthHeaders();

      // API呼び出し（DELETEメソッドを使用）
      const restOperation = del({
        apiName: "AISalesRoleplayAPI",
        path: path,
        options: {
          headers: headers,
        },
      });

      // レスポンスを処理
      await restOperation.response;

      return "success" as T;
    } catch (error) {
      console.error(`API DELETE エラー (${path}):`, error);
      throw error;
    }
  }

  /**
   * セッションを作成または更新する
   * 
   * AgentCore Runtime経由で会話する場合、セッションをDynamoDBに保存するために使用
   * 
   * @param sessionId セッションID
   * @param scenarioId シナリオID
   * @param title セッションタイトル（オプション）
   * @param npcInfo NPC情報（オプション）
   * @returns 作成結果
   */
  public async createOrUpdateSession(
    sessionId: string,
    scenarioId: string,
    title?: string,
    npcInfo?: {
      name: string;
      role: string;
      company: string;
      personality?: string[];
      description?: string;
    }
  ): Promise<{ success: boolean; sessionId: string; isNew: boolean }> {
    try {
      const requestBody: Record<string, unknown> = {
        sessionId,
        scenarioId,
      };

      if (title) {
        requestBody.title = title;
      }

      if (npcInfo) {
        requestBody.npcInfo = npcInfo;
      }

      const response = await this.apiPost<{
        success: boolean;
        sessionId: string;
        message: string;
        isNew: boolean;
      }>("/sessions", requestBody);

      return {
        success: response.success,
        sessionId: response.sessionId,
        isNew: response.isNew,
      };
    } catch (error) {
      console.error("セッション作成/更新エラー:", error);
      // エラーが発生しても会話は続行できるようにする
      return {
        success: false,
        sessionId,
        isNew: false,
      };
    }
  }

  /**
   * NPCと会話する
   *
   * AgentCore Runtimeを使用してNPCとの会話を行います。
   * 会話履歴はAgentCore Memoryで管理されます。
   *
   * @param message ユーザーメッセージ
   * @param npc NPCの情報
   * @param previousMessages 過去のメッセージ履歴（AgentCore Memoryで管理されるため未使用）
   * @param sessionId セッションID
   * @param messageId メッセージID
   * @param emotionParams 感情パラメータ（怒りレベル、信頼レベル、進捗レベル）
   * @param scenarioId シナリオID
   * @param language 言語設定（"ja", "en"など）
   * @returns NPCの応答
   */
  public async chatWithNPC(
    message: string,
    npc: NPC,
    previousMessages: Message[],
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
    try {
      // AgentCore Runtimeを使用（会話履歴はAgentCore Memoryで管理）
      const agentCoreService = AgentCoreService.getInstance();
      if (!agentCoreService.isAvailable()) {
        throw new Error("AgentCore Runtimeが利用できません。環境設定を確認してください。");
      }

      return await agentCoreService.chatWithNPC(
        message,
        npc,
        previousMessages,
        sessionId,
        messageId,
        emotionParams,
        scenarioId,
        language,
        presentedSlides,
      );
    } catch (error: unknown) {
      console.error("NPCとの会話中にエラーが発生:", error);
      // エラー時のフォールバック応答
      return {
        response:
          "申し訳ありません、応答の生成中にエラーが発生しました。少し経ってからもう一度お試しください。",
        sessionId: sessionId || "",
        messageId: messageId || "",
      };
    }
  }

  /**
   * リアルタイム評価を取得する
   *
   * AgentCore Runtimeを使用してユーザーの発言をリアルタイムで評価し、
   * メトリクスとゴール達成状況を更新します。
   * 会話履歴はAgentCore Memoryで管理されます。
   *
   * @param message ユーザーメッセージ
   * @param previousMessages 過去のメッセージ履歴（AgentCore Memoryで管理されるため未使用）
   * @param sessionId セッションID
   * @param goalStatuses 現在のゴール達成状況（オプション）
   * @param goals シナリオのゴール定義（オプション）
   * @param scenarioId シナリオID（コンプライアンスチェック用）
   * @param language 言語設定（オプション）
   * @param currentScores 現在のスコア（オプション）
   * @returns メトリクスとゴール状態を含むオブジェクト
   */
  public async getRealtimeEvaluation(
    message: string,
    previousMessages: Message[],
    sessionId?: string,
    goalStatuses?: GoalStatus[],
    goals?: Goal[],
    scenarioId?: string,
    language?: string,
    currentScores?: {
      angerLevel: number;
      trustLevel: number;
      progressLevel: number;
    },
    scenarioDescription?: string,
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
    suggestions?: string[];
  }> {
    try {
      // AgentCore Runtimeを使用（会話履歴はAgentCore Memoryで管理）
      const agentCoreService = AgentCoreService.getInstance();
      if (!agentCoreService.isAvailable()) {
        throw new Error("AgentCore Runtimeが利用できません。環境設定を確認してください。");
      }

      return await agentCoreService.getRealtimeEvaluation(
        message,
        previousMessages,
        sessionId,
        goalStatuses,
        goals,
        scenarioId,
        language,
        currentScores,
        scenarioDescription,
      );
    } catch (error) {
      console.error("リアルタイム評価API呼び出しエラー:", error);

      // エラーの詳細をログに出力
      if (error instanceof Error) {
        console.error("エラーメッセージ:", error.message);
        console.error("スタックトレース:", error.stack);
      } else {
        console.error("不明なエラータイプ:", typeof error);
      }

      // エラー時はデフォルトの結果を返す
      return {
        scores: {
          angerLevel: 1,
          trustLevel: 1,
          progressLevel: 1,
        },
        analysis: "",
        compliance: undefined,
      };
    }
  }

  /**
   * セッション一覧を取得する
   * @param limit 取得する最大件数
   * @param nextToken 次ページのトークン
   * @param scenarioId シナリオIDによるフィルタリング
   * @returns セッション一覧レスポンス
   */
  public async getSessions(
    limit?: number,
    nextToken?: string,
    scenarioId?: string,
  ): Promise<SessionListResponse> {
    try {
      // クエリパラメータの作成
      const queryParams: Record<string, string | number> = {};

      if (limit !== undefined) {
        queryParams.limit = limit;
      }
      if (nextToken !== undefined) {
        queryParams.nextToken = nextToken;
      }
      if (scenarioId !== undefined) {
        queryParams.scenarioId = scenarioId;
      }

      // API呼び出し
      return await this.apiGet<SessionListResponse>("/sessions", queryParams);
    } catch (error) {
      console.error("セッション一覧の取得に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(`セッション一覧の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("セッション一覧の取得に失敗しました");
      }
    }
  }

  /**
   * セッション詳細を取得する
   * @param sessionId セッションID
   * @returns セッション詳細情報
   */
  public async getSessionDetail(sessionId: string): Promise<SessionInfo> {
    try {
      // API呼び出し
      return await this.apiGet<SessionInfo>(`/sessions/${sessionId}`);
    } catch (error) {
      console.error(
        `セッション詳細の取得に失敗しました (${sessionId}):`,
        error,
      );

      if (error instanceof Error) {
        throw new Error(`セッション詳細の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("セッション詳細の取得に失敗しました");
      }
    }
  }

  /**
   * セッションメッセージ履歴を取得する
   * @param sessionId セッションID
   * @param limit 取得する最大件数
   * @param nextToken 次ページのトークン
   * @returns メッセージ履歴レスポンス
   */
  public async getSessionMessages(
    sessionId: string,
    limit?: number,
    nextToken?: string,
  ): Promise<MessageListResponse> {
    try {
      // クエリパラメータの作成
      const queryParams: Record<string, string | number> = {};

      if (limit !== undefined) {
        queryParams.limit = limit;
      }
      if (nextToken !== undefined) {
        queryParams.nextToken = nextToken;
      }

      // API呼び出し
      return await this.apiGet<MessageListResponse>(
        `/sessions/${sessionId}/messages`,
        queryParams,
      );
    } catch (error) {
      console.error(
        `メッセージ履歴の取得に失敗しました (${sessionId}):`,
        error,
      );

      if (error instanceof Error) {
        throw new Error(`メッセージ履歴の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("メッセージ履歴の取得に失敗しました");
      }
    }
  }

  /**
   * シナリオ一覧を取得する
   * @param category カテゴリでフィルタ
   * @param difficulty 難易度でフィルタ
   * @param limit 取得する最大件数
   * @param nextToken 次ページのトークン
   * @returns シナリオ一覧レスポンス
   */
  public async getScenarios(
    category?: string,
    difficulty?: string,
    limit?: number,
    nextToken?: string,
  ): Promise<ScenarioListResponse> {
    try {
      // クエリパラメータの作成
      const queryParams: Record<string, string | number> = {};

      if (category !== undefined) {
        queryParams.category = category;
      }
      if (difficulty !== undefined) {
        queryParams.difficulty = difficulty;
      }
      if (limit !== undefined) {
        queryParams.limit = limit;
      }
      if (nextToken !== undefined) {
        queryParams.nextToken = nextToken;
      }

      // API呼び出し
      return await this.apiGet<ScenarioListResponse>("/scenarios", queryParams);
    } catch (error) {
      console.error("シナリオ一覧の取得に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(`シナリオ一覧の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("シナリオ一覧の取得に失敗しました");
      }
    }
  }

  /**
   * シナリオ詳細を取得する
   * @param scenarioId シナリオID
   * @returns シナリオ詳細情報
   */
  public async getScenarioDetail(scenarioId: string): Promise<ScenarioInfo> {
    try {
      // API呼び出し
      return await this.apiGet<ScenarioInfo>(`/scenarios/${scenarioId}`);
    } catch (error) {
      console.error(`シナリオ詳細の取得に失敗しました (${scenarioId}):`, error);

      if (error instanceof Error) {
        throw new Error(`シナリオ詳細の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("シナリオ詳細の取得に失敗しました");
      }
    }
  }

  /**
   * ファイルアップロード用の署名付きURLを取得（汎用）
   *
   * @param scenarioId シナリオID
   * @param fileName ファイル名
   * @param contentType MIMEタイプ
   * @returns 署名付きURL情報
   */
  private async getFileUploadUrl(
    scenarioId: string,
    fileName: string,
    contentType: string,
  ): Promise<{
    uploadUrl: string;
    formData: Record<string, string>;
    key: string;
    fileName: string;
    contentType: string;
  }> {
    try {
      const response = await this.apiPost<{
        uploadUrl: string;
        formData: Record<string, string>;
        key: string;
        fileName: string;
        contentType: string;
      }>(`/scenarios/${scenarioId}/pdf-upload-url`, {
        fileName,
        contentType,
      });

      return response;
    } catch (error) {
      console.error("ファイルアップロード用URLの取得に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(
          `ファイルアップロード用URLの取得に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("ファイルアップロード用URLの取得に失敗しました");
      }
    }
  }

  /**
   * ファイルをアップロード（汎用）
   *
   * @param uploadUrl S3エンドポイントURL
   * @param formData POSTリクエスト用のフォームデータ
   * @param content アップロードするコンテンツ（FileまたはBlob）
   * @param contentType ファイルのMIMEタイプ
   * @returns アップロード結果
   */
  private async uploadFile(
    uploadUrl: string,
    formData: Record<string, string>,
    content: File | Blob | string,
    contentType: string,
  ): Promise<void> {
    try {
      // FormDataオブジェクトを作成
      const formDataObj = new FormData();

      // 署名付きフォームデータのフィールドを追加
      Object.entries(formData).forEach(([key, value]) => {
        formDataObj.append(key, value);
      });

      // ファイルを最後に追加（S3の要求に従い、fileフィールドは最後）
      if (typeof content === "string") {
        // 文字列の場合はBlobに変換してからアップロード
        const blob = new Blob([content], { type: contentType });
        formDataObj.append("file", blob);
      } else {
        // File/Blobオブジェクトをそのまま追加
        formDataObj.append("file", content);
      }

      // POSTメソッドでフォームデータを送信（プリフライトリクエスト回避）
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formDataObj,
        // Content-Typeヘッダーは設定しない（FormDataが自動的に適切な値を設定）
        // これによりプリフライトリクエストを完全に回避
      });

      // レスポンスのステータスをチェック
      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => "レスポンス読み取りエラー");
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}. ${errorText}`,
        );
      }
    } catch (error) {
      console.error("ファイルのアップロードに失敗しました:", error);

      if (error instanceof Error) {
        // CORSエラーの場合は、より分かりやすいエラーメッセージを提供
        if (
          error.message.includes("CORS") ||
          error.message.includes("Access-Control")
        ) {
          throw new Error(
            "ファイルのアップロードでCORSエラーが発生しました。S3フォームアップロード処理でエラーが発生している可能性があります。",
          );
        }
        throw new Error(
          `ファイルのアップロードに失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("ファイルのアップロードに失敗しました");
      }
    }
  }

  /**
   * PDF資料アップロード用の署名付きURLを取得
   *
   * @param scenarioId シナリオID
   * @param fileName ファイル名
   * @param contentType MIMEタイプ
   * @returns 署名付きURL情報
   */
  public async getPdfUploadUrl(
    scenarioId: string,
    fileName: string,
    contentType: string,
  ): Promise<{
    uploadUrl: string;
    formData: Record<string, string>;
    key: string;
    fileName: string;
    contentType: string;
  }> {
    return this.getFileUploadUrl(scenarioId, fileName, contentType);
  }

  /**
   * PDFファイルをアップロード
   *
   * @param uploadUrl 署名付きアップロードURL
   * @param file アップロードするファイル
   * @param contentType ファイルのMIMEタイプ
   * @returns アップロード結果
   */
  public async uploadPdfFile(
    uploadUrl: string,
    formData: Record<string, string>,
    file: File,
    contentType: string,
  ): Promise<void> {
    return this.uploadFile(uploadUrl, formData, file, contentType);
  }

  /**
   * PDFメタデータファイル用の署名付きURLを取得
   *
   * @param scenarioId シナリオID
   * @param fileName メタデータファイル名（例: filename.metadata.json）
   * @returns 署名付きURL情報
   */
  public async getPdfMetadataUploadUrl(
    scenarioId: string,
    fileName: string,
  ): Promise<{
    uploadUrl: string;
    formData: Record<string, string>;
    key: string;
    fileName: string;
    contentType: string;
  }> {
    return this.getFileUploadUrl(scenarioId, fileName, "application/json");
  }

  /**
   * PDFメタデータファイルをアップロード
   *
   * @param uploadUrl 署名付きアップロードURL
   * @param metadataContent メタデータのJSONコンテンツ
   * @returns アップロード結果
   */
  public async uploadPdfMetadata(
    uploadUrl: string,
    formData: Record<string, string>,
    metadataContent: object,
  ): Promise<void> {
    return this.uploadFile(
      uploadUrl,
      formData,
      JSON.stringify(metadataContent),
      "application/json",
    );
  }

  /**
   * PDFファイルとメタデータファイルを削除
   *
   * @param scenarioId シナリオID
   * @param fileName PDFファイル名
   * @returns 削除結果
   */
  public async deletePdfWithMetadata(
    scenarioId: string,
    fileName: string,
  ): Promise<{
    success: boolean;
    deletedFiles: string[];
    errors?: string[];
  }> {
    try {
      // 削除するファイルのリスト
      const filesToDelete = [
        fileName, // PDFファイル
        `${fileName}.metadata.json`, // メタデータファイル
      ];

      const deletedFiles: string[] = [];
      const errors: string[] = [];

      // 各ファイルを削除
      for (const fileToDelete of filesToDelete) {
        try {
          await this.apiDelete<{ message: string }>(
            `/scenarios/${scenarioId}/files/${encodeURIComponent(fileToDelete)}`,
          );
          deletedFiles.push(fileToDelete);
        } catch (error) {
          console.error(`ファイル削除エラー (${fileToDelete}):`, error);
          errors.push(
            `${fileToDelete}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      return {
        success: deletedFiles.length > 0,
        deletedFiles,
        ...(errors.length > 0 ? { errors } : {}),
      };
    } catch (error) {
      console.error(
        "PDFファイルとメタデータファイルの削除に失敗しました:",
        error,
      );

      if (error instanceof Error) {
        throw new Error(
          `PDFファイルとメタデータファイルの削除に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("PDFファイルとメタデータファイルの削除に失敗しました");
      }
    }
  }

  // ========================================
  // 提案資料（プレゼンテーション）関連メソッド
  // ========================================

  /**
   * 提案資料PDFアップロード用の署名付きURLを取得
   */
  public async getPresentationUploadUrl(
    scenarioId: string,
    fileName: string,
    contentType: string,
  ): Promise<{
    uploadUrl: string;
    formData: Record<string, string>;
    key: string;
    fileName: string;
    contentType: string;
  }> {
    try {
      return await this.apiPost<
        {
          uploadUrl: string;
          formData: Record<string, string>;
          key: string;
          fileName: string;
          contentType: string;
        },
        { fileName: string; contentType: string }
      >(`/scenarios/${scenarioId}/presentation-upload-url`, {
        fileName,
        contentType,
      });
    } catch (error) {
      console.error("提案資料アップロードURL取得エラー:", error);
      throw new Error("提案資料のアップロードURLの取得に失敗しました");
    }
  }

  /**
   * 提案資料PDFをアップロード
   */
  public async uploadPresentationFile(
    uploadUrl: string,
    formData: Record<string, string>,
    file: File,
  ): Promise<void> {
    return this.uploadFile(uploadUrl, formData, file, "application/pdf");
  }

  /**
   * 提案資料を削除
   */
  public async deletePresentationFile(
    scenarioId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.apiDelete<{ success: boolean; message: string }>(
        `/scenarios/${scenarioId}/presentation`,
      );
    } catch (error) {
      console.error("提案資料削除エラー:", error);
      throw new Error("提案資料の削除に失敗しました");
    }
  }

  /**
   * スライド画像一覧を取得（署名付きURL付き）
   */
  public async getSlideImages(
    scenarioId: string,
  ): Promise<{
    success: boolean;
    scenarioId: string;
    status: string;
    totalPages: number;
    slides: Array<{
      pageNumber: number;
      imageKey: string;
      imageUrl: string;
      thumbnailUrl?: string;
    }>;
  }> {
    try {
      return await this.apiGet(`/scenarios/${scenarioId}/slides`);
    } catch (error) {
      console.error("スライド画像一覧取得エラー:", error);
      throw new Error("スライド画像の取得に失敗しました");
    }
  }

  /**
   * PDF→スライド画像変換をトリガー
   */
  public async triggerSlideConversion(
    scenarioId: string,
    pdfKey: string,
    fileName: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      return await this.apiPost<
        { success: boolean; message: string },
        { pdfKey: string; fileName: string }
      >(`/scenarios/${scenarioId}/convert-slides`, { pdfKey, fileName });
    } catch (error) {
      console.error("スライド変換トリガーエラー:", error);
      throw new Error("スライド変換の開始に失敗しました");
    }
  }

  /**
   * 単一シナリオをエクスポートする
   * @param scenarioId エクスポートするシナリオID
   * @returns シナリオデータのJSONオブジェクト
   */
  public async exportScenario(scenarioId: string): Promise<ScenarioExportData> {
    try {
      // API呼び出し
      return await this.apiGet<ScenarioExportData>(
        `/scenarios/${scenarioId}/export`,
      );
    } catch (error) {
      console.error("シナリオのエクスポートに失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(
          `シナリオのエクスポートに失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("シナリオのエクスポートに失敗しました");
      }
    }
  }

  /**
   * シナリオをインポートする
   * @param scenarioData インポートするシナリオデータ (npcsとscenariosを含むオブジェクト)
   * @returns インポート結果のレスポンス
   */
  public async importScenarios(
    scenarioData: ScenarioExportData,
  ): Promise<ImportResponse> {
    try {
      // API呼び出し
      const rawResponse = await this.apiPost<ImportResponse>(
        "/scenarios/import",
        scenarioData,
      );
      // バックエンドのsnake_caseレスポンスをcamelCaseに変換
      return transformImportResponse(rawResponse);
    } catch (error) {
      console.error("シナリオのインポートに失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(`シナリオのインポートに失敗しました: ${error.message}`);
      } else {
        throw new Error("シナリオのインポートに失敗しました");
      }
    }
  }

  /**
   * シナリオを作成する
   * @param scenarioData 作成するシナリオデータ
   * @returns 作成されたシナリオ情報
   */
  public async createScenario(
    scenarioData: Partial<ScenarioInfo>,
  ): Promise<{ scenarioId: string; scenario: ScenarioInfo }> {
    try {
      // API呼び出し
      const response = await this.apiPost<{
        message: string;
        scenarioId: string;
        scenario: ScenarioInfo;
      }>("/scenarios", scenarioData);

      return {
        scenarioId: response.scenarioId,
        scenario: response.scenario,
      };
    } catch (error) {
      console.error("シナリオ作成に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(`シナリオ作成に失敗しました: ${error.message}`);
      } else {
        throw new Error("シナリオ作成に失敗しました");
      }
    }
  }

  /**
   * シナリオを更新する
   * @param scenarioId 更新対象のシナリオID
   * @param scenarioData 更新するシナリオデータ
   * @returns 更新されたシナリオ情報
   */
  public async updateScenario(
    scenarioId: string,
    scenarioData: Partial<ScenarioInfo>,
  ): Promise<{ scenario: ScenarioInfo }> {
    try {
      // API呼び出し
      const response = await this.apiPut<{
        message: string;
        scenario: ScenarioInfo;
      }>(`/scenarios/${scenarioId}`, scenarioData);

      return {
        scenario: response.scenario,
      };
    } catch (error) {
      console.error(`シナリオ更新に失敗しました (${scenarioId}):`, error);

      if (error instanceof Error) {
        throw new Error(`シナリオ更新に失敗しました: ${error.message}`);
      } else {
        throw new Error("シナリオ更新に失敗しました");
      }
    }
  }

  /**
   * シナリオを削除する
   * @param scenarioId 削除するシナリオID
   * @returns 削除結果
   */
  public async deleteScenario(
    scenarioId: string,
  ): Promise<{ message: string; scenarioId: string }> {
    try {
      // API呼び出し
      return await this.apiDelete<{ message: string; scenarioId: string }>(
        `/scenarios/${scenarioId}`,
      );
    } catch (error) {
      console.error(`シナリオ削除に失敗しました (${scenarioId}):`, error);

      if (error instanceof Error) {
        throw new Error(`シナリオ削除に失敗しました: ${error.message}`);
      } else {
        throw new Error("シナリオ削除に失敗しました");
      }
    }
  }

  /**
   * シナリオの共有設定を更新する
   * @param scenarioId 対象のシナリオID
   * @param visibility 公開範囲設定
   * @param sharedWithUsers 共有先ユーザーIDリスト
   * @returns 更新結果
   */
  public async updateScenarioSharing(
    scenarioId: string,
    visibility: "public" | "private" | "shared",
    sharedWithUsers?: string[],
  ): Promise<{
    message: string;
    visibility: string;
    sharedWithUsers: string[];
  }> {
    try {
      // リクエストデータ作成
      const requestData: {
        visibility: "public" | "private" | "shared";
        sharedWithUsers?: string[];
      } = { visibility };

      // 共有設定の場合は共有先ユーザーリストを追加
      if (
        visibility === "shared" &&
        sharedWithUsers &&
        sharedWithUsers.length > 0
      ) {
        requestData.sharedWithUsers = sharedWithUsers;
      }

      // API呼び出し
      return await this.apiPost<{
        message: string;
        visibility: "public" | "private" | "shared";
        sharedWithUsers: string[];
      }>(`/scenarios/${scenarioId}/share`, requestData);
    } catch (error) {
      console.error(
        `シナリオの共有設定更新に失敗しました (${scenarioId}):`,
        error,
      );

      if (error instanceof Error) {
        throw new Error(
          `シナリオの共有設定更新に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("シナリオの共有設定更新に失敗しました");
      }
    }
  }

  /**
   * 利用可能なGuardrailsの一覧を取得する
   * @returns Guardrailsリスト
   */
  public async getGuardrails(): Promise<
    Array<{
      arn: string;
      id: string;
      name: string;
      description: string;
    }>
  > {
    try {
      // API呼び出し
      const response = await this.apiGet<{
        guardrails: Array<{
          arn: string;
          id: string;
          name: string;
          description: string;
        }>;
      }>("/guardrails");

      return response.guardrails;
    } catch (error) {
      console.error("Guardrails一覧の取得に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(`Guardrails一覧の取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("Guardrails一覧の取得に失敗しました");
      }
    }
  }

  /**
   * セッションフィードバックを取得する
   *
   * 保存済みのフィードバック分析データを取得します。
   * セッション結果画面で使用されるフィードバックデータをDynamoDBから取得します。
   *
   * @param sessionId セッションID
   * @returns フィードバック分析結果
   * @throws Error - API呼び出し失敗時やフィードバックが見つからない時
   */
  public async getSessionFeedback(sessionId: string): Promise<{
    feedback: FeedbackAnalysisResult;
    createdAt: string;
    finalMetrics: Metrics;
    messageCount: number;
    goalResults?: {
      goalStatuses: GoalStatus[];
      scenarioGoals: Goal[];
      goalScore: number;
    };
  }> {
    try {
      // API呼び出し
      const response = await this.apiGet<{
        success: boolean;
        sessionId: string;
        feedback: FeedbackAnalysisResult;
        createdAt: string;
        finalMetrics: Metrics;
        messageCount: number;
        goalResults?: {
          goalStatuses: GoalStatus[];
          scenarioGoals: Goal[];
          goalScore: number;
        };
      }>(`/sessions/${sessionId}/feedback`);

      if (response.success && response.feedback) {
        const result = {
          feedback: response.feedback,
          createdAt: response.createdAt,
          finalMetrics: response.finalMetrics,
          messageCount: response.messageCount,
          ...(response.goalResults
            ? { goalResults: response.goalResults }
            : {}),
        };

        return result;
      } else {
        throw new Error("フィードバックデータが正常に取得できませんでした");
      }
    } catch (error) {
      console.error(
        `セッションフィードバックの取得に失敗しました (${sessionId}):`,
        error,
      );

      if (error instanceof Error) {
        throw new Error(
          `セッションフィードバックの取得に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("セッションフィードバックの取得に失敗しました");
      }
    }
  }

  /**
   * セッション分析結果を取得する
   *
   * ResultPageで使用するセッションの全データを一括取得します。
   * 通常セッションと音声分析セッション両方に対応。
   *
   * @param sessionId セッションID
   * @returns セッション分析結果データ
   * @throws Error - API呼び出し失敗時やセッションが見つからない時
   */
  public async getSessionCompleteData(
    sessionId: string,
  ): Promise<SessionCompleteDataResponse> {
    try {
      // API呼び出し（音声分析セッション対応）
      const response = await this.apiGet<SessionCompleteDataResponse>(
        `/sessions/${sessionId}/analysis-results`,
      );

      if (response.success) {
        // バックエンドのsnake_caseレスポンスをcamelCaseに変換
        return {
          ...response,
          complianceViolations: Array.isArray(response.complianceViolations)
            ? response.complianceViolations.map((v) =>
              typeof (v as Record<string, unknown>).rule_id === "string"
                ? transformComplianceViolation(v as never)
                : v,
            )
            : [],
          videoAnalysis: transformVideoAnalysisResult(response.videoAnalysis),
        };
      } else {
        throw new Error("セッション分析結果が正常に取得できませんでした");
      }
    } catch (error) {
      console.error(
        `セッション分析結果の取得に失敗しました (${sessionId}):`,
        error,
      );

      if (error instanceof Error) {
        throw new Error(
          `セッション分析結果の取得に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("セッション分析結果の取得に失敗しました");
      }
    }
  }

  /**
   * マルチパートアップロードを開始し、各パートの署名付きURLを取得する
   *
   * セッション録画の動画ファイルは、長時間セッション（20分超など）でも
   * S3のサイズ制限に達しないよう、ファイルサイズに関わらずマルチパート方式で
   * アップロードする。
   *
   * @param sessionId セッションID
   * @param contentType 動画のコンテントタイプ（video/mp4）
   * @param partCount 分割するパート数
   * @param fileName ファイル名（オプション）
   * @returns マルチパートアップロードID、動画キー、各パートの署名付きURL
   */
  public async createMultipartUpload(
    sessionId: string,
    contentType: string,
    partCount: number,
    fileName?: string,
  ): Promise<{
    uploadId: string;
    videoKey: string;
    partUrls: Array<{ partNumber: number; url: string }>;
    expiresIn: number;
  }> {
    try {
      return await this.apiPost<
        {
          uploadId: string;
          videoKey: string;
          partUrls: Array<{ partNumber: number; url: string }>;
          expiresIn: number;
        },
        {
          sessionId: string;
          contentType: string;
          partCount: number;
          fileName?: string;
        }
      >("/videos/multipart/create", {
        sessionId,
        contentType,
        partCount,
        ...(fileName !== undefined ? { fileName } : {}),
      });
    } catch (error) {
      console.error("マルチパートアップロード開始に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(
          `マルチパートアップロード開始に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("マルチパートアップロード開始に失敗しました");
      }
    }
  }

  /**
   * マルチパートアップロードを完了する
   *
   * 全パートのアップロード完了後、S3に対してパートの結合を指示する。
   *
   * @param videoKey 動画キー
   * @param uploadId マルチパートアップロードID
   * @param parts 各パートの情報（パート番号とETag）
   * @returns 動画キーとアップロード完了オブジェクトのURL
   */
  public async completeMultipartUpload(
    videoKey: string,
    uploadId: string,
    parts: Array<{ partNumber: number; eTag: string }>,
  ): Promise<{ videoKey: string; location: string }> {
    try {
      return await this.apiPost<
        { videoKey: string; location: string },
        {
          videoKey: string;
          uploadId: string;
          parts: Array<{ partNumber: number; eTag: string }>;
        }
      >("/videos/multipart/complete", {
        videoKey,
        uploadId,
        parts,
      });
    } catch (error) {
      console.error("マルチパートアップロード完了に失敗しました:", error);

      if (error instanceof Error) {
        throw new Error(
          `マルチパートアップロード完了に失敗しました: ${error.message}`,
        );
      } else {
        throw new Error("マルチパートアップロード完了に失敗しました");
      }
    }
  }

  /**
   * マルチパートアップロードを中断する
   *
   * アップロード失敗時に呼び出し、アップロード済みパートを破棄する。
   *
   * @param videoKey 動画キー
   * @param uploadId マルチパートアップロードID
   * @returns 中断成功フラグ
   */
  public async abortMultipartUpload(
    videoKey: string,
    uploadId: string,
  ): Promise<{ aborted: boolean }> {
    try {
      return await this.apiPost<
        { aborted: boolean },
        { videoKey: string; uploadId: string }
      >("/videos/multipart/abort", {
        videoKey,
        uploadId,
      });
    } catch (error) {
      // 中断処理の失敗は致命的ではないため、警告ログのみ出力して握りつぶす
      console.warn("マルチパートアップロード中断に失敗しました:", error);
      return { aborted: false };
    }
  }

  /**
   * HTTPレスポンスのステータスコードを判定する共通メソッド
   * @param error エラーオブジェクト
   * @param statusCode 判定するHTTPステータスコード
   * @returns 指定したステータスコードの場合true
   */
  private hasResponseStatus(error: unknown, statusCode: number): boolean {
    if (error && typeof error === "object" && "response" in error) {
      const response = (error as { response: unknown }).response;
      if (response && typeof response === "object" && "status" in response) {
        return (response as { status: number }).status === statusCode;
      }
    }
    return false;
  }

  /** 504 Gateway Timeoutエラーかどうかを判定する */
  private isGatewayTimeoutError(error: unknown): boolean {
    return this.hasResponseStatus(error, 504);
  }

  /** 404 Not Foundエラーかどうかを判定する */
  private is404Error(error: unknown): boolean {
    return this.hasResponseStatus(error, 404);
  }

  /** 409 Conflictエラーかどうかを判定する */
  private is409Error(error: unknown): boolean {
    return this.hasResponseStatus(error, 409);
  }

  public async getRankings(
    scenarioId: string,
    period: "daily" | "weekly" | "monthly",
    limit: number = 10,
  ): Promise<RankingResponse> {
    try {
      // クエリパラメータの作成
      const queryParams: Record<string, string | number> = {
        scenarioId: scenarioId,
        period: period,
        limit: limit,
      };

      // API呼び出し
      const response = await this.apiGet<RankingResponse>(
        "/rankings",
        queryParams,
      );

      // レスポンスの検証
      if (!response.rankings) {
        throw new Error(
          "ランキングデータの取得に失敗しました: データ形式が無効です",
        );
      }

      // RankingResponseの型に合わせてtotalCountフィールドをtotalParticipantsとして扱う
      const formattedResponse: RankingResponse = {
        ...response,
        totalCount: response.totalCount || 0,
      };

      return formattedResponse;
    } catch (error) {
      console.error(
        `ランキング取得エラー: ${error instanceof Error ? error.message : String(error)}`,
      );

      if (error instanceof Error) {
        throw new Error(`ランキングの取得に失敗しました: ${error.message}`);
      } else {
        throw new Error("ランキングの取得に失敗しました");
      }
    }
  }

  /**
   * Polly音声合成API呼び出し
   * @param requestBody リクエストボディ
   * @returns 音声URL
   */
  public async callPollyAPI(requestBody: {
    text: string;
    voiceId?: string;
    engine?: string;
    languageCode?: string;
    textType?: "text" | "ssml";
  }): Promise<{
    success: boolean;
    audioUrl?: string;
    expiresIn?: number;
    text?: string;
    voiceId?: string;
    engine?: string;
    fileName?: string;
    visemes?: Array<{ time: number; type: string; value: string }>;
    error?: string;
    message?: string;
  }> {
    try {
      const response = await this.apiPost<{
        success: boolean;
        audioUrl?: string;
        expiresIn?: number;
        text?: string;
        voiceId?: string;
        engine?: string;
        fileName?: string;
        visemes?: Array<{ time: number; type: string; value: string }>;
        error?: string;
        message?: string;
      }>("/polly/convert", requestBody);

      if (!response.success) {
        throw new Error(
          response.error || response.message || "Polly音声合成に失敗しました",
        );
      }

      return response;
    } catch (error) {
      console.error("Polly API呼び出しエラー:", error);

      if (error instanceof Error) {
        throw new Error(`Polly音声合成に失敗しました: ${error.message}`);
      } else {
        throw new Error("Polly音声合成に失敗しました");
      }
    }
  }

  /**
   * 音声ファイルアップロード用の署名付きURLを生成
   * @param fileName ファイル名
   * @param contentType 音声ファイルの形式
   * @param language 言語設定
   * @returns 署名付きURLとセッション情報
   */
  public async generateAudioUploadUrl(
    fileName: string,
    contentType: string,
    language: string
  ): Promise<{
    success: boolean;
    uploadUrl: string;
    formData: Record<string, string>;
    audioKey: string;
    sessionId: string;
    language: string;
  }> {
    try {
      const requestBody = {
        fileName,
        contentType,
        language
      };

      const response = await this.apiPost<{
        success: boolean;
        uploadUrl: string;
        formData: Record<string, string>;
        audioKey: string;
        sessionId: string;
        language: string;
      }>('/audio-analysis/upload-url', requestBody);

      if (!response.success) {
        throw new Error('署名付きURL生成に失敗しました');
      }

      return response;
    } catch (error) {
      console.error('音声アップロードURL生成エラー:', error);

      if (error instanceof Error) {
        throw new Error(`音声アップロードURL生成に失敗しました: ${error.message}`);
      } else {
        throw new Error('音声アップロードURL生成に失敗しました');
      }
    }
  }

  /**
   * 音声分析を開始
   * @param sessionId セッションID
   * @param audioKey 音声ファイルのS3キー
   * @param scenarioId シナリオID
   * @param language 言語設定
   * @returns 分析開始結果
   */
  public async startAudioAnalysis(
    sessionId: string,
    audioKey: string,
    scenarioId: string,
    language: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    executionArn?: string;
    status: string;
    message?: string;
  }> {
    try {
      const requestBody = {
        audioKey,
        scenarioId,
        language
      };

      const response = await this.apiPost<{
        success: boolean;
        sessionId: string;
        executionArn?: string;
        status: string;
        message?: string;
      }>(`/audio-analysis/${sessionId}/analyze`, requestBody);

      return response;
    } catch (error) {
      console.error('音声分析開始エラー:', error);

      if (error instanceof Error) {
        throw new Error(`音声分析開始に失敗しました: ${error.message}`);
      } else {
        throw new Error('音声分析開始に失敗しました');
      }
    }
  }

  /**
   * 音声分析の状況を確認
   * @param sessionId セッションID
   * @returns 分析状況
   */
  public async getAudioAnalysisStatus(sessionId: string): Promise<{
    success: boolean;
    sessionId: string;
    status: string;
    currentStep?: string;
    hasResult: boolean;
    progress?: Record<string, unknown>;
  }> {
    try {
      const response = await this.apiGet<{
        success: boolean;
        sessionId: string;
        status: string;
        currentStep?: string;
        hasResult: boolean;
        progress?: Record<string, unknown>;
      }>(`/audio-analysis/${sessionId}/status`);

      return response;
    } catch (error) {
      console.error('分析状況確認エラー:', error);

      if (error instanceof Error) {
        throw new Error(`分析状況確認に失敗しました: ${error.message}`);
      } else {
        throw new Error('分析状況確認に失敗しました');
      }
    }
  }

  /**
   * 音声分析結果を取得
   * @param sessionId セッションID
   * @returns 分析結果
   */
  public async getAudioAnalysisResults(sessionId: string): Promise<{
    success: boolean;
    sessionId: string;
    audioAnalysis?: Record<string, unknown>;
    scenarioId?: string;
    language?: string;
    createdAt?: string;
  }> {
    try {
      const response = await this.apiGet<{
        success: boolean;
        sessionId: string;
        audioAnalysis?: Record<string, unknown>;
        scenarioId?: string;
        language?: string;
        createdAt?: string;
      }>(`/audio-analysis/${sessionId}/results`);

      return response;
    } catch (error) {
      console.error('音声分析結果取得エラー:', error);

      if (error instanceof Error) {
        throw new Error(`音声分析結果取得に失敗しました: ${error.message}`);
      } else {
        throw new Error('音声分析結果取得に失敗しました');
      }
    }
  }

  /**
   * セッション分析を開始（Step Functions統合）
   * @param sessionId セッションID
   * @param language 言語設定
   * @returns 分析開始結果
   */
  public async startSessionAnalysis(
    sessionId: string,
    language: string = "ja",
    goalStatuses?: GoalStatus[]
  ): Promise<{
    success: boolean;
    message: string;
    sessionId: string;
    status: string;
    executionArn?: string;
  }> {
    try {
      const requestBody: Record<string, unknown> = { language };

      // セッション中のゴール進捗を渡す
      if (goalStatuses && goalStatuses.length > 0) {
        requestBody.goalStatuses = goalStatuses.map(status => serializeGoalStatus(status));
      }

      const response = await this.apiPost<{
        success: boolean;
        message: string;
        sessionId: string;
        status: string;
        executionArn?: string;
      }>(`/sessions/${sessionId}/analyze`, requestBody);

      return response;
    } catch (error) {
      console.error('セッション分析開始エラー:', error);

      if (error instanceof Error) {
        throw new Error(`セッション分析開始に失敗しました: ${error.message}`);
      } else {
        throw new Error('セッション分析開始に失敗しました');
      }
    }
  }

  /**
   * セッション分析のステータスを取得（ポーリング用）
   * @param sessionId セッションID
   * @returns 分析ステータス
   */
  public async getSessionAnalysisStatus(sessionId: string): Promise<{
    success: boolean;
    sessionId: string;
    status: 'not_started' | 'processing' | 'completed' | 'failed' | 'timeout';
    message?: string;
    updatedAt?: string;
    errorMessage?: string;
  }> {
    try {
      const response = await this.apiGet<{
        success: boolean;
        sessionId: string;
        status: 'not_started' | 'processing' | 'completed' | 'failed' | 'timeout';
        message?: string;
        updatedAt?: string;
        errorMessage?: string;
      }>(`/sessions/${sessionId}/analysis-status`);

      return response;
    } catch (error) {
      console.error('セッション分析ステータス取得エラー:', error);

      if (error instanceof Error) {
        throw new Error(`セッション分析ステータス取得に失敗しました: ${error.message}`);
      } else {
        throw new Error('セッション分析ステータス取得に失敗しました');
      }
    }
  }
}
