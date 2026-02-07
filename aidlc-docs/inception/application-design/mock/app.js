/**
 * 3Dアバター機能モック - JavaScript
 * 
 * このファイルは設計ドキュメントに基づいたモックの動作を実装します。
 * 実際のThree.js/VRM実装の代わりに、CSSアニメーションで表現しています。
 */

// ========================================
// 型定義（JSDocコメント）
// ========================================

/**
 * @typedef {'happy' | 'satisfied' | 'neutral' | 'annoyed' | 'angry'} EmotionState
 */

/**
 * @typedef {Object} AvatarInfo
 * @property {string} id
 * @property {string} name
 * @property {string} modelPath
 * @property {string} [thumbnail]
 * @property {string} [description]
 * @property {boolean} [isDefault]
 */

/**
 * @typedef {Object} Metrics
 * @property {number} angerLevel
 * @property {number} trustLevel
 * @property {number} progressLevel
 */

// ========================================
// アバターマニフェスト（モックデータ）
// ========================================

const AVATAR_MANIFEST = {
  version: "1.0.0",
  defaultAvatarId: "default",
  avatars: [
    {
      id: "default",
      name: "デフォルトアバター",
      modelPath: "default.vrm",
      thumbnail: "👤",
      description: "標準的なビジネスパーソン",
      isDefault: true
    },
    {
      id: "business-woman",
      name: "ビジネスウーマン",
      modelPath: "business-woman.vrm",
      thumbnail: "👩‍💼",
      description: "女性ビジネスパーソン"
    },
    {
      id: "senior-manager",
      name: "シニアマネージャー",
      modelPath: "senior-manager.vrm",
      thumbnail: "👨‍💼",
      description: "経験豊富な管理職"
    },
    {
      id: "tech-lead",
      name: "テックリード",
      modelPath: "tech-lead.vrm",
      thumbnail: "🧑‍💻",
      description: "技術部門のリーダー"
    },
    {
      id: "customer",
      name: "顧客担当者",
      modelPath: "customer.vrm",
      thumbnail: "🙋",
      description: "一般的な顧客"
    },
    {
      id: "executive",
      name: "役員",
      modelPath: "executive.vrm",
      thumbnail: "🤵",
      description: "経営層の役員"
    }
  ]
};

// ========================================
// 感情マッピング（EmotionState → VRM Expression）
// ========================================

const EMOTION_TO_VRM_EXPRESSION = {
  happy: { expression: 'happy', intensity: 0.8, emoji: '😊' },
  satisfied: { expression: 'relaxed', intensity: 0.6, emoji: '🙂' },
  neutral: { expression: 'neutral', intensity: 0.0, emoji: '😐' },
  annoyed: { expression: 'angry', intensity: 0.4, emoji: '😒' },
  angry: { expression: 'angry', intensity: 0.8, emoji: '😠' }
};

// ========================================
// AvatarService（シングルトン）
// ========================================

class AvatarService {
  static instance = null;

  constructor() {
    this.manifestCache = null;
    this.avatarCache = new Map();
  }

  static getInstance() {
    if (!AvatarService.instance) {
      AvatarService.instance = new AvatarService();
    }
    return AvatarService.instance;
  }

  async loadManifest() {
    // モックではローカルデータを使用
    if (!this.manifestCache) {
      // 実際の実装: fetch('/models/avatars/manifest.json')
      this.manifestCache = AVATAR_MANIFEST;
      log('info', 'AvatarService: マニフェストをロード');
    }
    return this.manifestCache;
  }

  async getAvatarList() {
    const manifest = await this.loadManifest();
    return manifest.avatars;
  }

  async getAvatarInfo(avatarId) {
    if (this.avatarCache.has(avatarId)) {
      return this.avatarCache.get(avatarId);
    }

    const manifest = await this.loadManifest();
    const avatar = manifest.avatars.find(a => a.id === avatarId);

    if (!avatar) {
      throw new Error(`Avatar not found: ${avatarId}`);
    }

    this.avatarCache.set(avatarId, avatar);
    return avatar;
  }

