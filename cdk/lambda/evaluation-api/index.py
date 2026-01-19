"""
評価画面API Lambda関数

AgentCore MemoryとS3から評価データを取得するAPIエンドポイント。
"""

import json
import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime

import boto3
from botocore.config import Config

# ロガー設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 環境変数
AGENTCORE_RUNTIME_ARN = os.environ.get('AGENTCORE_RUNTIME_ARN')
FEEDBACK_BUCKET = os.environ.get('FEEDBACK_BUCKET')
VIDEO_BUCKET = os.environ.get('VIDEO_BUCKET')
REGION = os.environ.get('AWS_REGION', 'us-west-2')

# AWSクライアント
s3_client = boto3.client('s3')


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    評価画面API Lambdaハンドラー
    
    エンドポイント:
    - GET /evaluation/{sessionId}/history - 会話履歴取得
    - GET /evaluation/{sessionId}/metrics - メトリクス履歴取得
    - GET /evaluation/{sessionId}/feedback - フィードバック取得
    - GET /evaluation/{sessionId}/video-analysis - 動画分析結果取得
    """
    try:
        logger.info(f"評価画面API呼び出し: {json.dumps(event)}")
        
        # API Gatewayイベントからパス情報を取得
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        path_parameters = event.get('pathParameters', {}) or {}
        query_parameters = event.get('queryStringParameters', {}) or {}
        
        session_id = path_parameters.get('sessionId')
        
        if not session_id:
            return create_response(400, {
                'success': False,
                'message': 'sessionIdが必要です'
            })
        
        # エンドポイントに応じた処理
        if '/history' in path:
            return get_conversation_history(session_id, query_parameters)
        elif '/metrics' in path:
            return get_metrics_history(session_id, query_parameters)
        elif '/feedback' in path:
            return get_feedback(session_id)
        elif '/video-analysis' in path:
            return get_video_analysis(session_id)
        else:
            return create_response(404, {
                'success': False,
                'message': 'エンドポイントが見つかりません'
            })
        
    except Exception as e:
        logger.error(f"評価画面APIエラー: {e}")
        return create_response(500, {
            'success': False,
            'message': f'内部エラー: {str(e)}'
        })


def get_conversation_history(session_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """会話履歴を取得"""
    try:
        logger.info(f"会話履歴取得: session_id={session_id}")
        
        # AgentCore Memory APIを呼び出し
        # 注: 実際のAgentCore Memory APIクライアントに置き換える
        agentcore_client = boto3.client('bedrock-agent-runtime', region_name=REGION)
        
        try:
            # AgentCore Memory ListEvents呼び出し
            response = agentcore_client.list_memory_events(
                memoryId=AGENTCORE_RUNTIME_ARN,
                sessionId=session_id,
                eventType='conversation',
                maxResults=int(query_params.get('limit', '100'))
            )
            
            events = response.get('events', [])
            messages = []
            
            for event in events:
                event_data = event.get('data', {})
                messages.append({
                    'id': event.get('eventId'),
                    'sender': event_data.get('sender'),
                    'content': event_data.get('content'),
                    'timestamp': event.get('timestamp')
                })
            
            return create_response(200, {
                'success': True,
                'data': {
                    'sessionId': session_id,
                    'messages': messages,
                    'totalCount': len(messages)
                }
            })
            
        except Exception as memory_error:
            logger.warning(f"AgentCore Memory取得エラー、S3フォールバック: {memory_error}")
            # S3からフォールバック取得
            return get_history_from_s3(session_id)
        
    except Exception as e:
        logger.error(f"会話履歴取得エラー: {e}")
        return create_response(500, {
            'success': False,
            'message': f'会話履歴の取得に失敗しました: {str(e)}'
        })


def get_history_from_s3(session_id: str) -> Dict[str, Any]:
    """S3から会話履歴を取得（フォールバック）"""
    try:
        key = f"sessions/{session_id}/messages.json"
        response = s3_client.get_object(Bucket=FEEDBACK_BUCKET, Key=key)
        data = json.loads(response['Body'].read().decode('utf-8'))
        
        return create_response(200, {
            'success': True,
            'data': {
                'sessionId': session_id,
                'messages': data.get('messages', []),
                'totalCount': len(data.get('messages', []))
            }
        })
    except s3_client.exceptions.NoSuchKey:
        return create_response(404, {
            'success': False,
            'message': '会話履歴が見つかりません'
        })


def get_metrics_history(session_id: str, query_params: Dict[str, str]) -> Dict[str, Any]:
    """メトリクス履歴を取得"""
    try:
        logger.info(f"メトリクス履歴取得: session_id={session_id}")
        
        agentcore_client = boto3.client('bedrock-agent-runtime', region_name=REGION)
        
        try:
            response = agentcore_client.list_memory_events(
                memoryId=AGENTCORE_RUNTIME_ARN,
                sessionId=session_id,
                eventType='metrics',
                maxResults=int(query_params.get('limit', '100'))
            )
            
            events = response.get('events', [])
            metrics = []
            
            for event in events:
                event_data = event.get('data', {})
                metrics.append({
                    'timestamp': event.get('timestamp'),
                    'angerLevel': event_data.get('angerLevel'),
                    'trustLevel': event_data.get('trustLevel'),
                    'progressLevel': event_data.get('progressLevel'),
                    'analysis': event_data.get('analysis')
                })
            
            # 最終メトリクスを計算
            final_metrics = None
            if metrics:
                final_metrics = metrics[-1]
            
            return create_response(200, {
                'success': True,
                'data': {
                    'sessionId': session_id,
                    'metricsHistory': metrics,
                    'finalMetrics': final_metrics,
                    'totalCount': len(metrics)
                }
            })
            
        except Exception as memory_error:
            logger.warning(f"AgentCore Memory取得エラー、S3フォールバック: {memory_error}")
            return get_metrics_from_s3(session_id)
        
    except Exception as e:
        logger.error(f"メトリクス履歴取得エラー: {e}")
        return create_response(500, {
            'success': False,
            'message': f'メトリクス履歴の取得に失敗しました: {str(e)}'
        })


def get_metrics_from_s3(session_id: str) -> Dict[str, Any]:
    """S3からメトリクス履歴を取得（フォールバック）"""
    try:
        key = f"sessions/{session_id}/metrics.json"
        response = s3_client.get_object(Bucket=FEEDBACK_BUCKET, Key=key)
        data = json.loads(response['Body'].read().decode('utf-8'))
        
        metrics = data.get('metricsHistory', [])
        final_metrics = metrics[-1] if metrics else None
        
        return create_response(200, {
            'success': True,
            'data': {
                'sessionId': session_id,
                'metricsHistory': metrics,
                'finalMetrics': final_metrics,
                'totalCount': len(metrics)
            }
        })
    except s3_client.exceptions.NoSuchKey:
        return create_response(404, {
            'success': False,
            'message': 'メトリクス履歴が見つかりません'
        })


def get_feedback(session_id: str) -> Dict[str, Any]:
    """フィードバックを取得"""
    try:
        logger.info(f"フィードバック取得: session_id={session_id}")
        
        # S3からフィードバックを取得
        key = f"sessions/{session_id}/feedback.json"
        
        try:
            response = s3_client.get_object(Bucket=FEEDBACK_BUCKET, Key=key)
            feedback_data = json.loads(response['Body'].read().decode('utf-8'))
            
            return create_response(200, {
                'success': True,
                'data': {
                    'sessionId': session_id,
                    'feedback': feedback_data
                }
            })
            
        except s3_client.exceptions.NoSuchKey:
            return create_response(404, {
                'success': False,
                'message': 'フィードバックが見つかりません'
            })
        
    except Exception as e:
        logger.error(f"フィードバック取得エラー: {e}")
        return create_response(500, {
            'success': False,
            'message': f'フィードバックの取得に失敗しました: {str(e)}'
        })


def get_video_analysis(session_id: str) -> Dict[str, Any]:
    """動画分析結果を取得"""
    try:
        logger.info(f"動画分析結果取得: session_id={session_id}")
        
        # S3から動画分析結果を取得
        key = f"sessions/{session_id}/video-analysis.json"
        
        try:
            response = s3_client.get_object(Bucket=FEEDBACK_BUCKET, Key=key)
            video_analysis = json.loads(response['Body'].read().decode('utf-8'))
            
            # 動画URLを生成（署名付きURL）
            video_key = f"recordings/{session_id}.mp4"
            try:
                video_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': VIDEO_BUCKET, 'Key': video_key},
                    ExpiresIn=3600  # 1時間有効
                )
            except Exception:
                video_url = None
            
            return create_response(200, {
                'success': True,
                'data': {
                    'sessionId': session_id,
                    'videoAnalysis': video_analysis,
                    'videoUrl': video_url
                }
            })
            
        except s3_client.exceptions.NoSuchKey:
            return create_response(404, {
                'success': False,
                'message': '動画分析結果が見つかりません'
            })
        
    except Exception as e:
        logger.error(f"動画分析結果取得エラー: {e}")
        return create_response(500, {
            'success': False,
            'message': f'動画分析結果の取得に失敗しました: {str(e)}'
        })


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """API Gatewayレスポンスを作成"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,OPTIONS'
        },
        'body': json.dumps(body, ensure_ascii=False, default=str)
    }
