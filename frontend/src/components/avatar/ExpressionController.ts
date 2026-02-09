/**
 * VRM表情コントローラー
 * 感情状態からVRM表情へのマッピングとスムーズなトランジションを制御
 */
import { VRM } from '@pixiv/three-vrm';
import { EmotionState } from '../../types/index';
import { EMOTION_TO_VRM_EXPRESSION, ExpressionBlendEntry, VRMExpressionName } from '../../types/avatar';

// トランジション速度（1秒あたりの変化量）- デフォルト
const DEFAULT_TRANSITION_SPEED = 3.0;

// 感情種類に応じたトランジション速度
const EMOTION_TRANSITION_SPEEDS: Record<string, number> = {
  angry: 5.0,    // 急激な感情変化 → 高速
  sad: 2.0,      // 穏やかな感情変化 → 低速
  happy: 3.5,    // やや速め
  relaxed: 2.0,  // 穏やか → 低速
  neutral: 3.0,  // 標準
};

// 感情間の中間状態マッピング（自然なトランジション経路）
// 中間状態が必要なケースのみ定義。未定義は直接トランジション。
const EMOTION_TRANSITION_PATH: Partial<Record<string, Partial<Record<string, string>>>> = {
  neutral: { happy: 'relaxed' },
  happy: { sad: 'neutral' },
  angry: { relaxed: 'neutral' },
  sad: { happy: 'neutral', relaxed: 'neutral' },
  relaxed: { angry: 'neutral', sad: 'neutral' },
};

// VRM表情名のマッピング（VRoid Studio / VRM 1.0対応）
// VRoid Studioで作成されたモデルは異なる表情名を使用することがある
const EXPRESSION_NAME_MAP: Record<string, string[]> = {
  happy: ['happy', 'Joy', 'joy', 'Happy', 'smile', 'Smile'],
  angry: ['angry', 'Angry', 'anger', 'Anger'],
  sad: ['sad', 'Sad', 'sorrow', 'Sorrow'],
  relaxed: ['relaxed', 'Relaxed', 'neutral', 'Neutral'],
  surprised: ['surprised', 'Surprised', 'surprise', 'Surprise'],
};

