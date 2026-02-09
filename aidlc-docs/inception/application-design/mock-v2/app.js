/**
 * AI営業ロールプレイ - UI/UXモック v2
 * アバター会話中心のデザイン
 */

// ========================================
// モックデータ
// ========================================

const SCENARIOS = [
  {
    id: 'sc-1',
    title: '新規提案商談',
    npcName: '田中部長',
    npcAvatar: '👨‍💼',
    npcRole: 'IT企業 事業部長',
    npcPersona: '従業員200名のSIerで事業部長を務める。DX推進に関心が高いが、過去に導入したツールが定着しなかった経験があり、慎重な姿勢。ROIを重視し、具体的な数値根拠を求める傾向がある。',
    description: '新規SaaSプロダクトの導入提案。コスト削減と業務効率化のメリットを伝え、次回デモの約束を取り付けましょう。',
    difficulty: 'intermediate',
    industry: 'it',
    goals: [
      { id: 'g1', text: '課題をヒアリングする', achieved: false, progress: 0 },
      { id: 'g2', text: '製品のメリットを3つ以上伝える', achieved: false, progress: 0 },
      { id: 'g3', text: '次回アポイントを獲得する', achieved: false, progress: 0 },
    ],
  },
  {
    id: 'sc-2',
    title: 'クレーム対応',
    npcName: '佐藤課長',
    npcAvatar: '👩‍💼',
    npcRole: '金融機関 業務課長',
    npcPersona: '地方銀行の業務課長。几帳面で細かいミスも見逃さない性格。システム障害で顧客対応に支障が出ており、強い不満を抱えている。論理的な説明には耳を傾けるが、曖昧な回答には厳しい。',
    description: 'システム障害によるクレーム対応。お客様の怒りを鎮め、信頼を回復し、再発防止策を提示しましょう。',
    difficulty: 'advanced',
    industry: 'finance',
    goals: [
      { id: 'g1', text: 'まず謝罪と共感を示す', achieved: false, progress: 0 },
      { id: 'g2', text: '原因と対策を説明する', achieved: false, progress: 0 },
      { id: 'g3', text: '信頼を回復する', achieved: false, progress: 0 },
    ],
  },
  {
    id: 'sc-3',
    title: '初回訪問・アイスブレイク',
    npcName: '鈴木店長',
    npcAvatar: '🙋',
    npcRole: '小売チェーン 店長',
    npcPersona: '従業員50名の町工場を経営。資産1-2億円を保有するが、老後や事業承継に不安を抱えている。安全性を重視する傾向がある。人当たりは良いが、初対面の営業には警戒心が強い。',
    description: '初めてのお客様との面談。自己紹介から始め、相手のニーズを引き出し、信頼関係の基盤を作りましょう。',
    difficulty: 'beginner',
    industry: 'retail',
    goals: [
      { id: 'g1', text: '自己紹介を完了する', achieved: false, progress: 0 },
      { id: 'g2', text: '相手の課題を1つ以上聞き出す', achieved: false, progress: 0 },
      { id: 'g3', text: '次のステップを提案する', achieved: false, progress: 0 },
    ],
  },
  {
    id: 'sc-4',
    title: 'アップセル提案',
    npcName: '高橋マネージャー',
    npcAvatar: '🧑‍💻',
    npcRole: 'IT企業 プロジェクトマネージャー',
    npcPersona: '成長中のベンチャー企業でPMを務める。スピード重視で意思決定が早い。現行ツールには概ね満足しているが、チーム拡大に伴い機能不足を感じ始めている。コスパに敏感。',
    description: '既存顧客へのアップグレード提案。現在の利用状況を確認し、上位プランのメリットを訴求しましょう。',
    difficulty: 'intermediate',
    industry: 'it',
    goals: [
      { id: 'g1', text: '現在の利用状況を確認する', achieved: false, progress: 0 },
      { id: 'g2', text: '上位プランの価値を伝える', achieved: false, progress: 0 },
      { id: 'g3', text: 'アップグレードの合意を得る', achieved: false, progress: 0 },
    ],
  },
  {
    id: 'sc-5',
    title: '契約更新交渉',
    npcName: '渡辺取締役',
    npcAvatar: '🤵',
    npcRole: '金融機関 取締役',
    npcPersona: '大手証券会社の取締役。業界歴30年のベテランで、数字に厳しく交渉力が高い。競合からも積極的に提案を受けており、自社に最も有利な条件を引き出そうとしている。',
    description: '年間契約の更新交渉。競合の提案も受けている状況で、自社サービスの継続利用を勝ち取りましょう。',
    difficulty: 'advanced',
    industry: 'finance',
    goals: [
      { id: 'g1', text: '競合状況を把握する', achieved: false, progress: 0 },
      { id: 'g2', text: '自社の差別化ポイントを伝える', achieved: false, progress: 0 },
      { id: 'g3', text: '契約更新の合意を得る', achieved: false, progress: 0 },
    ],
  },
  {
    id: 'sc-6',
    title: '商品説明・デモ',
    npcName: '中村主任',
    npcAvatar: '👩‍💼',
    npcRole: '小売チェーン 仕入主任',
    npcPersona: '全国展開する小売チェーンの仕入担当。売れ筋データを重視し、感覚的な提案には興味を示さない。過去の販売実績や他店舗での成功事例を求める傾向がある。',
    description: '新商品のデモンストレーション。商品の特徴を分かりやすく説明し、発注につなげましょう。',
    difficulty: 'beginner',
    industry: 'retail',
    goals: [
      { id: 'g1', text: '商品の特徴を説明する', achieved: false, progress: 0 },
      { id: 'g2', text: '質問に的確に回答する', achieved: false, progress: 0 },
      { id: 'g3', text: 'サンプル発注を獲得する', achieved: false, progress: 0 },
    ],
  },
];

