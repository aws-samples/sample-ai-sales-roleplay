import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
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
  mergeGoalStatus,
} from "../utils/goalUtils";
import VideoManager from "../components/recording/v2/VideoManager";
import {
  loadVideoRecordingEnabled,
  saveVideoRecordingEnabled,
} from "../utils/videoRecordingSettings";

// 分割したコンポーネントをインポート
import ConversationHeader from "../components/conversation/ConversationHeader";
import { AvatarProvider } from "../components/avatar";
import type { GestureType } from "../types/avatar";
import MessageList from "../components/conversation/MessageList";
import MessageInput from "../components/conversation/MessageInput";
import SuggestionBar from "../components/conversation/SuggestionBar";
// クリーンアップ用のuseEffectを追加
import { useEffect, useState, useCallback, useRef } from "react";
import ComplianceAlert from "../components/compliance/ComplianceAlert";
// 新規コンポーネント
import MetricsOverlay from "../components/conversation/MetricsOverlay";
import RightPanelContainer from "../components/conversation/RightPanelContainer";
import CoachingHintBar from "../components/conversation/CoachingHintBar";
import AvatarStage from "../components/conversation/AvatarStage";
import SessionSettingsPanel from "../components/conversation/SessionSettingsPanel";
import SlideTray from "../components/conversation/SlideTray";
import SlideZoomModal from "../components/conversation/SlideZoomModal";
import type { SlideImageInfo } from "../types/api";
import { Dialog, DialogTitle, DialogContent } from "@mui/material";

/**
 * 右パネル（ゴール・メトリクス等）の占有幅
 * RightPanelContainer の maxWidth(260px) + right(12px) + 余白(8px) = 280px
 */
const RIGHT_PANEL_OFFSET = "280px";

/**
 * 左側メトリクス・カメラ領域の占有幅
 * アバター非表示時にチャットログが重ならないための左パディング
 */
const LEFT_METRICS_OFFSET = "200px";

/**
 * NPC応答遅延設定（ミリ秒）
 * テスト環境では0に設定してテスタビリティを向上させる
 */
const NPC_RESPONSE_BASE_DELAY = import.meta.env.VITE_NPC_RESPONSE_DELAY
  ? Number(import.meta.env.VITE_NPC_RESPONSE_DELAY)
  : 1000;
const NPC_RESPONSE_RANDOM_DELAY = import.meta.env.VITE_NPC_RESPONSE_DELAY
  ? 0
  : 1000;

/**
 * 会話ページコンポーネント
 */
