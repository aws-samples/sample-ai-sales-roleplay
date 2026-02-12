/**
 * アニメーションコントローラー
 * 瞬き、呼吸、ジェスチャー、アイドルモーションのプロシージャルアニメーションを制御
 */
import { VRM } from '@pixiv/three-vrm';
import { GestureType } from '../../types/avatar';

// 瞬きの設定
const BLINK_MIN_INTERVAL = 2.0;
const BLINK_MAX_INTERVAL = 6.0;
const BLINK_DURATION = 0.1;

// 呼吸の設定
const BREATH_CYCLE = 4.0;
const BREATH_AMPLITUDE = 0.005;

// ジェスチャーの設定
const NOD_DURATION = 0.6; // うなずき全体の時間（秒）
const NOD_ANGLE = 0.15; // うなずきの角度（ラジアン、約8.6度）
const HEAD_TILT_DURATION = 0.8; // 首かしげ全体の時間（秒）
const HEAD_TILT_ANGLE = 0.12; // 首かしげの角度（ラジアン、約6.9度）

// アイドルモーション: 視線移動の設定
const GAZE_MIN_INTERVAL = 3.0;
const GAZE_MAX_INTERVAL = 8.0;
const GAZE_TRANSITION_SPEED = 1.5; // 視線移動速度
const GAZE_RANGE_H = 0.26; // 水平範囲（ラジアン、約15度）
const GAZE_RANGE_V = 0.17; // 垂直範囲（ラジアン、約10度）

// アイドルモーション: 体の揺れの設定
const SWAY_CYCLE_MIN = 5.0;
const SWAY_CYCLE_MAX = 10.0;
const SWAY_AMPLITUDE = 0.0087; // 約0.5度

// 発話中・ジェスチャー中のアイドルモーション抑制率
const IDLE_SUPPRESSION = 0.5;

export class AnimationController {
  private vrm: VRM;
  private isRunning: boolean = false;
  private isSpeaking: boolean = false;
  private expressionController: { getExpressionBlinkValue(): number } | null = null;

  // 瞬き用
  private nextBlinkTime: number = 0;
  private isBlinking: boolean = false;
  private blinkProgress: number = 0;

  // 呼吸用
  private breathTime: number = 0;
  private initialHipsY: number = 0;

  // ジェスチャー用
  private activeGesture: GestureType = 'none';
  private gestureProgress: number = 0;
  private gestureInitialRotationX: number = 0;
  private gestureInitialRotationZ: number = 0;

  // 視線移動用
  private nextGazeTime: number = 0;
  private currentGazeH: number = 0;
  private currentGazeV: number = 0;
  private targetGazeH: number = 0;
  private targetGazeV: number = 0;

  // 体の揺れ用
  private swayCycle: number = 7.0;
  private swayTime: number = 0;
  private initialSpineRotationZ: number = 0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.scheduleNextBlink();
    this.scheduleNextGaze();
    this.swayCycle = SWAY_CYCLE_MIN + Math.random() * (SWAY_CYCLE_MAX - SWAY_CYCLE_MIN);

    // 初期位置を保存
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (hips) {
      this.initialHipsY = hips.position.y;
    }
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (spine) {
      this.initialSpineRotationZ = spine.rotation.z;
    }