const MOCK_CONVERSATION = [
  { sender: 'npc', text: 'お忙しいところお時間いただきありがとうございます。本日はどのようなご提案でしょうか？' },
  { sender: 'user', text: 'お時間いただきありがとうございます。本日は御社の業務効率化に貢献できるSaaSプロダクトについてご紹介させていただきたく参りました。' },
  { sender: 'npc', text: 'なるほど、業務効率化ですか。具体的にはどのような課題を解決できるのでしょうか？' },
  { sender: 'user', text: '現在、御社では手作業で行われている月次レポート作成に多くの時間を費やされていると伺っています。弊社のツールを使えば、その作業時間を約70%削減できます。' },
  { sender: 'npc', text: 'それは興味深いですね。ただ、導入コストが気になります。予算的にはどの程度を見込めばよいでしょうか？' },
];

const HISTORY_DATA = [
  { id: 'h1', title: '新規提案商談', date: '2026-02-06', score: 82, npc: '田中部長' },
  { id: 'h2', title: 'クレーム対応', date: '2026-02-04', score: 65, npc: '佐藤課長' },
  { id: 'h3', title: '初回訪問', date: '2026-02-01', score: 91, npc: '鈴木店長' },
  { id: 'h4', title: 'アップセル提案', date: '2026-01-28', score: 74, npc: '高橋マネージャー' },
];

const RANKING_DATA = [
  { rank: 1, name: '佐々木 花子', dept: '営業1課 3年目', score: 92 },
  { rank: 2, name: '伊藤 健太', dept: '営業2課 2年目', score: 88 },
  { rank: 3, name: '山田 太郎', dept: '営業1課 2年目', score: 78, isMe: true },
  { rank: 4, name: '田村 美咲', dept: '営業3課 1年目', score: 75 },
  { rank: 5, name: '小林 大輔', dept: '営業2課 1年目', score: 71 },
];

// ========================================
// アプリケーション状態
// ========================================

const appState = {
  currentPage: 'home',
  currentScenario: null,
  messages: [],
  metrics: { angerLevel: 3, trustLevel: 5, progressLevel: 4 },
  currentEmotion: 'neutral',
  isSpeaking: false,
  isMicActive: false,
  chatLogExpanded: false,
  metricsVisible: true,
  goalsVisible: true,
  personaVisible: true,
  conversationStep: 0,
};


// ========================================
// ナビゲーション
// ========================================

function navigateTo(page) {
  // 会話中の場合は確認
  if (appState.currentPage === 'conversation' && page !== 'conversation') {
    confirmExit();
    return;
  }

  appState.currentPage = page;

  // すべてのページを非表示
  document.querySelectorAll('.page').forEach(p => p.hidden = true);

  // 対象ページを表示
  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.hidden = false;
  }

  // ナビバーの表示制御（会話中は非表示）
  const nav = document.getElementById('globalNav');
  nav.style.display = page === 'conversation' ? 'none' : 'flex';

  // ページ固有の初期化
  if (page === 'scenarios') renderScenarios();
  if (page === 'history') renderHistory();
  if (page === 'ranking') renderRanking();
  if (page === 'home') renderRecentSessions();

  // スクロールトップ
  window.scrollTo(0, 0);
}