  async getDefaultAvatar() {
    const manifest = await this.loadManifest();
    const defaultAvatar = manifest.avatars.find(a => a.isDefault);
    return defaultAvatar || manifest.avatars[0];
  }

  resolveAvatarId(avatarId) {
    return avatarId || AVATAR_MANIFEST.defaultAvatarId;
  }

  getModelUrl(avatarInfo) {
    return `/models/avatars/${avatarInfo.modelPath}`;
  }
}

// ========================================
// AudioService（モック）
// ========================================

class AudioService {
  static instance = null;

  constructor() {
    this.isPlaying = false;
    this.currentAudioElement = null;
  }

  static getInstance() {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  getCurrentAudioElement() {
    return this.isPlaying ? this.currentAudioElement : null;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  // モック用: 発話シミュレーション
  simulateSpeaking(duration = 3000) {
    this.isPlaying = true;
    this.currentAudioElement = { /* mock audio element */ };

    return new Promise(resolve => {
      setTimeout(() => {
        this.isPlaying = false;
        this.currentAudioElement = null;
        resolve();
      }, duration);
    });
  }
}

// ========================================
// 感情計算関数（既存のemotionUtils.tsと同等）
// ========================================

/**
 * メトリクスから感情状態を計算
 * @param {number} angerLevel - 怒りレベル (0-10)
 * @param {number} trustLevel - 信頼度 (0-10)
 * @param {number} progressLevel - 進捗度 (0-10)
 * @returns {EmotionState}
 */
function calculateEmotionState(angerLevel, trustLevel, progressLevel) {
  // 怒りが高い場合
  if (angerLevel >= 7) {
    return 'angry';
  }
  if (angerLevel >= 5) {
    return 'annoyed';
  }

  // 信頼度と進捗度が高い場合
  const positiveScore = (trustLevel + progressLevel) / 2;

  if (positiveScore >= 7) {
    return 'happy';
  }
  if (positiveScore >= 5) {
    return 'satisfied';
  }

  return 'neutral';
}

// ========================================
// グローバル状態
// ========================================

let state = {
  currentAvatarId: 'default',
  currentAvatarInfo: null,
  isSpeaking: false,
  isLoading: false,
  error: null,
  metrics: {
    angerLevel: 3,
    trustLevel: 5,
    progressLevel: 4
  },
  currentEmotion: 'neutral'
};

// ========================================
// DOM要素の参照
// ========================================

const elements = {
  avatarSelector: null,
  avatarFace: null,
  avatarMouth: null,
  speakingIndicator: null,
  loadingOverlay: null,
  errorDisplay: null,
  emotionDisplay: null,
  webglStatus: null,
  logContainer: null,
  currentAvatarId: null,
  currentAvatarName: null,
  speakBtn: null,
  speakingStatus: null,
  angerValue: null,
  trustValue: null,
  progressValue: null
};

// ========================================
// ログ機能
// ========================================

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('div');
  entry.className = `log-entry ${level}`;
  entry.textContent = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  if (elements.logContainer) {
    elements.logContainer.appendChild(entry);
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
  }

  console.log(`[${level.toUpperCase()}] ${message}`);
}

// ========================================
// WebGLサポートチェック
// ========================================

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (gl) {
      elements.webglStatus.textContent = 'WebGL ✓';
      elements.webglStatus.classList.remove('error');
      log('success', 'WebGL対応確認: サポートされています');
      return true;
    }
  } catch (e) {
    // WebGL not supported
  }

  elements.webglStatus.textContent = 'WebGL ✗';
  elements.webglStatus.classList.add('error');
  log('error', 'WebGL非対応: 3Dアバターは表示できません');
  return false;
}

// ========================================
// アバターセレクター初期化
// ========================================

