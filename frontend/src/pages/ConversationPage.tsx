import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import type {
  Message,
  Metrics,
  Session,
  Goal,
  GoalStatus,
  Scenario,
} from "../types/index";
import type {
  ComplianceViolation,
  DifficultyLevel
} from "../types/api";
import type { CompositionEventType } from "../types/components";
import { getSessionEndReason } from "../utils/dialogueEngine";
import { ApiService } from "../services/ApiService";
import { AudioService } from "../services/AudioService";
import { LanguageService } from "../services/LanguageService";
import { PollyService } from "../services/PollyService";
import { TranscribeService, ConnectionState } from "../services/TranscribeService";
import type { EmotionState } from "../types/index";
import {
  initializeGoalStatuses,
  calculateGoalScore,
  areAllRequiredGoalsAchieved,
} from "../utils/goalUtils";
import VideoManager from "../components/recording/v2/VideoManager";

// 分割したコンポーネントをインポート
import ConversationHeader from "../components/conversation/ConversationHeader";
import NPCInfoCard from "../components/conversation/NPCInfoCard";
import EmojiFeedbackContainer from "../components/conversation/EmojiFeedbackContainer";
import MessageList from "../components/conversation/MessageList";
import MessageInput from "../components/conversation/MessageInput";
// クリーンアップ用のuseEffectを追加
import { useEffect, useState, useCallback, useRef } from "react";
import SidebarPanel from "../components/conversation/SidebarPanel";
import ComplianceAlert from "../components/compliance/ComplianceAlert";

/**
 * 会話ページコンポーネント
 */