// ========================================
// ホーム画面
// ========================================

function renderRecentSessions() {
  const container = document.getElementById('recentSessions');
  container.innerHTML = HISTORY_DATA.slice(0, 3).map(h => `
    <div class="recent-card" onclick="navigateTo('result')" role="button" tabindex="0"
         aria-label="${h.title} - ${h.score}点">
      <div class="recent-card-title">${h.title}</div>
      <div class="recent-card-meta">${h.date} ・ ${h.npc}</div>
      <span class="recent-card-score">${h.score}点</span>
    </div>
  `).join('');
}

// ========================================
// シナリオ選択
// ========================================

function renderScenarios(filter) {
  const grid = document.getElementById('scenarioGrid');
  const filtered = filter && filter !== 'all'
    ? SCENARIOS.filter(s => s.difficulty === filter || s.industry === filter)
    : SCENARIOS;

  grid.innerHTML = filtered.map(s => `
    <div class="scenario-card" onclick="startScenario('${s.id}')" role="button" tabindex="0"
         aria-label="${s.title} - ${getDifficultyLabel(s.difficulty)}">
      <div class="scenario-card-header">
        <div class="scenario-npc-avatar">${s.npcAvatar}</div>
        <div>
          <div class="scenario-card-title">${s.title}</div>
          <div class="scenario-card-npc">${s.npcName}（${s.npcRole}）</div>
        </div>
      </div>
      <div class="scenario-card-desc">${s.description}</div>
      <div class="scenario-card-tags">
        <span class="scenario-tag tag-${s.difficulty}">${getDifficultyLabel(s.difficulty)}</span>
        <span class="scenario-tag tag-industry">${getIndustryLabel(s.industry)}</span>
      </div>
    </div>
  `).join('');
}

function filterScenarios(filter, btn) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderScenarios(filter);
}

function getDifficultyLabel(d) {
  return { beginner: '初級', intermediate: '中級', advanced: '上級' }[d] || d;
}

function getIndustryLabel(i) {
  return { it: 'IT業界', finance: '金融', retail: '小売' }[i] || i;
}

// ========================================
// 会話画面
// ========================================

function startScenario(scenarioId) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) return;

  appState.currentScenario = JSON.parse(JSON.stringify(scenario));
  appState.messages = [];
  appState.metrics = { angerLevel: 3, trustLevel: 5, progressLevel: 4 };
  appState.currentEmotion = 'neutral';
  appState.conversationStep = 0;
  appState.chatLogExpanded = false;

  // ヘッダー情報を設定
  document.getElementById('convScenarioTitle').textContent = scenario.title;
  document.getElementById('convDifficulty').textContent = getDifficultyLabel(scenario.difficulty);
  document.getElementById('avatarNpcName').textContent = scenario.npcName;

  // ゴールを描画
  renderGoals();

  // シナリオ情報バーを設定
  populateScenarioInfoBar(scenario);

  // メトリクスを初期化
  updateMetricsDisplay();

  // アバター表情をリセット
  updateAvatarEmotion('neutral');

  // チャットログをクリア
  document.getElementById('chatLogMessages').innerHTML = '';

  // コーチングバーをリセット
  document.getElementById('coachingBar').hidden = true;

  // ページ遷移
  navigateToConversation();

  // 初回NPCメッセージを少し遅延して表示
  setTimeout(() => {
    addNpcMessage('お忙しいところお時間いただきありがとうございます。本日はどのようなご提案でしょうか？');
  }, 800);
}

function navigateToConversation() {
  appState.currentPage = 'conversation';
  document.querySelectorAll('.page').forEach(p => p.hidden = true);
  document.getElementById('page-conversation').hidden = false;
  document.getElementById('globalNav').style.display = 'none';
  document.getElementById('textInput').focus();
}

function renderGoals() {
  const list = document.getElementById('goalsList');
  list.innerHTML = appState.currentScenario.goals.map(g => {
    const progress = g.progress || 0;
    const achieved = g.achieved;
    return `
    <div class="goal-item ${achieved ? 'achieved' : ''}" id="goal-${g.id}" role="listitem">
      <div class="goal-item-header">
        <span class="goal-check">${achieved ? '✅' : '⬜'}</span>
        <span class="goal-item-text">${g.text}</span>
        <span class="goal-progress-pct">${progress}%</span>
      </div>
      <div class="goal-progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100" aria-label="${g.text}の進捗">
        <div class="goal-progress-fill" style="width: ${progress}%"></div>
      </div>
    </div>
    `;
  }).join('');
}