export class ExpressionController {
  private vrm: VRM;
  private currentExpression: VRMExpressionName = 'neutral';
  private currentIntensity: number = 0;
  private targetExpression: VRMExpressionName = 'neutral';
  private targetIntensity: number = 0;
  private targetBlend: ExpressionBlendEntry[] = [];
  private availableExpressions: string[] = [];
  // 中間状態トランジション用
  private intermediateExpression: VRMExpressionName | null = null;
  private transitionPhase: 'direct' | 'fadeOut' | 'intermediate' | 'fadeIn' = 'direct';
  // 変更検知用
  private isDirty: boolean = true;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    // 利用可能な表情を取得
    if (vrm.expressionManager) {
      this.availableExpressions = vrm.expressionManager.expressions.map(e => e.expressionName);
    }
  }

  /**
   * 実際に使用可能な表情名を取得
   */
  private getActualExpressionName(targetName: string): string | null {
    // まず直接マッチを試す
    if (this.availableExpressions.includes(targetName)) {
      return targetName;
    }

    // マッピングから探す
    const candidates = EXPRESSION_NAME_MAP[targetName] || [targetName];
    for (const candidate of candidates) {
      if (this.availableExpressions.includes(candidate)) {
        return candidate;
      }
    }

    // 部分一致で探す（大文字小文字を無視）
    const lowerTarget = targetName.toLowerCase();
    for (const expr of this.availableExpressions) {
      if (expr.toLowerCase().includes(lowerTarget) || lowerTarget.includes(expr.toLowerCase())) {
        return expr;
      }
    }

    console.warn(`ExpressionController: 表情 "${targetName}" が見つかりません`);
    return null;
  }

  /**
   * 感情状態を設定
   */
  setEmotion(emotion: EmotionState): void {
    const mapping = EMOTION_TO_VRM_EXPRESSION[emotion];
    const previousExpression = this.targetExpression;
    this.targetExpression = mapping.expression;
    this.targetIntensity = mapping.intensity;
    this.targetBlend = mapping.blend ?? [];
    this.isDirty = true;

    // デバッグログ: 表情変更の追跡
    if (process.env.NODE_ENV === 'development') {
      const actualName = this.getActualExpressionName(mapping.expression);
      console.log(
        `ExpressionController: setEmotion("${emotion}") → expression="${mapping.expression}"(actual="${actualName}"), intensity=${mapping.intensity}, blend=${JSON.stringify(mapping.blend ?? [])}, availableExpressions=[${this.availableExpressions.join(', ')}]`
      );
    }

    // 中間状態トランジションの判定
    if (previousExpression !== mapping.expression && previousExpression !== 'neutral') {
      const paths = EMOTION_TRANSITION_PATH[previousExpression];
      const intermediate = paths?.[mapping.expression];
      if (intermediate) {
        this.intermediateExpression = intermediate as VRMExpressionName;
        this.transitionPhase = 'fadeOut';
      } else {
        this.intermediateExpression = null;
        this.transitionPhase = 'direct';
      }
    } else {
      this.intermediateExpression = null;
      this.transitionPhase = 'direct';
    }
  }

  /**
   * 毎フレーム呼び出し、表情をスムーズにトランジション
   * ※ vrm.update()より先に呼び出すこと（vrm.update()内でexpressionManager.update()が実行される）
   */
  update(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    // 変更がなく、ターゲットに到達済みならスキップ
    if (!this.isDirty && this.currentExpression === this.targetExpression &&
      Math.abs(this.currentIntensity - this.targetIntensity) < 0.001) {
      return;
    }

    // 感情種類に応じたトランジション速度を取得
    const speed = EMOTION_TRANSITION_SPEEDS[this.targetExpression] || DEFAULT_TRANSITION_SPEED;
    const step = speed * deltaTime;

    // 中間状態トランジション処理
    if (this.intermediateExpression && this.transitionPhase !== 'direct') {
      this.updateIntermediateTransition(step);
    } else {
      // 直接トランジション（従来のロジック）
      this.updateDirectTransition(step);
    }

    // すべての表情をリセット（ブレンド用の表情も含む）
    const resetExpressions = ['happy', 'angry', 'sad', 'relaxed', 'blink'];
    for (const exprName of resetExpressions) {
      const actualName = this.getActualExpressionName(exprName);
      if (actualName) {
        this.vrm.expressionManager.setValue(actualName, 0);
      }
    }

    // 現在の表情を適用
    if (this.currentExpression !== 'neutral') {
      const actualName = this.getActualExpressionName(this.currentExpression);
      if (actualName) {
        this.vrm.expressionManager.setValue(actualName, this.currentIntensity);
      }
    }

    // ブレンド表情を適用
    if (this.currentExpression === this.targetExpression && this.targetBlend.length > 0) {
      const blendRatio = this.targetIntensity > 0 ? this.currentIntensity / this.targetIntensity : 0;
      for (const entry of this.targetBlend) {
        const actualName = this.getActualExpressionName(entry.name);
        if (actualName) {
          this.vrm.expressionManager.setValue(actualName, entry.intensity * blendRatio);
        }
      }
    }

    // ターゲットに到達したらdirtyフラグをクリア
    if (this.currentExpression === this.targetExpression &&
      Math.abs(this.currentIntensity - this.targetIntensity) < 0.001) {
      this.isDirty = false;
    }
  }

  /**
   * 中間状態を経由するトランジション
   */
  private updateIntermediateTransition(step: number): void {
    if (this.transitionPhase === 'fadeOut') {
      // 現在の表情をフェードアウト
      this.currentIntensity = Math.max(0, this.currentIntensity - step);
      if (this.currentIntensity <= 0) {
        // 中間状態に切り替え
        this.currentExpression = this.intermediateExpression!;
        this.transitionPhase = 'intermediate';
      }
    } else if (this.transitionPhase === 'intermediate') {
      // 中間状態を短時間表示
      this.currentIntensity = Math.min(0.4, this.currentIntensity + step);
      if (this.currentIntensity >= 0.4) {
        // ターゲットへのフェードイン開始
        this.transitionPhase = 'fadeIn';
      }
    } else if (this.transitionPhase === 'fadeIn') {
      // 中間状態からフェードアウトしてターゲットへ
      this.currentIntensity = Math.max(0, this.currentIntensity - step);
      if (this.currentIntensity <= 0) {
        this.currentExpression = this.targetExpression;
        this.currentIntensity = 0;
        this.intermediateExpression = null;
        this.transitionPhase = 'direct';
      }
    }
  }

  /**
   * 直接トランジション（従来のロジック）
   */
  private updateDirectTransition(step: number): void {
    if (this.currentExpression !== this.targetExpression) {
      this.currentIntensity = Math.max(0, this.currentIntensity - step);
      if (this.currentIntensity <= 0) {
        this.currentExpression = this.targetExpression;
        this.currentIntensity = 0;
      }
    } else {
      if (this.currentIntensity < this.targetIntensity) {
        this.currentIntensity = Math.min(this.targetIntensity, this.currentIntensity + step);
      } else if (this.currentIntensity > this.targetIntensity) {
        this.currentIntensity = Math.max(this.targetIntensity, this.currentIntensity - step);
      }
    }
  }

  /**
   * 現在の表情ブレンドで使用中のblink値を取得
   * AnimationControllerが瞬きアニメーションと競合しないようにするため
   */
  getExpressionBlinkValue(): number {
    // ターゲット表情に到達していない場合は0
    if (this.currentExpression !== this.targetExpression) return 0;
    if (this.targetBlend.length === 0) return 0;

    const blinkEntry = this.targetBlend.find(e => e.name === 'blink');
    if (!blinkEntry) return 0;

    const blendRatio = this.targetIntensity > 0 ? this.currentIntensity / this.targetIntensity : 0;
    return blinkEntry.intensity * blendRatio;
  }

  /**
   * リソース解放
   */
  dispose(): void {
    // 特にリソース解放は不要
  }
}

export default ExpressionController;