const ConversationPage: React.FC = () => {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();

  // 状態管理
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // メッセージ履歴を参照として保持し、非同期更新の問題を回避
  const messagesRef = useRef<Message[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<Metrics>({
    angerLevel: 0,
    trustLevel: 0,
    progressLevel: 0,
  });
  const [prevMetrics, setPrevMetrics] = useState<Metrics | null>(null);
  const [userInput, setUserInput] = useState("");
  // 音声認識の確定済みテキストを保持
  const [, setConfirmedTranscripts] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  // セッション開始後、コンポーネントの再マウントを防止するためのRef
  const hasComponentMounted = useRef(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  // アバターの表情状態管理用の状態変数
  const [currentEmotion, setCurrentEmotion] = useState<string>("neutral");
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioVolume, setAudioVolume] = useState<number>(80);
  const [speechRate, setSpeechRate] = useState<number>(1.15);
  const [isListening, setIsListening] = useState(false);
  const [continuousListening, setContinuousListening] = useState(false); // 常時マイク入力モード
  const [speechRecognitionError, setSpeechRecognitionError] = useState<
    "permission" | "no-speech" | "network" | "not-supported" | "unknown" | null
  >(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [metricsUpdating, setMetricsUpdating] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalStatuses, setGoalStatuses] = useState<GoalStatus[]>([]);

  // Transcribe音声認識サービスへの参照
  const transcribeServiceRef = useRef<TranscribeService | null>(null);
  // 最新のuserInputを参照するためのRef
  const userInputRef = useRef<string>("");
  // ゴールの達成スコア（セッション終了時に使用）
  const [goalScore, setGoalScore] = useState<number>(0);

  // isSpeaking/currentMetricsをrefで管理（sendMessageの依存配列から除外するため）
  const isSpeakingRef = useRef(false);
  const currentMetricsRef = useRef<Metrics>({ angerLevel: 0, trustLevel: 0, progressLevel: 0 });

  // NPC応答遅延タイマーとフォールバックタイマーのref（クリーンアップ用）
  const npcResponseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // userInputの変更をrefに同期
  useEffect(() => {
    userInputRef.current = userInput;
  }, [userInput]);

  // isSpeakingの変更をrefに同期
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // currentMetricsの変更をrefに同期
  useEffect(() => {
    currentMetricsRef.current = currentMetrics;
  }, [currentMetrics]);
  // コンプライアンス違反の通知管理
  const [activeViolation, setActiveViolation] =
    useState<ComplianceViolation | null>(null);
  const [showComplianceAlert, setShowComplianceAlert] =
    useState<boolean>(false);
  // カメラ初期化状態管理
  const [isCameraInitialized, setIsCameraInitialized] = useState<boolean>(false);
  // カメラエラー状態管理
  const [cameraError, setCameraError] = useState<boolean>(false);


  // コンポーネントの初期マウント時のフラグ設定
  useEffect(() => {
    hasComponentMounted.current = true;
    // コンポーネントのマウント状態をログ出力
    console.log("ConversationPageコンポーネントがマウントされました");

    // TranscribeServiceの初期化
    transcribeServiceRef.current = TranscribeService.getInstance();

    // 接続状態変更コールバックを設定
    transcribeServiceRef.current.setOnConnectionStateChange((state: ConnectionState) => {
      console.log(`接続状態変更コールバック: ${state}`);
      setConnectionState(state);
    });

    // 環境変数からWebSocketエンドポイントを取得
    const websocketEndpoint = import.meta.env.VITE_TRANSCRIBE_WEBSOCKET_URL;
    if (websocketEndpoint) {
      console.log("Transcribe WebSocketエンドポイントを設定:", websocketEndpoint);
      transcribeServiceRef.current.setWebSocketEndpoint(websocketEndpoint);
    } else {
      console.warn("Transcribe WebSocketエンドポイントが設定されていません");
    }

    return () => {
      // コンポーネントのアンマウント時にリソース解放
      if (transcribeServiceRef.current) {
        transcribeServiceRef.current.dispose();
      }

      // NPC応答タイマーとフォールバックタイマーをクリア
      if (npcResponseTimerRef.current) clearTimeout(npcResponseTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

      // 音声認識関連の状態もクリアする
      setConfirmedTranscripts([]);
    };
  }, []);

  // 初期化
  useEffect(() => {
    const fetchScenario = async () => {
      if (scenarioId) {
        try {
          const apiService = ApiService.getInstance();
          const scenarioInfo = await apiService.getScenarioDetail(scenarioId);

          if (scenarioInfo) {
            console.log("取得したシナリオ情報:", scenarioInfo); // デバッグ用

            // APIから取得したScenarioInfo型をScenario型に変換
            const convertedScenario: Scenario = {
              id: scenarioInfo.scenarioId,
              title: scenarioInfo.title,
              description: scenarioInfo.description,
              difficulty: scenarioInfo.difficulty as DifficultyLevel,
              industry: scenarioInfo.category || scenarioInfo.industry || "",
              // シナリオに定義された初期メッセージと言語を反映
              initialMessage: scenarioInfo.initialMessage,
              language: scenarioInfo.language || "ja",
              npc: {
                // APIではnpcInfoではなくnpcフィールドが使われている可能性に対応
                id:
                  scenarioInfo.npc?.id ||
                  scenarioInfo.npcInfo?.id ||
                  `npc-${scenarioId}`,
                name:
                  scenarioInfo.npc?.name || scenarioInfo.npcInfo?.name || "",
                role:
                  scenarioInfo.npc?.role || scenarioInfo.npcInfo?.role || "",
                company:
                  scenarioInfo.npc?.company ||
                  scenarioInfo.npcInfo?.company ||
                  "",
                personality:
                  scenarioInfo.npc?.personality ||
                  scenarioInfo.npcInfo?.personality ||
                  [],
                avatar:
                  scenarioInfo.npc?.avatar ||
                  scenarioInfo.npcInfo?.avatar ||
                  "👤",
                description:
                  scenarioInfo.npc?.description ||
                  scenarioInfo.npcInfo?.description ||
                  "",
              },
              // 文字列型で返される可能性があるmaxTurnsを数値型に変換
              maxTurns:
                scenarioInfo.maxTurns !== undefined
                  ? Number(scenarioInfo.maxTurns)
                  : undefined,
              goals: (scenarioInfo.goals || []).map((goal) => {
                // goalが文字列の場合はオブジェクトに変換
                if (typeof goal === "string") {
                  return {
                    id: `goal-${Math.random().toString(36).substring(2, 11)}`,
                    description: goal,
                    priority: 3,
                    criteria: [],
                    isRequired: false,
                  };
                }
                // goalがオブジェクトの場合は必要なプロパティを確認
                return {
                  id:
                    goal.id ||
                    `goal-${Math.random().toString(36).substring(2, 11)}`,
                  description: goal.description || "",
                  priority: Number(goal.priority || 3),
                  criteria: goal.criteria || [],
                  isRequired: Boolean(goal.isRequired),
                };
              }),
              initialMetrics: {
                // 文字列型の場合は数値に変換する
                angerLevel: Number(
                  scenarioInfo.initialMetrics?.angerLevel || 1,
                ),
                trustLevel: Number(
                  scenarioInfo.initialMetrics?.trustLevel || 1,
                ),
                progressLevel: Number(
                  scenarioInfo.initialMetrics?.progressLevel || 1,
                ),
              },
            };

            setScenario(convertedScenario);
            setCurrentMetrics(convertedScenario.initialMetrics);

            // ゴール情報の初期化
            setGoals(
              convertedScenario.goals && convertedScenario.goals.length > 0
                ? convertedScenario.goals
                : []
            );
            const initialGoalStatuses =
              initializeGoalStatuses(convertedScenario);
            setGoalStatuses(initialGoalStatuses);

            // AudioServiceの初期設定は別のuseEffectで管理
          } else {
            navigate("/scenarios");
          }
        } catch (error) {
          console.error("シナリオ情報の取得に失敗しました:", error);
          navigate("/scenarios");
        }
      }
    };

    fetchScenario();
  }, [scenarioId, navigate]);

  // メトリクス更新の初期化
  useEffect(() => {
    if (scenario) {
      // メトリクスは直接APIから取得します
      console.log("メトリクス更新の初期化");
    }
  }, [scenario]);

  // 音声設定変更時の処理
  useEffect(() => {
    const audioSvc = AudioService.getInstance();
    audioSvc.setAudioEnabled(audioEnabled);
    audioSvc.setVolume(audioVolume / 100);
  }, [audioEnabled, audioVolume]);

  // 読み上げ速度変更時の処理
  useEffect(() => {
    const pollySvc = PollyService.getInstance();
    pollySvc.setSpeechRate(speechRate);
  }, [speechRate]);

  // シナリオ言語に応じたUI言語の設定
  useEffect(() => {
    if (scenario?.language) {
      const languageService = LanguageService.getInstance();
      const currentLang = languageService.getCurrentLanguage();

      // シナリオの言語がUIの言語と異なる場合、UI言語も変更する
      if (scenario.language !== currentLang) {
        console.log(
          `シナリオの言語(${scenario.language})に合わせてUI言語を変更します`,
        );
        languageService
          .changeLanguage(scenario.language)
          .catch((err) => console.error("言語設定の変更に失敗しました:", err));
      }
    }
  }, [scenario?.language]);

  // 商談開始
  // 録画関連のstateは、VideoManagerコンポーネントに移動

  // 商談開始（カメラを起動して録画も開始）
  const startConversation = async () => {
    if (!scenario) return;

    // React 18のStrictモードで二重レンダリングを防止
    if (sessionStarted) {
      console.log("商談はすでに開始されています");
      return;
    }

    // フロントエンド側でセッションIDを生成
    const newSessionId = crypto.randomUUID();
    console.log("新しいセッションIDを生成:", newSessionId);

    // セッションIDを先に設定し、状態更新を確実に行う
    setSessionId(newSessionId);

    // DynamoDBにセッションを保存（AgentCore経由の会話でも評価画面で参照できるように）
    const apiService = ApiService.getInstance();
    try {
      await apiService.createOrUpdateSession(
        newSessionId,
        scenario.id,
        `${scenario.npc.name}との会話`,
        {
          name: scenario.npc.name,
          role: scenario.npc.role,
          company: scenario.npc.company,
          personality: scenario.npc.personality,
          description: scenario.npc.description,
        }
      );
      console.log("セッションをDynamoDBに保存しました:", newSessionId);
    } catch (error) {
      console.error("セッション保存エラー（会話は続行）:", error);
      // エラーが発生しても会話は続行できるようにする
    }

    // Transcribe WebSocketの初期化
    if (transcribeServiceRef.current) {
      transcribeServiceRef.current.initializeConnection(newSessionId, scenario?.language || 'ja')
        .catch(error => {
          console.error("Transcribe WebSocket接続エラー:", error);
          // エラーがあっても通常の会話は続行できるようにする
        });
    }

    // 短い遅延を入れてセッションIDの状態更新を確実に反映させる
    setTimeout(() => {
      console.log("セッション開始状態を更新 - sessionId:", newSessionId);
      setSessionStarted(true);
    }, 50);

    // シナリオに定義された初期メッセージがある場合はそれを使用、なければデフォルトメッセージを表示
    const initialContent =
      scenario?.initialMessage ||
      `こんにちは。${scenario?.npc.company}の${scenario?.npc.name}です。本日はお忙しい中、お時間をいただきありがとうございます。どのようなご提案でしょうか？`;

    // 少し遅延してからメッセージを追加（レンダリング安定化のため）
    setTimeout(() => {
      const initialMessageId = crypto.randomUUID();

      const initialMessage: Message = {
        id: initialMessageId,
        sender: "npc",
        content: initialContent,
        timestamp: new Date(),
        metrics: currentMetrics,
      };

      // messagesRefも同時に更新して一貫性を保つ（バグ修正）
      const initialMessages = [initialMessage];
      messagesRef.current = initialMessages;
      setMessages(initialMessages);
      setCurrentEmotion("neutral");
    }, 100); // 100ms遅延させる

    // 初期メッセージの音声合成
    if (audioEnabled) {
      setIsSpeaking(true);
      const audioSvc = AudioService.getInstance();
      const initialMessageId = crypto.randomUUID();
      audioSvc
        .synthesizeAndQueueAudio(initialContent, initialMessageId)
        .then(() => {
          // 音声合成が成功したら、音声再生完了リスナーを追加
          audioSvc.addPlaybackCompleteListener(initialMessageId, () => {
            // 音声再生完了時に話している状態を更新
            console.log(`初期メッセージの音声再生が完了しました。`);
            setIsSpeaking(false);
          });
        })
        .catch((error) => {
          console.error("初期メッセージの音声合成エラー:", error);
          const synth = window.speechSynthesis;
          if (synth) {
            const utterance = new SpeechSynthesisUtterance(initialContent);
            utterance.lang = "ja-JP";
            utterance.onend = () => setIsSpeaking(false);
            synth.speak(utterance);
          } else {
            // フォールバック: 音声合成が利用できない場合
            setTimeout(() => setIsSpeaking(false), 3000);
          }
        });
    }
  };

  /**
   * 音声認識テキストの正規化（重複除去など）
   */
  const normalizeTranscriptText = useCallback((text: string): string => {
    if (!text) return "";
    let cleanedText = text.trim();

    // 文単位の重複除去
    const sentences = cleanedText.split(/[。.？?！!\n]/).map(s => s.trim()).filter(s => s);
    if (sentences.length >= 2) {
      const uniqueSentences = [...new Set(sentences)];
      if (uniqueSentences.length < sentences.length) {
        cleanedText = uniqueSentences.join('。') + '。';
      }
    }

    // フレーズの重複除去
    const words = cleanedText.split(/\s+/);
    if (words.length >= 2) {
      const halfIndex = Math.ceil(words.length / 2);
      const firstHalf = words.slice(0, halfIndex).join(' ');
      const secondHalf = words.slice(halfIndex).join(' ');

      if (firstHalf === secondHalf ||
        (firstHalf.length > 3 && secondHalf.includes(firstHalf)) ||
        (secondHalf.length > 3 && firstHalf.includes(secondHalf))) {
        cleanedText = firstHalf;
      }
    }

    return cleanedText;
  }, []);

  // メッセージ送信
  const sendMessage = useCallback(async (inputText?: string) => {
    // 引数で渡されたテキストまたは現在のuserInputを使用（ref経由で最新値を取得）
    const messageText = inputText || userInputRef.current.trim();
    if (!messageText || !scenario || isProcessing) return;

    // 音声認識中なら停止する（送信時にマイクを自動OFF）
    if (transcribeServiceRef.current && transcribeServiceRef.current.isListening()) {
      transcribeServiceRef.current.stopListening();
      setIsListening(false);
      setContinuousListening(false);
    }

    // 入力フィールドを無効化（API処理中）
    setIsProcessing(true);

    // ユーザーメッセージを追加
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      content: messageText,
      timestamp: new Date(),
    };

    // リファレンスを使用して確実に最新のメッセージ履歴を維持（バグ修正）
    const currentMessages = messagesRef.current;
    const updatedMessages = [...currentMessages, userMessage];

    // 両方更新して確実に同期を保つ
    messagesRef.current = updatedMessages;
    setMessages(updatedMessages);

    // 入力クリアの前にuserInputRefも更新して同期を確保
    userInputRef.current = "";
    setUserInput("");

    // 音声認識の状態もリセット
    setConfirmedTranscripts([]);

    // メッセージ送信時に一時的に感情状態を更新
    // ユーザーが入力している間は中立的な状態にする
    setCurrentEmotion("neutral");

    // NPCの応答を生成（タイマーIDをrefで管理してクリーンアップ可能にする）
    npcResponseTimerRef.current = setTimeout(
      async () => {
        console.log("=== ConversationPage: NPC応答生成開始 ===");
        // 安全なプリミティブ型に変換して循環参照を避ける
        const cleanMessageText = messageText ? String(messageText) : "";
        console.log("userInput:", cleanMessageText);
        console.log("currentMetrics:", currentMetricsRef.current);
        console.log("scenario.npc:", scenario.npc);

        try {
          const apiService = ApiService.getInstance();
          // セッションIDとメッセージIDを追加
          const messageId = crypto.randomUUID();
          // フロントエンドで生成されたセッションIDを使用
          const currentSessionId = sessionId;

          // 純粋なオブジェクトを作成してAPI呼び出し（ref経由で最新のメトリクスを取得）
          const cleanMetrics = {
            angerLevel: Number(currentMetricsRef.current.angerLevel) || 1,
            trustLevel: Number(currentMetricsRef.current.trustLevel) || 1,
            progressLevel: Number(currentMetricsRef.current.progressLevel) || 1,
          };

          // messagesRef経由で確実に最新のメッセージ履歴を取得（バグ修正）
          const currentMessages = messagesRef.current;

          console.log(`API呼び出し時のメッセージ数: ${currentMessages.length}`);

          // メッセージ配列をディープコピーし、純粋なデータ構造にする（sender型を正しくキャスト）
          const cleanMessages = currentMessages.map(msg => ({
            id: String(msg.id),
            sender: (msg.sender === "user" || msg.sender === "npc" ? msg.sender : "user") as "user" | "npc",
            content: String(msg.content),
            timestamp: msg.timestamp instanceof Date ? msg.timestamp : new Date()
          }));

          // NPCオブジェクトをディープコピー
          const cleanNpc = {
            name: String(scenario.npc.name),
            role: String(scenario.npc.role),
            company: String(scenario.npc.company),
            description: String(scenario.npc.description || ""),
            personality: Array.isArray(scenario.npc.personality) ?
              scenario.npc.personality.map(p => String(p)) : []
          };

          // /bedrock/conversation エンドポイントからメトリクス出力を廃止したため、デフォルトのメトリクスを使用
          const result = await apiService.chatWithNPC(
            cleanMessageText, // 安全な文字列に変換済み
            cleanNpc, // 安全なプリミティブ型に変換済み
            cleanMessages, // 安全なプリミティブ型に変換済み
            String(currentSessionId),
            String(messageId),
            // 感情パラメータを追加
            cleanMetrics,
            // シナリオIDを追加
            String(scenario.id),
            // 言語設定を追加
            scenario?.language || 'ja',
          );

          const { response } = result;

          // フロントエンドで生成されたセッションIDを使用
          const activeSessionId = sessionId;

          // メトリクスは現在の値を維持（ref経由で最新値を取得）
          const newMetrics = { ...currentMetricsRef.current };

          console.log("=== API応答受信 ===");
          console.log("response:", response);
          console.log("newMetrics:", newMetrics);
          console.log("activeSessionId:", activeSessionId);

          const npcMessage: Message = {
            id: crypto.randomUUID(),
            sender: "npc",
            content: response,
            timestamp: new Date(),
            metrics: newMetrics,
          };

          // 話している状態を開始
          setIsSpeaking(true);

          // messagesRefから最新の状態を取得（バグ修正）
          const currentMessagesState = messagesRef.current;
          const finalMessages = [...currentMessagesState, npcMessage];

          // 両方同時に更新して一貫性を保つ
          messagesRef.current = finalMessages;
          setMessages(finalMessages);
          setCurrentMetrics(newMetrics);

          // APIからのレスポンスが返ってきた時点で入力処理を有効化
          // ユーザーは音声を聞きながら次の入力を準備できるように
          setIsProcessing(false);

          // Amazon Polly で音声合成
          if (audioEnabled) {
            const audioService = AudioService.getInstance();
            audioService
              .synthesizeAndQueueAudio(response, messageId)
              .then(() => {
                // 音声合成が成功したら、音声再生完了リスナーを追加
                // このリスナーは音声再生が完了したときに実行される
                audioService.addPlaybackCompleteListener(messageId, () => {
                  // 音声再生完了時に話している状態のみを更新
                  console.log(`メッセージID ${messageId} の音声再生が完了しました。`);
                  setIsSpeaking(false);
                });
              })
              .catch((error) => {
                console.error("Amazon Polly音声合成エラー:", error);
                // エラーが発生した場合も話している状態を更新
                setIsSpeaking(false);
              });
          } else {
            // 音声が無効な場合は、短い遅延後に話している状態を更新
            setTimeout(() => {
              setIsSpeaking(false);
            }, 500);
          }

          // NPCの応答後にリアルタイム評価を実行（有効なsessionIDがある場合のみ）
          if (activeSessionId) {
            try {
              console.log(
                "リアルタイム評価API呼び出し開始",
                "activeSessionId:",
                activeSessionId,
              );
              // 安全な文字列に変換
              const cleanMessageText = messageText ? String(messageText) : "";

              // メッセージ配列を純粋なデータ構造に変換（sender型を正しくキャスト）
              const cleanMessages = finalMessages.map(msg => ({
                id: String(msg.id || ""),
                sender: (msg.sender === "user" || msg.sender === "npc" ? msg.sender : "user") as "user" | "npc",
                content: String(msg.content || ""),
                timestamp: msg.timestamp instanceof Date ? msg.timestamp :
                  (typeof msg.timestamp === 'string' ? new Date(msg.timestamp) : new Date())
              }));

              // ゴール状態を純粋なデータ構造に変換（GoalStatus型に合わせる）
              const cleanGoalStatuses = Array.isArray(goalStatuses) ?
                goalStatuses.map(status => ({
                  goalId: String(status.goalId || ""),
                  achieved: Boolean(status.achieved),
                  progress: Number(status.progress || 0),
                  achievedAt: status.achievedAt
                })) : [];

              // ゴールを純粋なデータ構造に変換（Goal型に合わせる）
              const cleanGoals = Array.isArray(goals) ?
                goals.map(goal => ({
                  id: String(goal.id || ""),
                  description: String(goal.description || ""),
                  isRequired: Boolean(goal.isRequired),
                  priority: Number(goal.priority || 3),
                  criteria: Array.isArray(goal.criteria) ? goal.criteria.map(c => String(c)) : []
                })) : [];

              const evaluationResult = await apiService.getRealtimeEvaluation(
                cleanMessageText,
                cleanMessages,
                String(activeSessionId), // 安全な文字列に変換
                cleanGoalStatuses,
                cleanGoals,
                String(scenario.id), // 安全な文字列に変換
                String(scenario.language || "ja"), // 安全な文字列に変換
                // 現在のスコアを渡す（エージェントが差分を計算するため）（ref経由で最新値を取得）
                {
                  angerLevel: currentMetricsRef.current.angerLevel,
                  trustLevel: currentMetricsRef.current.trustLevel,
                  progressLevel: currentMetricsRef.current.progressLevel,
                },
              );

              // コンプライアンスチェック結果の確認
              if (
                evaluationResult.compliance &&
                evaluationResult.compliance.violations &&
                evaluationResult.compliance.violations.length > 0
              ) {
                // 最も重大度の高い違反を表示
                const sortedViolations = [
                  ...evaluationResult.compliance.violations,
                ].sort((a, b) => {
                  const severityOrder: Record<
                    "high" | "medium" | "low",
                    number
                  > = { high: 3, medium: 2, low: 1 };
                  return (
                    severityOrder[b.severity as "high" | "medium" | "low"] -
                    severityOrder[a.severity as "high" | "medium" | "low"]
                  );
                });

                // 最も重大な違反を通知用に設定
                setActiveViolation(sortedViolations[0]);
                setShowComplianceAlert(true);

                console.log("コンプライアンス違反を検出:", sortedViolations[0]);
              }

              if (evaluationResult) {
                // 前回のメトリクスを保存（ref経由で最新値を取得）
                setPrevMetrics(currentMetricsRef.current);

                // 新しいメトリクスを設定
                setCurrentMetrics((prevMetrics) => ({
                  ...prevMetrics,
                  angerLevel:
                    evaluationResult.scores?.angerLevel ||
                    prevMetrics.angerLevel,
                  trustLevel:
                    evaluationResult.scores?.trustLevel ||
                    prevMetrics.trustLevel,
                  progressLevel:
                    evaluationResult.scores?.progressLevel ||
                    prevMetrics.progressLevel,
                  analysis: evaluationResult.analysis || prevMetrics.analysis,
                }));

                // 更新中の状態を表示
                setMetricsUpdating(true);
                setTimeout(() => setMetricsUpdating(false), 1000);

                // ゴールステータス更新
                if (evaluationResult.goalStatuses) {
                  setGoalStatuses(evaluationResult.goalStatuses);
                  setGoalScore(
                    calculateGoalScore(evaluationResult.goalStatuses, goals),
                  );
                }
              }
            } catch (error) {
              console.error("リアルタイム評価API呼び出しエラー:", error);
            }
          }

          // 音声再生完了イベントが発火しない場合のフォールバック
          // 音声が無限に再生され続けることを防止（ref経由で最新値を取得）
          fallbackTimerRef.current = setTimeout(() => {
            if (isSpeakingRef.current) {
              console.warn("音声再生完了イベントが検出されませんでした。フォールバックタイマーにより話している状態をリセットします。");
              setIsSpeaking(false);
            }
          }, 30000); // 長めのタイムアウト - 通常は音声再生が完了するはず

        } catch (error) {
          console.error("=== ConversationPage: API呼び出しエラー ===");
          console.error("エラー詳細:", error);

          // エラー時はセッションを終了
          setIsProcessing(false);
          console.error("API呼び出しエラーのため、セッションを終了します");
        }
      },
      1000 + Math.random() * 1000,
    ); // 1-2秒の遅延でリアル感を演出
  }, [scenario, isProcessing, sessionId, audioEnabled, goalStatuses, goals]);

  /**
   * セッション終了処理
   *
   * 会話セッションを終了し、結果ページに遷移する
   *
   * @param finalMessages 最終的なメッセージリスト
   * @param finalMetrics 最終的なメトリクス
   */
  const endSession = useCallback(
    async (finalMessages: Message[], finalMetrics: Metrics) => {
      console.log("セッション終了処理を開始します");
      setSessionEnded(true);

      // 最終的なゴールスコアを計算
      const finalGoalScore = calculateGoalScore(goalStatuses, goals);
      setGoalScore(finalGoalScore);

      // 終了理由を取得
      const endReason = getSessionEndReason(
        finalMetrics,
        finalMessages.length,
        goalStatuses,
        goals,
        scenario || undefined,
      );

      // セッションデータを作成
      const session: Session = {
        id: sessionId,
        scenarioId: scenario!.id,
        startTime: new Date(Date.now() - finalMessages.length * 30000),
        endTime: new Date(),
        messages: finalMessages,
        finalMetrics,
        finalScore: 0,
        feedback: [],
        goalStatuses: goalStatuses,
        goalScore: goalScore,
        endReason: endReason,
      };

      // セッションデータをlocalStorageに保存
      localStorage.setItem(`session_${session.id}`, JSON.stringify(session));

      // 録画完了を確実に待つ処理を改善
      const waitForRecordingUpload = () => {
        return new Promise<void>((resolve) => {
          let uploadCompleted = false;

          // 前回の録画キーを保存（新しいセッションの録画を待つため）
          const previousKey = localStorage.getItem("lastRecordingKey");
          console.log("録画アップロード待機開始, 前回のキー:", previousKey, "セッションID:", session.id);

          // 90秒でタイムアウト（大きなファイル対応）
          const timeoutId = setTimeout(() => {
            console.warn("録画アップロード待機がタイムアウトしました（90秒経過）");
            window.removeEventListener('recordingComplete', handleRecordingComplete as EventListener);
            resolve();
          }, 90000);

          const checkUploadComplete = (newVideoKey?: string) => {
            if (uploadCompleted) return;

            const videoKey = newVideoKey || localStorage.getItem("lastRecordingKey");

            // 新しいキーが設定されているか確認
            // 1. セッションIDを含むキーであること
            // 2. 前回のキーと異なること（または前回のキーがない場合）
            if (videoKey && videoKey.includes(session.id)) {
              if (!previousKey || videoKey !== previousKey) {
                uploadCompleted = true;
                console.log(`録画アップロード完了確認: ${videoKey}`);
                localStorage.setItem(`session_${session.id}_videoKey`, videoKey);
                clearTimeout(timeoutId);
                window.removeEventListener('recordingComplete', handleRecordingComplete as EventListener);
                resolve();
              } else {
                console.log("前回と同じキーのためスキップ:", videoKey);
              }
            }
          };

          // 録画完了イベントリスナー
          const handleRecordingComplete = (event: CustomEvent) => {
            console.log("録画完了イベント受信:", event.detail);
            if (event.detail?.videoKey) {
              checkUploadComplete(event.detail.videoKey);
            } else {
              checkUploadComplete();
            }
          };

          window.addEventListener('recordingComplete', handleRecordingComplete as EventListener);

          // 定期的にlocalStorageをチェック（イベントが発火しない場合の対策）
          const checkInterval = setInterval(() => {
            if (!uploadCompleted) {
              const currentKey = localStorage.getItem("lastRecordingKey");
              if (currentKey && currentKey.includes(session.id) && currentKey !== previousKey) {
                console.log("定期チェックで録画キーを検出:", currentKey);
                checkUploadComplete(currentKey);
                clearInterval(checkInterval);
              }
            } else {
              clearInterval(checkInterval);
            }
          }, 1000);

          // タイムアウト時にインターバルもクリア
          setTimeout(() => {
            clearInterval(checkInterval);
          }, 90000);
        });
      };

      // 録画アップロード完了を待ってから遷移
      await waitForRecordingUpload();

      // セッション分析を非同期で開始（Step Functions）
      try {
        const apiService = ApiService.getInstance();
        const analysisResponse = await apiService.startSessionAnalysis(
          session.id,
          i18n.language || "ja"
        );
        console.log("セッション分析開始:", analysisResponse);

        // 分析開始情報をlocalStorageに保存
        localStorage.setItem(`session_${session.id}_analysisStarted`, "true");
      } catch (analysisError) {
        console.warn("セッション分析開始に失敗しましたが、結果ページへ遷移します:", analysisError);
        // 分析開始に失敗しても結果ページへ遷移（従来の同期分析にフォールバック）
      }

      setTimeout(() => {
        navigate(`/result/${session.id}`);
      }, 1000);
    },
    [
      goals,
      goalStatuses,
      navigate,
      scenario,
      goalScore,
      sessionId,
      i18n.language,
    ],
  );

  // 手動終了
  const handleManualEnd = async () => {
    if (messages.length > 0) {
      await endSession(messages, currentMetrics);
    } else {
      navigate("/scenarios");
    }
  };

  // Enter キー処理
  const handleKeyDown = (event: CompositionEventType) => {
    // IME入力中の場合は何もしない
    if (event.nativeEvent.isComposing || event.key === "Process") {
      return;
    }

    // Enterキーで送信（Shift + Enterは改行）
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  // 音声入力を開始
  const startSpeechRecognition = useCallback(async () => {
    // すでにリスニング中なら停止（トグル動作）
    if (isListening && transcribeServiceRef.current) {
      transcribeServiceRef.current.stopListening();
      setIsListening(false);
      setContinuousListening(false);

      // 現在入力中のテキストがあれば送信
      if (userInputRef.current.trim()) {
        sendMessage(userInputRef.current.trim());
        // sendMessage内で状態がクリアされるので、ここでは不要
      } else {
        // テキストがない場合は音声認識状態だけクリア
        setConfirmedTranscripts([]);
      }
      return;
    }

    try {
      if (!transcribeServiceRef.current) {
        throw new Error("TranscribeServiceが初期化されていません");
      }

      // WebSocketが接続されていなければ再接続を試みる
      if (!transcribeServiceRef.current.isConnected() && sessionId) {
        try {
          await transcribeServiceRef.current.initializeConnection(sessionId, scenario?.language || 'ja');
        } catch (error) {
          console.error("Transcribe WebSocket接続エラー:", error);
          setSpeechRecognitionError("network");
          return;
        }
      }

      // Amazon Transcribeを使った常時マイク入力を開始
      await transcribeServiceRef.current.startListening(
        // 文字起こしコールバック（isPartial: true=途中認識、false=最終確定）
        (text, isPartial) => {
          // デバッグログ（開発環境でのみ出力）
          if (process.env.NODE_ENV === 'development') {
            console.log(`音声認識: "${text.trim()}", isPartial: ${isPartial}`);
          }

          if (!isPartial) {
            // 最終確定時の処理（無音検出後に来る場合は既に送信済みのためスキップされる）
            const trimmedText = text.trim();
            if (!trimmedText) return;

            const cleanedText = normalizeTranscriptText(trimmedText);
            if (!cleanedText) return;

            setConfirmedTranscripts((prev) => {
              if (prev.includes(cleanedText)) return prev;

              const newConfirmed = [...prev, cleanedText];
              const combinedText = newConfirmed.join("\n");

              setUserInput(combinedText);
              userInputRef.current = combinedText;

              return newConfirmed;
            });
          } else {
            // 途中認識時の処理 - Transcribeは累積的にテキストを返す
            const currentPartial = text.trim();
            if (!currentPartial) return;

            // 確定済みテキストと途中認識を組み合わせて表示
            // state updater関数を使ってクロージャ問題を回避
            setConfirmedTranscripts((prevConfirmed) => {
              const combinedText = prevConfirmed.length > 0
                ? prevConfirmed.join("\n") + "\n" + currentPartial
                : currentPartial;

              setUserInput(combinedText);
              userInputRef.current = combinedText;
              return prevConfirmed; // 途中認識では確定リストは変更しない
            });
          }
        },
        // 無音検出コールバック（マイクを自動停止し、テキストを確定する。送信はユーザーが手動で行う）
        () => {
          console.log(`🔇 無音検出: マイクを自動停止`);
          // マイクを停止（Transcribeセッションのタイムアウトを防止）
          if (transcribeServiceRef.current && transcribeServiceRef.current.isListening()) {
            transcribeServiceRef.current.stopListening();
          }
          setIsListening(false);
          setContinuousListening(false);
        },
        // エラーコールバック
        (error) => {
          console.error("音声認識エラー:", error);
          setIsListening(false);
          setContinuousListening(false);
          setSpeechRecognitionError("network");
        }
      );

      setIsListening(true);
      setContinuousListening(true);
      setSpeechRecognitionError(null);
    } catch (error) {
      console.error("音声認識の開始に失敗:", error);
      setSpeechRecognitionError("not-supported");
      setIsListening(false);
    }
  }, [isListening, sessionId, sendMessage, normalizeTranscriptText, scenario?.language]);

  // 音声認識を停止し、テキスト入力モードに切り替え
  const switchToTextInput = useCallback(() => {
    setSpeechRecognitionError(null);
    setIsListening(false);
    setContinuousListening(false);

    // Transcribeサービスの停止
    if (transcribeServiceRef.current && transcribeServiceRef.current.isListening()) {
      transcribeServiceRef.current.stopListening();
    }

    // 部分認識をクリア（確定済みテキストは保持）

    // ユーザー入力を確定済みテキストのみに更新（state updaterパターンで統一）
    setConfirmedTranscripts((prevConfirmed) => {
      if (prevConfirmed.length > 0) {
        const confirmedText = prevConfirmed.join("\n");
        setUserInput(confirmedText);
        userInputRef.current = confirmedText;
      }
      return prevConfirmed;
    });
  }, []);

  // 感情状態変化のハンドラー
  const handleEmotionChange = useCallback((emotion: EmotionState) => {
    console.log("感情状態変化:", emotion);
    setCurrentEmotion(emotion);
  }, []);

  // カメラ初期化状態のハンドラー
  const handleCameraInitialized = useCallback((initialized: boolean) => {
    console.log("カメラ初期化状態変更:", initialized);
    setIsCameraInitialized(initialized);
    // カメラ初期化に失敗した場合はエラー状態を設定
    if (!initialized) {
      setCameraError(true);
    }
  }, []);

  // ゴール達成時の通知表示
  useEffect(() => {
    // 前回のゴール状態と比較して新たに達成されたゴールを検出
    const newlyAchievedGoals = goalStatuses.filter((status) => {
      if (!status.achieved) return false;
      const goal = goals.find((g) => g.id === status.goalId);
      return (
        goal &&
        status.achievedAt &&
        new Date(status.achievedAt).getTime() > Date.now() - 5000
      ); // 5秒以内に達成されたゴール
    });

    // 新たに達成されたゴールがある場合、通知を表示
    if (newlyAchievedGoals.length > 0) {
      const achievedGoal = newlyAchievedGoals[0];
      const goal = goals.find((g) => g.id === achievedGoal.goalId);

      if (goal) {
        // ここで通知を表示する処理を実装
        // 例: トースト通知やアラートなど
        console.log(`ゴール達成: ${goal.description}`);

        // 必須ゴールがすべて達成された場合、セッションを終了
        if (areAllRequiredGoalsAchieved(goalStatuses, goals)) {
          setTimeout(async () => {
            if (!sessionEnded && messagesRef.current.length > 0) {
              await endSession(messagesRef.current, currentMetrics);
            }
          }, 2000);
        }
      }
    }
  }, [goalStatuses, goals, currentMetrics, sessionEnded, endSession]);

  if (!scenario) {
    return null;
  }

  // 録画完了時のハンドラー

  // 現在の感情状態を使用してレンダリングに影響を与えるためのクラス名を生成
  const emotionClassName = `emotion-${currentEmotion}`;

  return (
    <Container
      maxWidth="lg"
      className={`conversation-container ${emotionClassName}`}
      sx={{ py: 2, height: "100vh", display: "flex", flexDirection: "column" }}
    >
      {/* ヘッダー */}
      <ConversationHeader
        scenario={scenario}
        sessionStarted={sessionStarted}
        sessionEnded={sessionEnded}
        onManualEnd={handleManualEnd}
        messageCount={messages.length}
      />

      <Box
        display="flex"
        gap={2}
        flexGrow={1}
        minHeight={0}
        sx={{
          "@media (max-width: 1024px)": {
            flexDirection: "column",
          },
        }}
      >
        {/* メイン対話エリア */}
        <Box flexGrow={1} display="flex" flexDirection="column">
          {/* ヘッダー部分: NPC情報と絵文字フィードバックを横並びに */}
          <Box display="flex" gap={2} mb={2}>
            {/* NPC情報カード - 幅を制限 */}
            <Box flexGrow={1} maxWidth="60%">
              <NPCInfoCard npc={scenario.npc} />
            </Box>

            {/* 絵文字フィードバック表示エリア - 中央に配置 */}
            {sessionStarted && (
              <Box
                sx={{
                  width: "20%",
                  minWidth: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <EmojiFeedbackContainer
                  angerLevel={currentMetrics.angerLevel}
                  trustLevel={currentMetrics.trustLevel}
                  progressLevel={currentMetrics.progressLevel}
                  isSpeaking={isSpeaking}
                  onEmotionChange={handleEmotionChange}
                />
              </Box>
            )}

            {/* 録画コンポーネント - 右側に配置 */}
            <Box sx={{ width: "20%", minWidth: "100px" }}>
              {/* 新しいVideoManagerコンポーネントを使用 */}
              <VideoManager
                sessionId={sessionId}
                sessionStarted={sessionStarted}
                sessionEnded={sessionEnded}
                onCameraInitialized={handleCameraInitialized}
              />
            </Box>
          </Box>

          {/* メッセージエリア */}
          <MessageList
            messages={messages}
            isProcessing={isProcessing}
            sessionStarted={sessionStarted}
            sessionEnded={sessionEnded}
            currentMetrics={currentMetrics}
            scenario={scenario}
            onStartConversation={startConversation}
            isCameraInitialized={isCameraInitialized}
            cameraError={cameraError}
          />

          {/* メッセージ入力エリア */}
          {/* コンプライアンス違反通知 */}
          {showComplianceAlert && activeViolation && (
            <ComplianceAlert
              violation={activeViolation}
              open={showComplianceAlert}
              onClose={() => setShowComplianceAlert(false)}
            />
          )}

          <MessageInput
            userInput={userInput}
            setUserInput={setUserInput}
            sendMessage={sendMessage}
            isProcessing={isProcessing}
            isListening={isListening}
            isConnecting={connectionState === ConnectionState.CONNECTING}
            speechRecognitionError={speechRecognitionError}
            startSpeechRecognition={startSpeechRecognition}
            switchToTextInput={switchToTextInput}
            handleKeyDown={handleKeyDown}
            sessionStarted={sessionStarted}
            sessionEnded={sessionEnded}
            continuousListening={continuousListening}
          />
        </Box>

        {/* サイドバー - 評価指標と録画 */}
        <Box display="flex" flexDirection="column" width="300px">
          <SidebarPanel
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            audioVolume={audioVolume}
            setAudioVolume={setAudioVolume}
            speechRate={speechRate}
            setSpeechRate={setSpeechRate}
            currentMetrics={currentMetrics}
            prevMetrics={prevMetrics}
            metricsUpdating={metricsUpdating}
            goals={goals}
            goalStatuses={goalStatuses}
          />
        </Box>
      </Box>
    </Container>
  );
};

export default ConversationPage;
