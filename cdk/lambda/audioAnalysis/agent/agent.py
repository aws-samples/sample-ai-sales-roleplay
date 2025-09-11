"""
音声分析用のStrands Agentエージェント実装

Amazon Transcribeの結果を分析して話者の役割を特定し、
構造化された出力を提供するエージェント機能。
"""

import os
import time
import random    
from strands import Agent
from strands.models import BedrockModel
from aws_lambda_powertools import Logger
from botocore.config import Config as BotocoreConfig
from typing import Dict, Any, List

from agent.types import AudioAnalysisOutput, ConversationSegment
from prompts.speaker_analysis_prompts import get_speaker_analysis_prompt

BEDROCK_MODEL_ANALYSIS = os.environ.get("BEDROCK_MODEL_ANALYSIS")
REGION = os.environ["AWS_REGION"]

# ロガー
logger = Logger(service="audioAnalysis-agent")

# Create a BedrockModel with enhanced retry configuration
boto_config = BotocoreConfig(
    retries={
        "max_attempts": 10,  # リトライ回数を増加
        "mode": "adaptive",  # アダプティブモードでより賢いリトライ
        "total_max_attempts": 10
    },
    connect_timeout=10,  # 接続タイムアウトを延長
    read_timeout=600,    # 読み取りタイムアウトを延長（10分）
)

bedrock_model = BedrockModel(
    model_id=BEDROCK_MODEL_ANALYSIS,
    region_name=REGION,
    system_prompt="日本語で回答します",
    boto_client_config=boto_config,
)

def analyze_speakers_and_roles(
    transcription_result: Dict[str, Any],
    language: str = "ja"
) -> AudioAnalysisOutput:
    """
    Amazon Transcribeの結果から話者の役割を特定する
    
    Args:
        transcription_result: Amazon Transcribeの出力結果
        language: 言語コード（ja/en）
        
    Returns:
        AudioAnalysisOutput: 構造化された分析結果
    """
    try:
        logger.info("話者役割分析を開始", extra={
            "language": language,
            "has_speaker_labels": "speaker_labels" in transcription_result.get("results", {})
        })
        
        results = transcription_result.get("results", {})
        
        # 話者ラベル情報を取得
        speaker_labels = results.get("speaker_labels", {})
        segments = speaker_labels.get("segments", [])
        
        # 転写テキスト情報を取得
        items = results.get("items", [])
        
        # 話者別の発言を整理
        speaker_utterances = {}
        conversation_segments = []
        
        # セグメントを処理
        for segment in segments:
            speaker_label = segment.get("speaker_label", "unknown")
            start_time = float(segment.get("start_time", 0))
            end_time = float(segment.get("end_time", 0))
            
            # このセグメント内の単語を取得
            segment_words = []
            for item in items:
                if item.get("type") == "pronunciation":
                    item_start = float(item.get("start_time", 0))
                    if start_time <= item_start <= end_time:
                        word_alternatives = item.get("alternatives", [])
                        if word_alternatives:
                            segment_words.append(word_alternatives[0].get("content", ""))
            
            # セグメントテキストを構築
            segment_text = " ".join(segment_words)
            
            if segment_text.strip():
                # 話者別発言履歴に追加
                if speaker_label not in speaker_utterances:
                    speaker_utterances[speaker_label] = []
                speaker_utterances[speaker_label].append(segment_text)
                
                # 会話セグメントとして記録（役割は後で設定）
                conversation_segments.append({
                    "start_time": start_time,
                    "end_time": end_time,
                    "speaker_label": speaker_label,
                    "text": segment_text,
                    "role": "unknown"  # 後で更新
                })
        
        # Strands Agentsを使用して話者の役割を特定
        speaker_analysis = _identify_speaker_roles_with_agent(
            speaker_utterances, 
            language
        )
        
        # 役割情報を会話セグメントに反映
        role_mapping = {info.speaker_label: info.identified_role for info in speaker_analysis.speakers}
        
        structured_segments = []
        for seg in conversation_segments:
            role = role_mapping.get(seg["speaker_label"], "observer")
            structured_segments.append(ConversationSegment(
                start_time=seg["start_time"],
                end_time=seg["end_time"],
                speaker_label=seg["speaker_label"],
                text=seg["text"],
                role=role
            ))
        
        # サマリー情報を生成
        summary = {
            "total_speakers": len(speaker_utterances),
            "total_segments": len(structured_segments),
            "speaker_distribution": {label: len(utterances) for label, utterances in speaker_utterances.items()},
            "dominant_speaker": max(speaker_utterances.keys(), key=lambda k: len(speaker_utterances[k])) if speaker_utterances else None
        }
        
        # 構造化された結果を作成
        result = AudioAnalysisOutput(
            speakers=speaker_analysis.speakers,
            segments=structured_segments,
            summary=summary,
            language_detected=language
        )
        
        logger.info("話者役割分析完了", extra={
            "total_speakers": len(result.speakers),
            "total_segments": len(result.segments)
        })
        
        return result
        
    except Exception as e:
        logger.error("話者役割分析エラー", extra={"error": str(e)})
        raise e

def _identify_speaker_roles_with_agent(
    speaker_utterances: Dict[str, List[str]], 
    language: str
) -> AudioAnalysisOutput:
    """
    Strands Agentsを使用して話者の役割を特定する
    
    Args:
        speaker_utterances: 話者ラベルごとの発言リスト
        language: 言語コード
        
    Returns:
        AudioAnalysisOutput: 話者情報を含む分析結果
    """
    # throttlingException対応のリトライ設定
    max_retries = 5
    base_delay = 2.0  # 基本待機時間（秒）
    
    for retry_count in range(max_retries):
        try:
            # プロンプト作成
            prompt = get_speaker_analysis_prompt(speaker_utterances, language)
            
            logger.info("Strands Agentで話者役割分析を実行", extra={
                "model_id": BEDROCK_MODEL_ANALYSIS,
                "language": language,
                "speakers_count": len(speaker_utterances),
                "retry_count": retry_count
            })
            
            # エージェント初期化（toolsは不要）
            agent = Agent(
                tools=[],
                model=bedrock_model,
            )

            # プロンプト実行
            agent(prompt)

            # 構造化出力を取得
            result = agent.structured_output(
                AudioAnalysisOutput,
                """
各話者に対してSpeakerInfoオブジェクトを生成してください。
- speaker_label: 話者ラベル（そのまま）
- identified_role: 特定した役割（salesperson/customer/observer）
- confidence: 信頼度（発言内容の特徴の明確さに基づく0.0-1.0）
- sample_utterances: 代表的な発言例（最大3つ）

AudioAnalysisOutputのspeakersフィールドにSpeakerInfoのリストを設定してください。
他のフィールド（segments, summary等）は空のままで構いません。
""",
            )
            
            logger.info("Strands Agent分析完了", extra={
                "speakers_identified": len(result.speakers),
                "retry_count": retry_count
            })
            
            return result
            
        except Exception as e:
            error_str = str(e).lower()
            
            # throttlingExceptionかどうかを判定
            if 'throttling' in error_str or 'too many requests' in error_str:
                if retry_count < max_retries - 1:
                    # 指数バックオフ + ジッターで待機時間を計算
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
                # throttling以外のエラーは即座に再発行
                logger.error("Strands Agent実行エラー", extra={
                    "error": str(e),
                    "retry_count": retry_count
                })
                raise e
    
    # ここには到達しないはずだが、安全のため
    raise Exception("予期しないエラー：リトライループを抜けました")
