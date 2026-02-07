/**
 * アニメーションコントローラー
 * 瞬きと呼吸のプロシージャルアニメーションを制御
 */
import { VRM } from '@pixiv/three-vrm';

// 瞬きの設定
const BLINK_MIN_INTERVAL = 2.0; // 最小間隔（秒）
const BLINK_MAX_INTERVAL = 6.0; // 最大間隔（秒）
const BLINK_DURATION = 0.1; // 瞬きの時間（秒）

// 呼吸の設定
const BREATH_CYCLE = 4.0; // 呼吸周期（秒）
const BREATH_AMPLITUDE = 0.005; // 呼吸の振幅（Y軸）

export class AnimationController {
  private vrm: VRM;
  private isRunning: boolean = false;

  // 瞬き用
  private nextBlinkTime: number = 0;
  private isBlinking: boolean = false;
  private blinkProgress: number = 0;

  // 呼吸用
  private breathTime: number = 0;
  private initialHipsY: number = 0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.scheduleNextBlink();

    // 初期位置を保存
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (hips) {
      this.initialHipsY = hips.position.y;
    }
  }

  /**
   * 次の瞬きをスケジュール
   */
  private scheduleNextBlink(): void {
    const interval = BLINK_MIN_INTERVAL + Math.random() * (BLINK_MAX_INTERVAL - BLINK_MIN_INTERVAL);
    this.nextBlinkTime = interval;
  }

  /**
   * 待機アニメーション開始
   */
  startIdleAnimations(): void {
    this.isRunning = true;
  }

  /**
   * 待機アニメーション停止
   */
  stopIdleAnimations(): void {
    this.isRunning = false;
  }

  /**
   * 毎フレーム呼び出し、アニメーション更新
   */
  update(deltaTime: number): void {
    if (!this.isRunning) return;

    this.updateBlink(deltaTime);
    this.updateBreath(deltaTime);
  }

  /**
   * 瞬きの更新
   */
  private updateBlink(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    if (this.isBlinking) {
      // 瞬き中
      this.blinkProgress += deltaTime / BLINK_DURATION;

      if (this.blinkProgress >= 1) {
        // 瞬き終了
        this.isBlinking = false;
        this.blinkProgress = 0;
        this.vrm.expressionManager.setValue('blink', 0);
        this.scheduleNextBlink();
      } else {
        // 瞬き中（開閉）
        const blinkValue = this.blinkProgress < 0.5
          ? this.blinkProgress * 2
          : (1 - this.blinkProgress) * 2;
        this.vrm.expressionManager.setValue('blink', blinkValue);
      }
    } else {
      // 瞬き待機中
      this.nextBlinkTime -= deltaTime;

      if (this.nextBlinkTime <= 0) {
        this.isBlinking = true;
        this.blinkProgress = 0;
      }
    }
  }

  /**
   * 呼吸の更新
   */
  private updateBreath(deltaTime: number): void {
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;

    this.breathTime += deltaTime;

    // サイン波で呼吸を表現
    const breathOffset = Math.sin((this.breathTime / BREATH_CYCLE) * Math.PI * 2) * BREATH_AMPLITUDE;
    hips.position.y = this.initialHipsY + breathOffset;
  }

  /**
   * リソース解放
   */
  dispose(): void {
    this.isRunning = false;
  }
}

export default AnimationController;