async function initAvatarSelector() {
  const avatarService = AvatarService.getInstance();
  const avatars = await avatarService.getAvatarList();

  elements.avatarSelector.innerHTML = '';

  avatars.forEach(avatar => {
    const thumbnail = document.createElement('div');
    thumbnail.className = 'avatar-thumbnail';
    thumbnail.dataset.avatarId = avatar.id;
    thumbnail.textContent = avatar.thumbnail || '👤';
    thumbnail.title = avatar.name;
    thumbnail.setAttribute('role', 'button');
    thumbnail.setAttribute('tabindex', '0');
    thumbnail.setAttribute('aria-label', `${avatar.name}を選択`);

    if (avatar.id === state.currentAvatarId) {
      thumbnail.classList.add('selected');
    }

    thumbnail.addEventListener('click', () => selectAvatar(avatar.id));
    thumbnail.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectAvatar(avatar.id);
      }
    });

    elements.avatarSelector.appendChild(thumbnail);
  });

  log('info', `AvatarSelector: ${avatars.length}体のアバターをロード`);
}

// ========================================
// アバター選択
// ========================================

async function selectAvatar(avatarId) {
  if (state.isLoading) return;

  state.isLoading = true;
  showLoading(true);

  try {
    const avatarService = AvatarService.getInstance();
    const avatarInfo = await avatarService.getAvatarInfo(avatarId);

    // 選択状態の更新
    document.querySelectorAll('.avatar-thumbnail').forEach(el => {
      el.classList.toggle('selected', el.dataset.avatarId === avatarId);
    });

    state.currentAvatarId = avatarId;
    state.currentAvatarInfo = avatarInfo;

    // UI更新
    elements.currentAvatarId.textContent = avatarId;
    elements.currentAvatarName.textContent = avatarInfo.name;

    log('success', `アバター選択: ${avatarInfo.name} (${avatarId})`);

    // ロードシミュレーション（実際はVRMLoaderでロード）
    await new Promise(resolve => setTimeout(resolve, 500));

  } catch (error) {
    state.error = error;
    showError(error.message);
    log('error', `アバターロードエラー: ${error.message}`);
  } finally {
    state.isLoading = false;
    showLoading(false);
  }
}

// ========================================
// メトリクス更新
// ========================================

function updateMetrics() {
  const angerLevel = parseInt(document.getElementById('angerLevel').value);
  const trustLevel = parseInt(document.getElementById('trustLevel').value);
  const progressLevel = parseInt(document.getElementById('progressLevel').value);

  // 値表示の更新
  elements.angerValue.textContent = angerLevel;
  elements.trustValue.textContent = trustLevel;
  elements.progressValue.textContent = progressLevel;

  // 状態更新
  state.metrics = { angerLevel, trustLevel, progressLevel };

  // 感情計算
  const newEmotion = calculateEmotionState(angerLevel, trustLevel, progressLevel);

  if (newEmotion !== state.currentEmotion) {
    const oldEmotion = state.currentEmotion;
    state.currentEmotion = newEmotion;
    onEmotionChange(newEmotion, oldEmotion);
  }

  updateEmotionDisplay();
  updateAvatarExpression();
}

// ========================================
// 感情変化コールバック
// ========================================

function onEmotionChange(newEmotion, oldEmotion) {
  log('info', `感情変化: ${oldEmotion} → ${newEmotion}`);

  // アクセシビリティ: 状態変化を通知
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.className = 'sr-only';
  announcement.textContent = `感情状態が${oldEmotion}から${newEmotion}に変化しました`;
  document.body.appendChild(announcement);
  setTimeout(() => announcement.remove(), 1000);
}

// ========================================
// 感情表示更新
// ========================================

function updateEmotionDisplay() {
  const emotionData = EMOTION_TO_VRM_EXPRESSION[state.currentEmotion];

  elements.emotionDisplay.innerHTML = `
    <span class="emotion-emoji">${emotionData.emoji}</span>
    <span class="emotion-label">${state.currentEmotion}</span>
  `;
}

