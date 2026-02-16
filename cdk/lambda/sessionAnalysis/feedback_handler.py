"""
フィードバック生成Lambda関数

Strands Agentsのstructured outputを使用してセッションの詳細フィードバックを生成します。
"""

import os
import time
import random
from strands import Agent
from strands.models import BedrockModel
from aws_lambda_powertools import Logger
from typing import Dict, Any, List
from decimal import Decimal
from botocore.config import Config as BotocoreConfig

from feedback_types import FeedbackOutput
from prompts import build_feedback_prompt, get_structured_output_prompt, create_default_feedback

# ロガー設定
logger = Logger(service="session-analysis-feedback")

# 環境変数
BEDROCK_MODEL_FEEDBACK = os.environ.get("BEDROCK_MODEL_FEEDBACK", "global.anthropic.claude-sonnet-4-5-20250929-v1:0")
REGION = os.environ.get("AWS_REGION", "us-west-2")

# Bedrockモデル設定（リトライ設定付き）
boto_config = BotocoreConfig(
    retries={
        "max_attempts": 10,
        "mode": "adaptive",
        "total_max_attempts": 10
    },
    connect_timeout=10,
    read_timeout=600,
)

bedrock_model = BedrockModel(
    model_id=BEDROCK_MODEL_FEEDBACK,
    region_name=REGION,
    boto_client_config=boto_config,
)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    フィードバック生成ハンドラー
    
    Args:
        event: Step Functions入力（start_handlerからの出力）
            
    Returns:
        生成されたフィードバックデータ
    """
    try:
        session_id = event.get("sessionId")
        messages = event.get("messages", [])
        final_metrics = event.get("finalMetrics", {})
        scenario_goals = event.get("scenarioGoals", [])
        language = event.get("language", "ja")
        
        logger.info("フィードバック生成開始", extra={
            "session_id": session_id,
            "messages_count": len(messages),
            "language": language
        })
        
        # フィードバック生成
        feedback_data = generate_feedback_with_strands(
            session_id=session_id,
            metrics=final_metrics,
            messages=messages,
            scenario_goals=scenario_goals,
            language=language
        )
        
        logger.info("フィードバック生成完了", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
        # 元のイベントデータにフィードバックを追加して返す
        return {
            **event,
            "feedbackData": feedback_data,
            "feedbackGenerated": True
        }
        
    except Exception as e:
        logger.exception("フィードバック生成エラー", extra={"error": str(e)})
        # エラー時も処理を継続（デフォルトフィードバックで進む）
        return {
            **event,
            "feedbackData": create_default_feedback(event.get("language", "ja")),
            "feedbackGenerated": False,
            "feedbackError": str(e)
        }


def generate_feedback_with_strands(
    session_id: str,
    metrics: Dict[str, Any],
    messages: List[Dict[str, Any]],
    scenario_goals: List[Dict[str, Any]],
    language: str
) -> Dict[str, Any]:
    """Strands Agentsを使用してフィードバックを生成"""
    
    # throttlingException対応のリトライ設定
    max_retries = 5
    base_delay = 2.0
    
    for retry_count in range(max_retries):
        try:
            # プロンプト作成
            prompt = build_feedback_prompt(metrics, messages, scenario_goals, language)
            
            logger.info("Strands Agentでフィードバック生成を実行", extra={
                "model_id": BEDROCK_MODEL_FEEDBACK,
                "language": language,
                "messages_count": len(messages),
                "retry_count": retry_count
            })
            
            # エージェント初期化
            agent = Agent(
                tools=[],
                model=bedrock_model,
            )
            
            # プロンプト実行
            agent(prompt)
            
            # 構造化出力を取得
            structured_prompt = get_structured_output_prompt(language)
            result: FeedbackOutput = agent.structured_output(
                FeedbackOutput,
                structured_prompt,
            )
            
            logger.info("Strands Agent分析完了", extra={
                "overall_score": result.scores.overall,
                "retry_count": retry_count
            })
            
            # Pydanticモデルを辞書に変換
            return result.model_dump()
            
        except Exception as e:
            error_str = str(e).lower()
            
            # throttlingExceptionかどうかを判定
            if 'throttling' in error_str or 'too many requests' in error_str:
                if retry_count < max_retries - 1:
                    delay = base_delay * (2 ** retry_count) + random.uniform(0, 1)
                    logger.warning("Bedrock throttling検出 - 待機後にリトライ", extra={
                        "retry_count": retry_count,
                        "max_retries": max_retries,
                        "delay_seconds": delay,
                        "error": str(e)
                    })
                    time.sleep(delay)
                    continue
                else:
                    logger.error("最大リトライ数に達しました", extra={
                        "max_retries": max_retries,
                        "error": str(e)
                    })
                    raise Exception(f"Bedrock API throttling - 最大リトライ数({max_retries})に達しました: {str(e)}")
            else:
                logger.error("Strands Agent実行エラー", extra={
                    "error": str(e),
                    "retry_count": retry_count
                })
                raise e
    
    raise Exception("予期しないエラー：リトライループを抜けました")


def convert_decimal(obj):
    """Decimal型をJSON対応形式に変換"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    return obj