    // 初期ポーズ設定: Tポーズから自然な姿勢に変更
    this.applyInitialPose();
  }

  /**
   * Tポーズから自然な立ち姿勢に変更
   * 腕を体の横に下ろし、軽く曲げた自然なポーズを設定
   */
  private applyInitialPose(): void {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    // 上腕: 体の横に下ろす（Z軸回転）
    const leftUpperArm = humanoid.getNormalizedBoneNode('leftUpperArm');
    if (leftUpperArm) {
      leftUpperArm.rotation.z = -1.3; // 約75度下ろす（体に近づける）
    }
    const rightUpperArm = humanoid.getNormalizedBoneNode('rightUpperArm');
    if (rightUpperArm) {
      rightUpperArm.rotation.z = 1.3;
    }

    // 前腕: 軽く前方に曲げる（自然な垂れ下がり）
    const leftLowerArm = humanoid.getNormalizedBoneNode('leftLowerArm');
    if (leftLowerArm) {
      leftLowerArm.rotation.y = 0.3;
    }
    const rightLowerArm = humanoid.getNormalizedBoneNode('rightLowerArm');
    if (rightLowerArm) {
      rightLowerArm.rotation.y = -0.3;
    }

    // 肩: わずかに下げる
    const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder');
    if (leftShoulder) {
      leftShoulder.rotation.z = -0.05;
    }
    const rightShoulder = humanoid.getNormalizedBoneNode('rightShoulder');
    if (rightShoulder) {
      rightShoulder.rotation.z = 0.05;
    }
  }

  private scheduleNextBlink(): void {
    this.nextBlinkTime = BLINK_MIN_INTERVAL + Math.random() * (BLINK_MAX_INTERVAL - BLINK_MIN_INTERVAL);
  }

  private scheduleNextGaze(): void {
    this.nextGazeTime = GAZE_MIN_INTERVAL + Math.random() * (GAZE_MAX_INTERVAL - GAZE_MIN_INTERVAL);
  }

  /** 待機アニメーション開始 */
  startIdleAnimations(): void {
    this.isRunning = true;
  }

  /** 待機アニメーション停止 */
  stopIdleAnimations(): void {
    this.isRunning = false;
  }

  /** 発話状態を設定（アイドルモーション抑制用） */
  setIsSpeaking(speaking: boolean): void {
    this.isSpeaking = speaking;
  }

  /** ExpressionControllerの参照を設定（blink競合回避用） */
  setExpressionController(controller: { getExpressionBlinkValue(): number } | null): void {
    this.expressionController = controller;
  }

  /**
   * うなずきジェスチャーをトリガー
   */
  triggerNod(): void {
    if (this.activeGesture !== 'none') return; // 既にジェスチャー中
    this.activeGesture = 'nod';
    this.gestureProgress = 0;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      this.gestureInitialRotationX = head.rotation.x;
    }
  }

  /**
   * 首かしげジェスチャーをトリガー
   */
  triggerHeadTilt(): void {
    if (this.activeGesture !== 'none') return;
    this.activeGesture = 'headTilt';
    this.gestureProgress = 0;
    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (head) {
      this.gestureInitialRotationZ = head.rotation.z;
    }
  }

  /**
   * 外部からジェスチャーをトリガー
   */
  triggerGesture(gesture: GestureType): void {
    if (gesture === 'nod') {
      this.triggerNod();
    } else if (gesture === 'headTilt') {
      this.triggerHeadTilt();
    }
  }

  /** 毎フレーム呼び出し */
  update(deltaTime: number): void {
    if (!this.isRunning) return;

    this.updateBlink(deltaTime);
    this.updateBreath(deltaTime);
    this.updateGesture(deltaTime);
    this.updateGaze(deltaTime);
    this.updateSway(deltaTime);
  }

  /** 瞬きの更新 */
  private updateBlink(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    // ExpressionControllerが表情ブレンドで使用中のblink値を取得
    // （例: angry表情の目を細める効果 blink: 0.3）
    const expressionBlinkValue = this.expressionController?.getExpressionBlinkValue() ?? 0;

    if (this.isBlinking) {
      this.blinkProgress += deltaTime / BLINK_DURATION;
      if (this.blinkProgress >= 1) {
        this.isBlinking = false;
        this.blinkProgress = 0;
        // 表情ブレンドのblink値を下回らないようにする
        this.vrm.expressionManager.setValue('blink', expressionBlinkValue);
        this.scheduleNextBlink();
      } else {
        const blinkValue = this.blinkProgress < 0.5
          ? this.blinkProgress * 2
          : (1 - this.blinkProgress) * 2;
        // 瞬きアニメーション値と表情ブレンド値の大きい方を採用
        this.vrm.expressionManager.setValue('blink', Math.max(blinkValue, expressionBlinkValue));
      }
    } else {
      this.nextBlinkTime -= deltaTime;
      if (this.nextBlinkTime <= 0) {
        this.isBlinking = true;
        this.blinkProgress = 0;
      }
    }
  }

  /** 呼吸の更新 */
  private updateBreath(deltaTime: number): void {
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;

    this.breathTime += deltaTime;
    const breathOffset = Math.sin((this.breathTime / BREATH_CYCLE) * Math.PI * 2) * BREATH_AMPLITUDE;
    hips.position.y = this.initialHipsY + breathOffset;
  }

  /** ジェスチャーの更新 */
  private updateGesture(deltaTime: number): void {
    if (this.activeGesture === 'none') return;

    const head = this.vrm.humanoid?.getNormalizedBoneNode('head');
    if (!head) {
      this.activeGesture = 'none';
      return;
    }

    if (this.activeGesture === 'nod') {
      this.gestureProgress += deltaTime / NOD_DURATION;
      if (this.gestureProgress >= 1) {
        // うなずき完了、元に戻す
        head.rotation.x = this.gestureInitialRotationX;
        this.activeGesture = 'none';
      } else {
        // サイン波で下→上→下の動き（2回うなずき）
        const nodOffset = Math.sin(this.gestureProgress * Math.PI * 2) * NOD_ANGLE;
        head.rotation.x = this.gestureInitialRotationX + nodOffset;
      }
    } else if (this.activeGesture === 'headTilt') {
      this.gestureProgress += deltaTime / HEAD_TILT_DURATION;
      if (this.gestureProgress >= 1) {
        head.rotation.z = this.gestureInitialRotationZ;
        this.activeGesture = 'none';
      } else {
        // 傾けて戻す（片道）
        const tiltPhase = this.gestureProgress < 0.5
          ? this.gestureProgress * 2 // 0→1（傾ける）
          : (1 - this.gestureProgress) * 2; // 1→0（戻す）
        const tiltOffset = tiltPhase * HEAD_TILT_ANGLE;
        head.rotation.z = this.gestureInitialRotationZ + tiltOffset;
      }
    }
  }

  /** 視線移動の更新 */
  private updateGaze(deltaTime: number): void {
    // 抑制率の計算
    const suppression = (this.isSpeaking || this.activeGesture !== 'none') ? IDLE_SUPPRESSION : 1.0;

    this.nextGazeTime -= deltaTime;
    if (this.nextGazeTime <= 0) {
      // 新しい視線ターゲットを設定
      this.targetGazeH = (Math.random() * 2 - 1) * GAZE_RANGE_H * suppression;
      this.targetGazeV = (Math.random() * 2 - 1) * GAZE_RANGE_V * suppression;
      this.scheduleNextGaze();
    }

    // 現在の視線をターゲットに向かってスムーズに移動
    const step = GAZE_TRANSITION_SPEED * deltaTime;
    this.currentGazeH += Math.sign(this.targetGazeH - this.currentGazeH) * Math.min(step, Math.abs(this.targetGazeH - this.currentGazeH));
    this.currentGazeV += Math.sign(this.targetGazeV - this.currentGazeV) * Math.min(step, Math.abs(this.targetGazeV - this.currentGazeV));

    // VRM lookAtで視線を設定
    if (this.vrm.lookAt) {
      this.vrm.lookAt.yaw = (this.currentGazeH / Math.PI) * 180;
      this.vrm.lookAt.pitch = (this.currentGazeV / Math.PI) * 180;
    }
  }

  /** 体の揺れの更新 */
  private updateSway(deltaTime: number): void {
    const spine = this.vrm.humanoid?.getNormalizedBoneNode('spine');
    if (!spine) return;

    const suppression = (this.isSpeaking || this.activeGesture !== 'none') ? IDLE_SUPPRESSION : 1.0;

    this.swayTime += deltaTime;
    const swayOffset = Math.sin((this.swayTime / this.swayCycle) * Math.PI * 2) * SWAY_AMPLITUDE * suppression;
    spine.rotation.z = this.initialSpineRotationZ + swayOffset;
  }

  /** リソース解放 */
  dispose(): void {
    this.isRunning = false;
  }
}

export default AnimationController;