// ========================================
// アバター表情更新
// ========================================

function updateAvatarExpression() {
  // 既存のクラスを削除
  elements.avatarFace.classList.remove('happy', 'satisfied', 'neutral', 'annoyed', 'angry');

  // 新しい感情クラスを追加
  elements.avatarFace.classList.add(state.currentEmotion);

  log('info', `ExpressionController: 表情を${state.currentEmotion}に更新`);
}

// ========================================
// 発話制御
// ========================================

async function toggleSpeaking() {
  if (state.isSpeaking) {
    stopSpeaking();
  } else {
    await startSpeaking();
  }
}

async function startSpeaking() {
  state.isSpeaking = true;

  // UI更新
  elements.speakBtn.textContent = '🔇 発話停止';
  elements.speakingStatus.textContent = '発話中';
  elements.speakingIndicator.hidden = false;
  elements.avatarFace.classList.add('speaking');

  log('info', 'LipSyncController: AudioServiceに接続');
  log('info', '発話開始');

  // AudioServiceで発話シミュレーション
  const audioService = AudioService.getInstance();
  await audioService.simulateSpeaking(3000);

  // 自動停止
  if (state.isSpeaking) {
    stopSpeaking();
  }
}

function stopSpeaking() {
  state.isSpeaking = false;

  // UI更新
  elements.speakBtn.textContent = '🔊 発話開始';
  elements.speakingStatus.textContent = '停止中';
  elements.speakingIndicator.hidden = true;
  elements.avatarFace.classList.remove('speaking');

  log('info', 'LipSyncController: 接続解除');
  log('info', '発話停止');
}

// ========================================
// ローディング表示
// ========================================

function showLoading(show) {
  elements.loadingOverlay.hidden = !show;
}

// ========================================
// エラー表示
// ========================================

function showError(message) {
  elements.errorDisplay.hidden = false;
  elements.errorDisplay.querySelector('.error-message').textContent = message;
}

function hideError() {
  elements.errorDisplay.hidden = true;
}

function retryLoad() {
  hideError();
  selectAvatar(state.currentAvatarId);
}

// ========================================
// テーマ切替
// ========================================

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  log('info', `テーマ切替: ${newTheme}`);
}

// ========================================
// 初期化
// ========================================

async function init() {
  // DOM要素の参照を取得
  elements.avatarSelector = document.getElementById('avatarSelector');
  elements.avatarFace = document.getElementById('avatarFace');
  elements.avatarMouth = document.getElementById('avatarMouth');
  elements.speakingIndicator = document.getElementById('speakingIndicator');
  elements.loadingOverlay = document.getElementById('loadingOverlay');
  elements.errorDisplay = document.getElementById('errorDisplay');
  elements.emotionDisplay = document.getElementById('emotionDisplay');
  elements.webglStatus = document.getElementById('webglStatus');
  elements.logContainer = document.getElementById('logContainer');
  elements.currentAvatarId = document.getElementById('currentAvatarId');
  elements.currentAvatarName = document.getElementById('currentAvatarName');
  elements.speakBtn = document.getElementById('speakBtn');
  elements.speakingStatus = document.getElementById('speakingStatus');
  elements.angerValue = document.getElementById('angerValue');
  elements.trustValue = document.getElementById('trustValue');
  elements.progressValue = document.getElementById('progressValue');

  // WebGLチェック
  checkWebGLSupport();

  // アバターセレクター初期化
  await initAvatarSelector();

  // デフォルトアバターをロード
  await selectAvatar(state.currentAvatarId);

  // 初期感情状態を設定
  updateMetrics();

  log('success', 'モック初期化完了');
}

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', init);

// ========================================
// グローバル関数（HTMLから呼び出し用）
// ========================================

window.updateMetrics = updateMetrics;
window.toggleSpeaking = toggleSpeaking;
window.toggleTheme = toggleTheme;
window.retryLoad = retryLoad;