const ConversationPage: React.FC = () => {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

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
  // NPC感情状態（リアルタイム評価から取得、アバターに直接渡す）
  const [npcDirectEmotion, setNpcDirectEmotion] = useState<EmotionState | undefined>(undefined);
  // NPCジェスチャー状態（リアルタイム評価から取得、アバターに渡す）
  const [npcGesture, setNpcGesture] = useState<GestureType>('none');
  // サジェスト返答候補（リアルタイム評価から取得、サジェストボタンに渡す）
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // シナリオのサジェスト返答ボタン有効/無効
  const [suggestionEnabled, setSuggestionEnabled] = useState<boolean>(false);
  // シナリオの初回サジェスト返答候補（商談開始時に表示）
  const [initialSuggestions, setInitialSuggestions] = useState<string[]>([]);
  // シナリオに紐づくアバターID
  const [scenarioAvatarId, setScenarioAvatarId] = useState<string | undefined>(undefined);
  // シナリオに紐づくアバターS3キー
  const [scenarioAvatarS3Key, setScenarioAvatarS3Key] = useState<string | undefined>(undefined);
  // シナリオNPCの音声モデルID
  const [scenarioVoiceId, setScenarioVoiceId] = useState<string | undefined>(undefined);
  // シナリオのアバター表示On/Off
  const [enableAvatar, setEnableAvatar] = useState<boolean>(false);
  // セッション中のアバター表示切替（ランタイムトグル）
  const [avatarVisible, setAvatarVisible] = useState<boolean>(false);
  // スライド関連state
  const [slideImages, setSlideImages] = useState<SlideImageInfo[]>([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [presentedSlidePages, setPresentedSlidePages] = useState<number[]>([]);
  const [isSlideZoomOpen, setIsSlideZoomOpen] = useState(false);
  const presentedSlidePagesRef = useRef<number[]>([]);
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
  // ジェスチャーリセット用タイマー
  const gestureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // NPC応答タイマーRef管理（アンマウント時クリーンアップ用）
  const npcResponseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // isSpeaking/currentMetricsをrefで管理（sendMessageの依存配列から除外するため）
  const isSpeakingRef = useRef(isSpeaking);
  const currentMetricsRef = useRef<Metrics>({ angerLevel: 0, trustLevel: 0, progressLevel: 0 });
  // goalStatuses/goals/slideImagesをrefで管理（sendMessageの依存配列から除外するため）
  const goalStatusesRef = useRef<GoalStatus[]>([]);
  const goalsRef = useRef<Goal[]>([]);
  const slideImagesRef = useRef<SlideImageInfo[]>([]);
  // suggestionEnabledをrefで管理（sendMessageの依存配列から除外するため）
  const suggestionEnabledRef = useRef<boolean>(false);

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

  // goalStatuses/goals/slideImagesの変更をrefに同期
  useEffect(() => {
    goalStatusesRef.current = goalStatuses;
  }, [goalStatuses]);

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  useEffect(() => {
    slideImagesRef.current = slideImages;
  }, [slideImages]);

  // suggestionEnabledの変更をrefに同期
  useEffect(() => {
    suggestionEnabledRef.current = suggestionEnabled;
  }, [suggestionEnabled]);
  // コンプライアンス違反の通知管理
  const [activeViolation, setActiveViolation] =
    useState<ComplianceViolation | null>(null);
  const [showComplianceAlert, setShowComplianceAlert] =
    useState<boolean>(false);
  // カメラ初期化状態管理
  const [isCameraInitialized, setIsCameraInitialized] = useState<boolean>(false);
  // カメラエラー状態管理
  const [cameraError, setCameraError] = useState<boolean>(false);
  // ビデオ録画機能のオン/オフ設定（localStorageで永続化、デフォルトはオン）
  const [videoRecordingEnabled, setVideoRecordingEnabled] = useState<boolean>(
    loadVideoRecordingEnabled,
  );

  // ビデオ録画設定の変更をlocalStorageに永続化
  useEffect(() => {
    saveVideoRecordingEnabled(videoRecordingEnabled);

    // 録画を無効化した場合、VideoManagerがアンマウントされてカメラ初期化コールバックが
    // 呼ばれなくなるため、カメラ関連stateを明示的にリセットして状態の意味を一貫させる。
    // （録画無効時はカメラを使用しないため、初期化済み・エラーのいずれでもない状態に戻す）
    if (!videoRecordingEnabled) {
      setIsCameraInitialized(false);
      setCameraError(false);
    }
  }, [videoRecordingEnabled]);

  // 新レイアウト用state
  const [rightPanelsVisible, setRightPanelsVisible] = useState<boolean>(true);
  const [metricsVisible, setMetricsVisible] = useState<boolean>(true);
  const [chatLogExpanded] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);


  // コンポーネントの初期マウント時のフラグ設定
  useEffect(() => {
    hasComponentMounted.current = true;

    // TranscribeServiceの初期化
    transcribeServiceRef.current = TranscribeService.getInstance();

    // 接続状態変更コールバックを設定
    transcribeServiceRef.current.setOnConnectionStateChange((state: ConnectionState) => {
      setConnectionState(state);
    });

    // 環境変数からWebSocketエンドポイントを取得
    const websocketEndpoint = import.meta.env.VITE_TRANSCRIBE_WEBSOCKET_URL;
    if (websocketEndpoint) {
      transcribeServiceRef.current.setWebSocketEndpoint(websocketEndpoint);
    }

    return () => {
      // コンポーネントのアンマウント時にリソース解放
      if (transcribeServiceRef.current) {
        transcribeServiceRef.current.dispose();
      }

      // ジェスチャータイマーのクリーンアップ
      if (gestureTimerRef.current) {
        clearTimeout(gestureTimerRef.current);
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

            // シナリオのアバター表示On/Off設定を読み込み（未設定時はfalse）
            setEnableAvatar(scenarioInfo.enableAvatar ?? false);
            // ランタイムトグルの初期値もシナリオ設定に合わせる
            setAvatarVisible(scenarioInfo.enableAvatar ?? false);

            // シナリオのサジェスト返答ボタン有効/無効設定を読み込み（未設定時はfalse）
            setSuggestionEnabled(scenarioInfo.suggestionEnabled ?? false);
            // シナリオの初回サジェスト返答候補を読み込み（未設定時は空配列）
            setInitialSuggestions(scenarioInfo.initialSuggestions ?? []);

            // シナリオNPCの音声モデルIDを設定（アバターAPI取得前に即座に設定）
            // アバター詳細APIの完了を待つとvoiceId設定が遅延し、
            // 初期メッセージの音声合成でデフォルト（Takumi/男性）にフォールバックする問題を防止
            const npcVoiceId = scenarioInfo.npc?.voiceId || scenarioInfo.npcInfo?.voiceId;
            if (npcVoiceId) {
              setScenarioVoiceId(npcVoiceId);
            }

            // シナリオに紐づくアバターIDを設定
            if (scenarioInfo.avatarId) {
              setScenarioAvatarId(scenarioInfo.avatarId);
              // アバター詳細APIからs3Keyを取得
              try {
                const { AvatarService } = await import("../services/AvatarService");
                const avatarDetail = await AvatarService.getInstance().getAvatarDetail(scenarioInfo.avatarId);
                if (avatarDetail?.s3Key) {
                  setScenarioAvatarS3Key(avatarDetail.s3Key);
                }
              } catch {
                // アバターs3Key取得失敗時はCloudFrontフォールバックを使用
              }
            }

            // 提案資料のスライド画像を取得
            if (scenarioInfo.presentationFile) {
              try {
                const slidesResponse = await apiService.getSlideImages(scenarioInfo.scenarioId);
                if (slidesResponse.status === 'ready' && slidesResponse.slides.length > 0) {
                  setSlideImages(slidesResponse.slides.map(s => ({
                    pageNumber: s.pageNumber,
                    imageKey: s.imageKey,
                    imageUrl: s.imageUrl,
                    thumbnailUrl: s.thumbnailUrl,
                  })));
                }
              } catch {
                // スライド取得失敗時は無視（提案資料なしとして動作）
              }
            }

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

  // 音声設定の初期適用（シナリオ取得後）
  useEffect(() => {
    if (scenario) {
      const audioSvc = AudioService.getInstance();
      audioSvc.setAudioEnabled(audioEnabled);
      audioSvc.setVolume(audioVolume / 100);
    }
  }, [scenario, audioEnabled, audioVolume]);

  // 音声設定変更時の処理
  useEffect(() => {
    const audioSvc = AudioService.getInstance();
    audioSvc.setAudioEnabled(audioEnabled);
    audioSvc.setVolume(audioVolume / 100);

    // 音声出力OFF時：再生中の音声を停止し、口パクをリセット
    if (!audioEnabled) {
      audioSvc.stopAllAudio();
      setIsSpeaking(false);
    }
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
      return;
    }

    // フロントエンド側でセッションIDを生成
    const newSessionId = crypto.randomUUID();

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

      // 初回サジェスト返答候補を表示（シナリオで有効かつ初回候補が設定されている場合）
      if (suggestionEnabled && initialSuggestions.length > 0) {
        setSuggestions(initialSuggestions);
      }
    }, 100); // 100ms遅延させる

    // 初期メッセージの音声合成
    if (audioEnabled) {
      setIsSpeaking(true);
      const audioSvc = AudioService.getInstance();
      const initialMessageId = crypto.randomUUID();
      audioSvc
        .synthesizeAndQueueAudio(initialContent, initialMessageId, scenarioVoiceId)
        .then(() => {
          // 音声合成が成功したら、音声再生完了リスナーを追加
          audioSvc.addPlaybackCompleteListener(initialMessageId, () => {
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
      presentedSlides: presentedSlidePagesRef.current.length > 0
        ? [...presentedSlidePagesRef.current]
        : undefined,
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

    // 送信時にサジェスト返答候補をクリア（次の評価結果で更新される）
    setSuggestions([]);

    // メッセージ送信時に一時的に感情状態を更新
    // ユーザーが入力している間は中立的な状態にする
    setCurrentEmotion("neutral");

    // NPCの応答を生成（タイマーIDをrefで管理してクリーンアップ可能にする）
    npcResponseTimerRef.current = setTimeout(
      async () => {
        // 安全なプリミティブ型に変換して循環参照を避ける
        const cleanMessageText = messageText ? String(messageText) : "";

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
            // 選択済みスライドのS3キーを送信（AgentCore RuntimeがS3から直接読み取り）
            presentedSlidePagesRef.current.length > 0
              ? slideImagesRef.current
                .filter(s => presentedSlidePagesRef.current.includes(s.pageNumber))
                .map(s => ({ pageNumber: s.pageNumber, imageKey: s.imageKey }))
              : undefined,
          );

          const { response } = result;

          // フロントエンドで生成されたセッションIDを使用
          const activeSessionId = sessionId;

          // メトリクスは現在の値を維持（ref経由で最新値を取得）
          const newMetrics = { ...currentMetricsRef.current };

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
              .synthesizeAndQueueAudio(response, messageId, scenarioVoiceId)
              .then(() => {
                // 音声合成が成功したら、音声再生完了リスナーを追加
                // このリスナーは音声再生が完了したときに実行される
                audioService.addPlaybackCompleteListener(messageId, () => {
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
              const cleanGoalStatuses = Array.isArray(goalStatusesRef.current) ?
                goalStatusesRef.current.map(status => ({
                  goalId: String(status.goalId || ""),
                  achieved: Boolean(status.achieved),
                  progress: Number(status.progress || 0),
                  achievedAt: status.achievedAt
                })) : [];

              // ゴールを純粋なデータ構造に変換（Goal型に合わせる）
              const cleanGoals = Array.isArray(goalsRef.current) ?
                goalsRef.current.map(goal => ({
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
              }

              if (evaluationResult) {
                // 前回のメトリクスを保存（ref経由で最新値を取得）
                setPrevMetrics(currentMetricsRef.current);

                // NPC感情状態をアバターに反映
                if (evaluationResult.npcEmotion) {
                  const validEmotions: EmotionState[] = ['happy', 'angry', 'neutral', 'annoyed', 'satisfied'];
                  const emotion = evaluationResult.npcEmotion as EmotionState;
                  if (validEmotions.includes(emotion)) {
                    setNpcDirectEmotion(emotion);
                  }
                } else {
                  // APIがnpcEmotionを返さない場合はリセットし、メトリクスベースの計算にフォールバック
                  setNpcDirectEmotion(undefined);
                }

                // NPCジェスチャーをアバターに反映
                if (evaluationResult.gesture) {
                  const validGestures: GestureType[] = ['nod', 'headTilt', 'none'];
                  const gesture = evaluationResult.gesture as GestureType;
                  if (validGestures.includes(gesture)) {
                    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
                    setNpcGesture(gesture);
                    // ジェスチャー実行後にリセット
                    gestureTimerRef.current = setTimeout(() => setNpcGesture('none'), 1500);
                  }
                }

                // サジェスト返答候補を更新（シナリオで有効な場合のみ表示）
                if (suggestionEnabledRef.current && Array.isArray(evaluationResult.suggestions)) {
                  setSuggestions(evaluationResult.suggestions);
                }

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

                // ゴールステータス更新（既存のステータスとマージ）
                if (evaluationResult.goalStatuses) {
                  setGoalStatuses((prevStatuses) => {
                    const merged = prevStatuses.map((prev) => {
                      const update = evaluationResult.goalStatuses!.find(
                        (u) => u.goalId === prev.goalId,
                      );
                      if (update) {
                        return mergeGoalStatus(prev, update);
                      }
                      return prev;
                    });
                    setGoalScore(calculateGoalScore(merged, goalsRef.current));
                    return merged;
                  });
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
      NPC_RESPONSE_BASE_DELAY + Math.random() * NPC_RESPONSE_RANDOM_DELAY,
    ); // NPC応答遅延（設定可能: VITE_NPC_RESPONSE_DELAY環境変数で制御）
  }, [scenario, isProcessing, sessionId, audioEnabled, scenarioVoiceId]);

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

          // 90秒でタイムアウト（大きなファイル対応）
          const timeoutId = setTimeout(() => {
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
                localStorage.setItem(`session_${session.id}_videoKey`, videoKey);
                clearTimeout(timeoutId);
                window.removeEventListener('recordingComplete', handleRecordingComplete as EventListener);
                resolve();
              } else {
                // 前回と同じキーのためスキップ
              }
            }
          };

          // 録画完了イベントリスナー
          const handleRecordingComplete = (event: CustomEvent) => {
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
      // ビデオ録画が無効な場合は待機をスキップ
      if (videoRecordingEnabled) {
        await waitForRecordingUpload();
      }

      // セッション分析を非同期で開始（Step Functions）
      // 注意: 録画無効時もセッション分析は起動するが、これは意図的な設計。
      // バックエンドの動画分析ステップ（sessionAnalysis/video_handler.py）は
      // S3に動画が存在しない場合を正常系として扱い、videoSkipReason="no_video"で
      // スキップする。そのため録画オフでもエラーや無駄なNova呼び出し（課金）は発生せず、
      // 会話ログベースのフィードバック分析は通常どおり実行される。
      try {
        const apiService = ApiService.getInstance();
        await apiService.startSessionAnalysis(
          session.id,
          i18n.language || "ja",
          goalStatuses
        );

        // 分析開始情報をlocalStorageに保存
        localStorage.setItem(`session_${session.id}_analysisStarted`, "true");
      } catch {
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
      videoRecordingEnabled,
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

  // スライド提示ハンドラー
  const handleSlidePresent = useCallback((pageNumber: number) => {
    if (!presentedSlidePagesRef.current.includes(pageNumber)) {
      const updated = [...presentedSlidePagesRef.current, pageNumber];
      presentedSlidePagesRef.current = updated;
      setPresentedSlidePages(updated);
    }
  }, []);

  // スライド提示取消ハンドラー
  const handleSlideUnpresent = useCallback((pageNumber: number) => {
    const updated = presentedSlidePagesRef.current.filter(p => p !== pageNumber);
    presentedSlidePagesRef.current = updated;
    setPresentedSlidePages(updated);
  }, []);

  // スライド全選択解除ハンドラー
  const handleSlideClearAll = useCallback(() => {
    presentedSlidePagesRef.current = [];
    setPresentedSlidePages([]);
  }, []);

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
    setCurrentEmotion(emotion);
  }, []);

  // カメラ初期化状態のハンドラー
  const handleCameraInitialized = useCallback((initialized: boolean) => {
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
    <Box
      className={`conversation-container ${emotionClassName}`}
      sx={{
        height: "calc(100vh - 96px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ヘッダー */}
      <ConversationHeader
        scenario={scenario}
        sessionStarted={sessionStarted}
        sessionEnded={sessionEnded}
        onManualEnd={handleManualEnd}
        messageCount={messages.length}
        onToggleRightPanels={() => setRightPanelsVisible((v) => !v)}
        onToggleMetrics={() => setMetricsVisible((v) => !v)}
        onOpenSettings={() => setShowSettings(true)}
        rightPanelsVisible={rightPanelsVisible}
        metricsVisible={metricsVisible}
      />

      {/* コンプライアンス違反通知 - ヘッダー下スライドイン */}
      {showComplianceAlert && activeViolation && (
        <ComplianceAlert
          violation={activeViolation}
          open={showComplianceAlert}
          onClose={() => setShowComplianceAlert(false)}
        />
      )}

      {/* メインエリア */}
      <Box
        sx={{
          flex: 1,
          position: "relative",
          display: "flex",
          // セッション開始後は3カラム横並び、開始前は従来の縦積み
          flexDirection: sessionStarted ? "row" : "column",
          minHeight: 0,
          overflow: "hidden",
          // 左右の余白を確保して見切れを防止
          px: sessionStarted ? 1 : 0,
        }}
      >
        {/* ===== 左カラム: アバター + メトリクス + スライド ===== */}
        {sessionStarted && avatarVisible && (
          <Box
            sx={{
              width: "22%",
              minWidth: 260,
              maxWidth: 360,
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
              position: "relative",
            }}
          >
            {/* アバターステージ（カラム全体を使用） */}
            <AvatarProvider>
              <Box sx={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}>
                <AvatarStage
                  avatarId={scenarioAvatarId}
                  avatarS3Key={scenarioAvatarS3Key}
                  angerLevel={currentMetrics.angerLevel}
                  trustLevel={currentMetrics.trustLevel}
                  progressLevel={currentMetrics.progressLevel}
                  isSpeaking={isSpeaking}
                  directEmotion={npcDirectEmotion}
                  gesture={npcGesture}
                  onEmotionChange={handleEmotionChange}
                  npcName={scenario.npc.name}
                />
              </Box>
            </AvatarProvider>

            {/* スペーサー（提案資料を下部に押す） */}
            <Box sx={{ flex: 1 }} />

            {/* スライドトレイ（提案資料、アバターの上に重ねる） */}
            {slideImages.length > 0 && (
              <Box sx={{
                position: "relative",
                zIndex: 10,
                maxHeight: 100,
                overflow: "auto",
                background: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(4px)",
              }}>
                <SlideTray
                  slides={slideImages}
                  currentIndex={currentSlideIndex}
                  presentedPages={presentedSlidePages}
                  onSlideSelect={setCurrentSlideIndex}
                  onPresent={handleSlidePresent}
                  onUnpresent={handleSlideUnpresent}
                  onClearAll={handleSlideClearAll}
                  onZoom={() => setIsSlideZoomOpen(true)}
                />
              </Box>
            )}

            {/* カメラプレビュー（左カラム下部） */}
            {videoRecordingEnabled && (
              <Box
                data-testid="video-manager-container"
                sx={{
                  borderTop: "1px solid",
                  borderColor: "divider",
                  p: 1,
                }}
              >
                <VideoManager
                  ref={undefined}
                  sessionId={sessionId}
                  sessionStarted={sessionStarted}
                  sessionEnded={sessionEnded}
                  onCameraInitialized={handleCameraInitialized}
                />
              </Box>
            )}
          </Box>
        )}

        {/* ===== 中央カラム: チャットログ + 入力 ===== */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            // セッション開始前はメトリクスをabsolute配置で表示
            position: "relative",
          }}
        >
          {/* アバターなし時：メトリクスは右パネルにのみ表示（アバターあり版と統一） */}

          {/* セッション開始前のカメラプレビュー */}
          {videoRecordingEnabled && !sessionStarted && (
            <Box
              data-testid="video-manager-container"
              sx={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 10,
                width: 180,
                borderRadius: 2,
                overflow: "hidden",
                boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
              }}
            >
              <VideoManager
                ref={undefined}
                sessionId={sessionId}
                sessionStarted={sessionStarted}
                sessionEnded={sessionEnded}
                onCameraInitialized={handleCameraInitialized}
              />
            </Box>
          )}

          {/* チャットログ */}
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              ...((!sessionStarted) && {
                cursor: "default",
                backgroundColor: "#fafafa",
              }),
            }}
            role="region"
            aria-label={
              chatLogExpanded
                ? t("conversation.chatLog.collapse")
                : t("conversation.chatLog.expand")
            }
          >
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
              videoRecordingEnabled={videoRecordingEnabled}
              slideImages={slideImages}
              onSlideClick={(idx) => { setCurrentSlideIndex(idx); setIsSlideZoomOpen(true); }}
            />
          </Box>

          {/* コーチングヒントバー */}
          <Box sx={{ flexShrink: 0 }}>
            <CoachingHintBar hint={currentMetrics.analysis} />
          </Box>

          {/* サジェスト返答ボタン（コーチングヒントと入力欄の間に表示） */}
          {sessionStarted && !sessionEnded && suggestionEnabled && (
            <Box sx={{ flexShrink: 0 }}>
              <SuggestionBar
                suggestions={suggestions}
                onSelect={(text) => sendMessage(text)}
                disabled={isProcessing}
              />
            </Box>
          )}

          {/* メッセージ入力エリア */}
          <Box sx={{ flexShrink: 0 }}>
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
        </Box>

        {/* ===== 右カラム: メトリクス + ゴール + シナリオ情報 ===== */}
        {sessionStarted && rightPanelsVisible && (
          <Box
            sx={{
              width: "25%",
              minWidth: 240,
              maxWidth: 320,
              borderLeft: "1px solid",
              borderColor: "divider",
              overflow: "auto",
            }}
          >
            {/* メトリクスパネル（右カラム上部） */}
            {metricsVisible && (
              <Box sx={{
                borderBottom: "1px solid",
                borderColor: "divider",
                "& > [role='region']": {
                  position: "static",
                  borderRadius: 0,
                  boxShadow: "none",
                  background: "transparent",
                  m: 0,
                  maxWidth: "none",
                },
              }}>
                <MetricsOverlay
                  currentMetrics={currentMetrics}
                  prevMetrics={prevMetrics}
                  metricsUpdating={metricsUpdating}
                  visible={metricsVisible}
                />
              </Box>
            )}
            <RightPanelContainer
              visible={true}
              goals={goals}
              goalStatuses={goalStatuses}
              scenario={scenario}
            />
          </Box>
        )}

      </Box>

      {/* スライド拡大モーダル */}
      {slideImages.length > 0 && (
        <SlideZoomModal
          open={isSlideZoomOpen}
          slides={slideImages}
          currentIndex={currentSlideIndex}
          presentedPages={presentedSlidePages}
          onSlideChange={setCurrentSlideIndex}
          onPresent={handleSlidePresent}
          onUnpresent={handleSlideUnpresent}
          onClose={() => setIsSlideZoomOpen(false)}
        />
      )}

      {/* 設定モーダル（音声設定 + アバター表示切替） */}
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        aria-labelledby="settings-dialog-title"
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="settings-dialog-title">
          {t("conversation.settings.title")}
        </DialogTitle>
        <DialogContent>
          <SessionSettingsPanel
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            audioVolume={audioVolume}
            setAudioVolume={setAudioVolume}
            speechRate={speechRate}
            setSpeechRate={setSpeechRate}
            avatarVisible={avatarVisible}
            setAvatarVisible={setAvatarVisible}
            avatarEnabled={enableAvatar}
            videoRecordingEnabled={videoRecordingEnabled}
            setVideoRecordingEnabled={setVideoRecordingEnabled}
            recordingSettingLocked={sessionStarted}
          />
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default ConversationPage;
