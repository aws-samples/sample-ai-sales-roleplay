/**
 * VRM表情コントローラー
 * 感情状態からVRM表情へのマッピングとスムーズなトランジションを制御
 */
import { VRM } from '@pixiv/three-vrm';
import { EmotionState } from '../../types/index';
import { EMOTION_TO_VRM_EXPRESSION, ExpressionBlendEntry, VRMExpressionName } from '../../types/avatar';

// トランジション速度（1秒あたりの変化量）
const TRANSITION_SPEED = 3.0;

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

  constructor(vrm: VRM) {
    this.vrm = vrm;
    // 利用可能な表情を取得
    if (vrm.expressionManager) {
      this.availableExpressions = vrm.expressionManager.expressions.map(e => e.expressionName);
      console.log('ExpressionController: 利用可能な表情:', this.availableExpressions);
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
    this.targetExpression = mapping.expression;
    this.targetIntensity = mapping.intensity;
    this.targetBlend = mapping.blend ?? [];
    console.log(`ExpressionController: 感情設定 ${emotion} -> 表情 ${mapping.expression} (強度: ${mapping.intensity}, ブレンド: ${this.targetBlend.length}件)`);
  }

  /**
   * 毎フレーム呼び出し、表情をスムーズにトランジション
   * ※ vrm.update()より先に呼び出すこと（vrm.update()内でexpressionManager.update()が実行される）
   */
  update(deltaTime: number): void {
    if (!this.vrm.expressionManager) return;

    const step = TRANSITION_SPEED * deltaTime;

    // 表情が変わる場合、まず現在の表情をフェードアウト
    if (this.currentExpression !== this.targetExpression) {
      this.currentIntensity = Math.max(0, this.currentIntensity - step);

      if (this.currentIntensity <= 0) {
        this.currentExpression = this.targetExpression;
        this.currentIntensity = 0;
      }
    } else {
      // 同じ表情の場合、目標強度に向かってトランジション
      if (this.currentIntensity < this.targetIntensity) {
        this.currentIntensity = Math.min(this.targetIntensity, this.currentIntensity + step);
      } else if (this.currentIntensity > this.targetIntensity) {
        this.currentIntensity = Math.max(this.targetIntensity, this.currentIntensity - step);
      }
    }

    // すべての表情をリセット（ブレンド用の表情も含む）
    const resetExpressions = ['happy', 'angry', 'sad', 'relaxed', 'blink'];
    for (const exprName of resetExpressions) {
      const actualName = this.getActualExpressionName(exprName);
      if (actualName) {
        this.vrm.expressionManager.setValue(actualName, 0);
      }
    }

    // 現在の表情を適用（setValueのみ。update()はvrm.update()に任せる）
    if (this.currentExpression !== 'neutral') {
      const actualName = this.getActualExpressionName(this.currentExpression);
      if (actualName) {
        this.vrm.expressionManager.setValue(actualName, this.currentIntensity);
      }
    }

    // ブレンド表情を適用（メイン表情の強度に比例してブレンド）
    if (this.currentExpression === this.targetExpression && this.targetBlend.length > 0) {
      const blendRatio = this.targetIntensity > 0 ? this.currentIntensity / this.targetIntensity : 0;
      for (const entry of this.targetBlend) {
        const actualName = this.getActualExpressionName(entry.name);
        if (actualName) {
          this.vrm.expressionManager.setValue(actualName, entry.intensity * blendRatio);
        }
      }
    }

    // ※ expressionManager.update()はここでは呼ばない
    // vrm.update()が内部で呼び出すため、二重呼び出しを防止
  }

  /**
   * リソース解放
   */
  dispose(): void {
    // 特にリソース解放は不要
  }
}

export default ExpressionController;
