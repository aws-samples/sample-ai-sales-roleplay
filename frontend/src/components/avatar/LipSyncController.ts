/**
 * リップシンクコントローラー
 * Phase 2: Visemeベースの母音リップシンク（Polly Speech Marks連携）
 * Phase 1フォールバック: 音量ベースのリップシンク
 */
import { VRM } from '@pixiv/three-vrm';
import { VisemeData, POLLY_VISEME_TO_VOWEL } from '../../types/avatar';

// 口形状のトランジション速度
const MOUTH_TRANSITION_SPEED = 12.0;
// Phase 1フォールバック用設定
const VOLUME_THRESHOLD = 0.01;
const MAX_MOUTH_OPEN = 0.8;

// VRM母音ブレンドシェイプ名
const VOWEL_BLEND_SHAPES: Record<VisemeData['value'], string> = {
  a: 'aa',
  i: 'ih',
  u: 'ou',
  e: 'ee',
  o: 'oh',
  sil: '',
};

export class LipSyncController {
  private vrm: VRM;
  // Phase 2: Visemeベース
  private visemeData: VisemeData[] = [];
  private visemeStartTime: number = 0;
  private isVisemePlaying: boolean = false;
  private currentVisemeIndex: number = 0;
  // 現在の各母音の強度
  private currentValues: Record<string, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private targetValues: Record<string, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

  // Phase 1フォールバック: 音量ベース
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private dataArray: Uint8Array | null = null;
  private currentMouthOpen: number = 0;
  private isConnected: boolean = false;
  private useVisemeMode: boolean = false;
  private mutationObserver: MutationObserver | null = null;

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  /**
   * Visemeデータを設定してvisemeモードを有効化
   */
  setVisemeData(rawVisemes: Array<{ time: number; type: string; value: string }>): void {
    // Polly visemeを日本語母音に変換
    this.visemeData = rawVisemes.map(v => ({
      time: v.time,
      value: POLLY_VISEME_TO_VOWEL[v.value] || 'sil',
    }));
    this.currentVisemeIndex = 0;
    this.useVisemeMode = true;
  }

  /**
   * Viseme再生を開始（音声再生開始と同時に呼び出す）
   */
  startVisemePlayback(): void {
    if (this.visemeData.length === 0) return;
    this.visemeStartTime = performance.now();
    this.isVisemePlaying = true;
    this.currentVisemeIndex = 0;
  }

  /**
   * Viseme再生を停止
   */
  stopVisemePlayback(): void {
    this.isVisemePlaying = false;
    this.visemeData = [];
    this.currentVisemeIndex = 0;
    // すべての口形状をリセット
    this.targetValues = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  }

  /**
   * AudioServiceから音声要素を取得して接続（Phase 1フォールバック）
   */
  connectToAudioService(): void {
    if (this.isConnected) return;
    try {
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.setupAudioMonitoring();
      this.isConnected = true;
    } catch (error) {
      console.error('LipSyncController: 接続エラー:', error);
    }
  }

  private setupAudioMonitoring(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLAudioElement) {
            this.connectToAudioElement(node);
          }
        });
      });
    });
    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('audio').forEach((audio) => {
      this.connectToAudioElement(audio);
    });
  }

  private connectToAudioElement(audioElement: HTMLAudioElement): void {
    if (!this.audioContext || !this.analyser) return;
    try {
      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch {
      // 既に接続済みの場合はエラーになるが無視
    }
  }

  /**
   * 毎フレーム呼び出し、口形状を更新
   */
  update(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    if (this.useVisemeMode && this.isVisemePlaying) {
      this.updateVisemeMode(deltaTime);
    } else {
      this.updateVolumeMode(deltaTime);
    }
  }

  /**
   * Phase 2: Visemeベースの口形状更新
   */
  private updateVisemeMode(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    const elapsed = performance.now() - this.visemeStartTime;

    // 現在のvisemeを特定
    while (
      this.currentVisemeIndex < this.visemeData.length - 1 &&
      this.visemeData[this.currentVisemeIndex + 1].time <= elapsed
    ) {
      this.currentVisemeIndex++;
    }

    // 再生完了チェック: 最後のvisemeから一定時間経過したら終了
    const lastViseme = this.visemeData[this.visemeData.length - 1];
    if (this.currentVisemeIndex >= this.visemeData.length - 1 && elapsed > lastViseme.time + 200) {
      this.stopVisemePlayback();
      return;
    }

    const currentViseme = this.visemeData[this.currentVisemeIndex];

    // ターゲット値をリセット
    this.targetValues = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    // 現在のvisemeに対応するブレンドシェイプをターゲットに設定
    if (currentViseme.value !== 'sil') {
      const blendShape = VOWEL_BLEND_SHAPES[currentViseme.value];
      if (blendShape) {
        this.targetValues[blendShape] = 0.8;
      }
    }

    // スムーズにトランジション
    const step = MOUTH_TRANSITION_SPEED * deltaTime;
    for (const key of Object.keys(this.currentValues)) {
      const target = this.targetValues[key] || 0;
      if (this.currentValues[key] < target) {
        this.currentValues[key] = Math.min(target, this.currentValues[key] + step);
      } else {
        this.currentValues[key] = Math.max(target, this.currentValues[key] - step);
      }
      this.vrm.expressionManager!.setValue(key, this.currentValues[key]);
    }
  }

  /**
   * Phase 1フォールバック: 音量ベースの口形状更新
   */
  private updateVolumeMode(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    let targetMouthOpen = 0;
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      const average = sum / this.dataArray.length / 255;
      if (average > VOLUME_THRESHOLD) {
        targetMouthOpen = Math.min(average * 3, MAX_MOUTH_OPEN);
      }
    }

    const speed = targetMouthOpen > this.currentMouthOpen ? 15.0 : 10.0;
    if (this.currentMouthOpen < targetMouthOpen) {
      this.currentMouthOpen = Math.min(targetMouthOpen, this.currentMouthOpen + speed * deltaTime);
    } else {
      this.currentMouthOpen = Math.max(targetMouthOpen, this.currentMouthOpen - speed * deltaTime);
    }
    this.vrm.expressionManager.setValue('aa', this.currentMouthOpen);
  }

  /**
   * 音声接続を解除
   */
  disconnect(): void {
    this.stopVisemePlayback();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
    this.dataArray = null;
    this.isConnected = false;
  }

  /**
   * リソース解放
   */
  dispose(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.disconnect();
  }
}

export default LipSyncController;