// ========================================
// メッセージ送受信
// ========================================

function sendMessage() {
  const input = document.getElementById('textInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  addUserMessage(text);

  // NPCの応答をシミュレート
  simulateNpcResponse(text);
}

function addUserMessage(text) {
  appState.messages.push({ sender: 'user', text });
  appendChatMessage('user', text);
}

function addNpcMessage(text) {
  appState.messages.push({ sender: 'npc', text });
  appendChatMessage('npc', text);

  // 発話アニメーション
  startSpeakingAnimation();
  setTimeout(() => stopSpeakingAnimation(), 2000 + text.length * 30);
}

function appendChatMessage(sender, text) {
  const container = document.getElementById('chatLogMessages');
  const avatar = sender === 'npc'
    ? (appState.currentScenario ? appState.currentScenario.npcAvatar : '👤')
    : '🧑';

  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${sender}`;
  msgEl.innerHTML = `
    <div class="msg-avatar-small">${avatar}</div>
    <div class="msg-content">${escapeHtml(text)}</div>
  `;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;

  // スクリーンリーダー通知
  announceToScreenReader(
    sender === 'npc'
      ? `${appState.currentScenario?.npcName || 'NPC'}：${text}`
      : `あなた：${text}`
  );
}

// ========================================
// NPC応答シミュレーション
// ========================================

function simulateNpcResponse(userText) {
  // タイピング中の表示
  document.getElementById('inputHint').textContent = `${appState.currentScenario.npcName}が考えています...`;

  setTimeout(() => {
    document.getElementById('inputHint').textContent = '';

    // ステップに応じた応答とメトリクス変化
    const step = appState.conversationStep;
    appState.conversationStep++;

    let response = '';
    let metricsChange = {};
    let goalAchieved = null;

    if (step === 0) {
      response = 'なるほど、業務効率化ですか。具体的にはどのような課題を解決できるのでしょうか？';
      metricsChange = { trustLevel: 1 };
      goalAchieved = { id: 'g1', progress: 40 };
    } else if (step === 1) {
      response = 'それは興味深いですね。ただ、導入コストが気になります。予算的にはどの程度を見込めばよいでしょうか？';
      metricsChange = { trustLevel: 1, progressLevel: 1 };
      goalAchieved = { id: 'g1', progress: 80 };
      // コーチングヒント（analysis）
      showCoachingHint('ヒアリングが順調です。具体的な数値を交えて回答すると信頼度が上がります。');
    } else if (step === 2) {
      response = 'コスト面は理解しました。他社での導入実績はありますか？具体的な成果があれば教えてください。';
      metricsChange = { trustLevel: 1, progressLevel: 1, angerLevel: -1 };
      goalAchieved = { id: 'g1', progress: 100, achieved: true };
      // 2つ目のゴールも進捗
      updateGoalProgress('g2', 30);
    } else if (step === 3) {
      response = '実績があるのは心強いですね。一度、デモを見せていただくことは可能でしょうか？来週あたりでお時間をいただけると助かります。';
      metricsChange = { trustLevel: 2, progressLevel: 2, angerLevel: -1 };
      goalAchieved = { id: 'g2', progress: 100, achieved: true };
      updateGoalProgress('g3', 60);
      showCoachingHint('製品メリットの訴求が効果的でした。クロージングに向けて具体的な日程を提案しましょう。');
      // コンプライアンスアラートのデモ（step 3で表示）
      showComplianceAlert({
        severity: 'low',
        message: '競合他社の具体的な社名への言及は避けてください。',
      });
    } else {
      response = 'ありがとうございます。では来週の火曜日、14時でいかがでしょうか？楽しみにしています。';
      metricsChange = { trustLevel: 1, progressLevel: 1 };
      goalAchieved = { id: 'g3', progress: 100, achieved: true };
    }

    // メトリクス更新
    updateMetrics(metricsChange);

    // ゴール進捗・達成更新
    if (goalAchieved && appState.currentScenario) {
      const goal = appState.currentScenario.goals.find(g => g.id === goalAchieved.id);
      if (goal) {
        goal.progress = goalAchieved.progress;
        if (goalAchieved.achieved) {
          goal.achieved = true;
        }
        renderGoals();
        if (goalAchieved.achieved) {
          announceToScreenReader(`ゴール達成：${goal.text}`);
        }
      }
    }

    // NPCメッセージ追加
    addNpcMessage(response);

    // すべてのゴール達成チェック
    if (appState.currentScenario && appState.currentScenario.goals.every(g => g.achieved)) {
      setTimeout(() => {
        announceToScreenReader('すべてのゴールを達成しました。セッションを終了できます。');
      }, 3000);
    }
  }, 1200 + Math.random() * 800);
}

// ========================================
// メトリクス管理
// ========================================

function updateMetrics(changes) {
  if (!changes) return;

  const m = appState.metrics;
  if (changes.angerLevel) m.angerLevel = clamp(m.angerLevel + changes.angerLevel, 0, 10);
  if (changes.trustLevel) m.trustLevel = clamp(m.trustLevel + changes.trustLevel, 0, 10);
  if (changes.progressLevel) m.progressLevel = clamp(m.progressLevel + changes.progressLevel, 0, 10);

  updateMetricsDisplay();
  updateEmotionFromMetrics();
}

function updateMetricsDisplay() {
  const m = appState.metrics;
  document.getElementById('angerBar').style.width = `${m.angerLevel * 10}%`;
  document.getElementById('trustBar').style.width = `${m.trustLevel * 10}%`;
  document.getElementById('progressBar').style.width = `${m.progressLevel * 10}%`;
  document.getElementById('angerVal').textContent = m.angerLevel;
  document.getElementById('trustVal').textContent = m.trustLevel;
  document.getElementById('progressVal').textContent = m.progressLevel;
}

function updateEmotionFromMetrics() {
  const { angerLevel, trustLevel, progressLevel } = appState.metrics;
  let emotion = 'neutral';

  if (angerLevel >= 7) emotion = 'angry';
  else if (angerLevel >= 5) emotion = 'annoyed';
  else {
    const positive = (trustLevel + progressLevel) / 2;
    if (positive >= 7) emotion = 'happy';
    else if (positive >= 5) emotion = 'satisfied';
  }

  if (emotion !== appState.currentEmotion) {
    const prev = appState.currentEmotion;
    appState.currentEmotion = emotion;
    updateAvatarEmotion(emotion);
    announceToScreenReader(`NPCの感情が${getEmotionLabel(prev)}から${getEmotionLabel(emotion)}に変化しました`);
  }
}

function updateAvatarEmotion(emotion) {
  const face = document.getElementById('avatarFaceV2');
  face.classList.remove('happy', 'satisfied', 'neutral', 'annoyed', 'angry');
  face.classList.add(emotion);
}

function getEmotionLabel(e) {
  return { happy: '喜び', satisfied: '満足', neutral: '普通', annoyed: '不満', angry: '怒り' }[e] || e;
}

// ========================================
// 発話アニメーション
// ========================================

function startSpeakingAnimation() {
  appState.isSpeaking = true;
  document.getElementById('avatarFaceV2').classList.add('speaking');
  document.getElementById('speakingIndicatorV2').hidden = false;
}

function stopSpeakingAnimation() {
  appState.isSpeaking = false;
  document.getElementById('avatarFaceV2').classList.remove('speaking');
  document.getElementById('speakingIndicatorV2').hidden = true;
}

// ========================================
// マイク制御
// ========================================

function toggleMic() {
  appState.isMicActive = !appState.isMicActive;
  const btn = document.getElementById('micBtn');
  const icon = document.getElementById('micIcon');
  const status = document.getElementById('micStatus');

  if (appState.isMicActive) {
    btn.classList.add('active');
    icon.textContent = '⏹️';
    status.textContent = '音声認識中...話し終わったら自動で送信されます';
    announceToScreenReader('音声認識を開始しました');

    // 模擬: 3秒後に自動テキスト入力
    appState._micTimer = setTimeout(() => {
      if (appState.isMicActive) {
        document.getElementById('textInput').value = '弊社のツールを導入いただくことで、月次レポート作成の工数を大幅に削減できます。';
        toggleMic();
        sendMessage();
      }
    }, 3000);
  } else {
    btn.classList.remove('active');
    icon.textContent = '🎤';
    status.textContent = '';
    clearTimeout(appState._micTimer);
    announceToScreenReader('音声認識を停止しました');
  }
}

// ========================================
// コーチングヒント（analysis表示）
// ========================================

function showCoachingHint(text) {
  const bar = document.getElementById('coachingBar');
  const barText = document.getElementById('coachingBarText');
  barText.textContent = text;
  bar.hidden = false;
  // アニメーション再トリガー
  bar.style.animation = 'none';
  bar.offsetHeight; // reflow
  bar.style.animation = '';
  announceToScreenReader(`コーチングヒント：${text}`);
}

// ========================================
// コンプライアンスアラート
// ========================================

function showComplianceAlert(violation) {
  const alert = document.getElementById('complianceAlert');
  const icon = document.getElementById('complianceAlertIcon');
  const label = document.getElementById('complianceAlertLabel');
  const msg = document.getElementById('complianceAlertMsg');

  // severity に応じたスタイル
  alert.classList.remove('severity-high', 'severity-medium', 'severity-low');
  alert.classList.add(`severity-${violation.severity}`);

  const severityLabels = { high: '重大', medium: '注意', low: '参考' };
  const severityIcons = { high: '🚨', medium: '⚠️', low: '💬' };

  icon.textContent = severityIcons[violation.severity] || '⚠️';
  label.textContent = `コンプライアンス ・ ${severityLabels[violation.severity] || '注意'}`;
  msg.textContent = violation.message;

  alert.hidden = false;
  announceToScreenReader(`コンプライアンス警告：${violation.message}`);

  // 自動非表示（8秒後）
  clearTimeout(appState._complianceTimer);
  appState._complianceTimer = setTimeout(() => {
    dismissComplianceAlert();
  }, 8000);
}

function dismissComplianceAlert() {
  document.getElementById('complianceAlert').hidden = true;
  clearTimeout(appState._complianceTimer);
}

// ========================================
// ゴール進捗更新
// ========================================

function updateGoalProgress(goalId, progress) {
  if (!appState.currentScenario) return;
  const goal = appState.currentScenario.goals.find(g => g.id === goalId);
  if (goal) {
    goal.progress = Math.max(goal.progress || 0, progress);
    if (progress >= 100) goal.achieved = true;
    renderGoals();
  }
}

// ========================================
// シナリオ情報バー & ドロワー
// ========================================

function populateScenarioInfoBar(scenario) {
  // シナリオオーバーレイに情報を設定
  document.getElementById('scenarioDesc').textContent = scenario.description;

  // ペルソナオーバーレイに情報を設定
  document.getElementById('personaAvatar').textContent = scenario.npcAvatar;
  document.getElementById('personaName').textContent = scenario.npcName;
  document.getElementById('personaRole').textContent = scenario.npcRole;
  document.getElementById('personaDesc').textContent = scenario.npcPersona || '';
}

function togglePersonaPanel() {
  appState.personaVisible = !appState.personaVisible;
  document.getElementById('personaOverlay').hidden = !appState.personaVisible;
}

// ========================================
// UI切替
// ========================================

function toggleMetricsPanel() {
  appState.metricsVisible = !appState.metricsVisible;
  document.getElementById('metricsOverlay').style.opacity = appState.metricsVisible ? '1' : '0';
  document.getElementById('metricsOverlay').style.pointerEvents = appState.metricsVisible ? 'auto' : 'none';
}

function toggleGoalsPanel() {
  appState.goalsVisible = !appState.goalsVisible;
  document.getElementById('goalsOverlay').hidden = !appState.goalsVisible;
}

function openAudioSettings() {
  document.getElementById('audioSettingsModal').hidden = false;
}

function closeAudioSettings() {
  document.getElementById('audioSettingsModal').hidden = true;
}

// ========================================
// セッション終了
// ========================================

function confirmExit() {
  if (appState.currentPage === 'conversation') {
    document.getElementById('exitModal').hidden = false;
  } else {
    navigateTo('home');
  }
}

function closeExitModal() {
  document.getElementById('exitModal').hidden = true;
}

function endSession() {
  closeExitModal();

  // 結果画面のデータを設定
  if (appState.currentScenario) {
    document.getElementById('resultScenarioName').textContent = appState.currentScenario.title;
    renderGoalResults();
    renderConversationReplay();
  }

  // 結果画面へ遷移
  appState.currentPage = 'result';
  document.querySelectorAll('.page').forEach(p => p.hidden = true);
  document.getElementById('page-result').hidden = false;
  document.getElementById('globalNav').style.display = 'flex';

  // スコアアニメーション
  animateScore();
  window.scrollTo(0, 0);
}

function retryScenario() {
  if (appState.currentScenario) {
    startScenario(appState.currentScenario.id);
  }
}

function animateScore() {
  const circle = document.getElementById('scoreFillCircle');
  const circumference = 2 * Math.PI * 54;
  const score = 78;
  const offset = circumference - (score / 100) * circumference;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference;

  requestAnimationFrame(() => {
    circle.style.transition = 'stroke-dashoffset 1.2s ease';
    circle.style.strokeDashoffset = offset;
  });
}

function renderGoalResults() {
  const container = document.getElementById('goalResultList');
  if (!appState.currentScenario) return;

  container.innerHTML = appState.currentScenario.goals.map(g => {
    const status = g.achieved ? 'achieved' : 'failed';
    const statusLabel = g.achieved ? '達成' : '未達成';
    return `
      <div class="goal-result-item">
        <span class="goal-result-icon">${g.achieved ? '✅' : '❌'}</span>
        <span class="goal-result-text">${g.text}</span>
        <span class="goal-result-status ${status}">${statusLabel}</span>
      </div>
    `;
  }).join('');
}

function renderConversationReplay() {
  const container = document.getElementById('conversationReplay');
  container.innerHTML = appState.messages.map(m => `
    <div class="replay-msg ${m.sender}">
      <div class="replay-bubble">${escapeHtml(m.text)}</div>
    </div>
  `).join('');
}

// ========================================
// 結果タブ切替
// ========================================

function switchResultTab(tabId, btn) {
  document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('.result-tab-content').forEach(c => c.hidden = true);
  document.getElementById(`tab-${tabId}`).hidden = false;
}

// ========================================
// 履歴画面
// ========================================

function renderHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = HISTORY_DATA.map(h => `
    <div class="history-item" onclick="navigateTo('result')" role="button" tabindex="0"
         aria-label="${h.title} ${h.date} ${h.score}点">
      <span class="history-icon">📋</span>
      <div class="history-info">
        <div class="history-title">${h.title}</div>
        <div class="history-meta">${h.date} ・ ${h.npc}</div>
      </div>
      <span class="history-score">${h.score}点</span>
    </div>
  `).join('');
}

// ========================================
// ランキング画面
// ========================================

function renderRanking() {
  const container = document.getElementById('rankingList');
  container.innerHTML = RANKING_DATA.map(r => `
    <div class="ranking-item ${r.isMe ? 'me' : ''}" aria-label="${r.rank}位 ${r.name} ${r.score}点">
      <span class="ranking-rank">${r.rank}</span>
      <div class="ranking-user">
        <div class="ranking-name">${r.name}${r.isMe ? '（あなた）' : ''}</div>
        <div class="ranking-dept">${r.dept}</div>
      </div>
      <span class="ranking-score">${r.score}点</span>
    </div>
  `).join('');
}

// ========================================
// 言語切替（モック）
// ========================================

let currentLang = 'ja';
function toggleLang() {
  currentLang = currentLang === 'ja' ? 'en' : 'ja';
  document.getElementById('langToggle').textContent = currentLang === 'ja' ? '🇯🇵' : '🇺🇸';
  announceToScreenReader(currentLang === 'ja' ? '日本語に切り替えました' : 'Switched to English');
}

// ========================================
// ユーティリティ
// ========================================

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function announceToScreenReader(message) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.className = 'sr-only';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ========================================
// 初期化
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  renderRecentSessions();
  navigateTo('home');
});

// グローバル公開
window.navigateTo = navigateTo;
window.filterScenarios = filterScenarios;
window.startScenario = startScenario;
window.sendMessage = sendMessage;
window.toggleMic = toggleMic;
window.toggleMetricsPanel = toggleMetricsPanel;
window.toggleGoalsPanel = toggleGoalsPanel;
window.openAudioSettings = openAudioSettings;
window.closeAudioSettings = closeAudioSettings;
window.confirmExit = confirmExit;
window.closeExitModal = closeExitModal;
window.endSession = endSession;
window.retryScenario = retryScenario;
window.switchResultTab = switchResultTab;
window.toggleLang = toggleLang;
window.dismissComplianceAlert = dismissComplianceAlert;
window.togglePersonaPanel = togglePersonaPanel;
