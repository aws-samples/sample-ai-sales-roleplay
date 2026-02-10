"""
セッション分析結果関連のAPIハンドラー

通常セッションと音声分析セッションの両方に対応した
分析結果取得機能を提供します。

通常セッションの分析はStep Functionsで非同期実行されます。
AgentCore Memoryから会話履歴・メトリクスを取得します。
"""

import os
import time
import json
import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.exceptions import (
    InternalServerError, NotFoundError, BadRequestError
)
import boto3.dynamodb.conditions

from utils import get_user_id_from_event, sessions_table, messages_table, scenarios_table, dynamodb

from realtime_scoring import calculate_realtime_scores
from datetime import datetime
from decimal import Decimal


def json_serializable(obj):
    """
    オブジェクトをJSONシリアライズ可能な形式に変換する再帰関数
    datetime, Decimal, その他のシリアライズ不可能な型を処理
    """
    if obj is None:
        return None
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        # 整数の場合はintに、小数の場合はfloatに変換
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    elif isinstance(obj, dict):
        return {k: json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [json_serializable(item) for item in obj]
    elif isinstance(obj, (str, int, float, bool)):
        return obj
    elif hasattr(obj, 'isoformat'):
        # datetime以外のisoformat対応オブジェクト
        return obj.isoformat()
    else:
        # その他の型は文字列に変換
        return str(obj)

# ロガー設定
logger = Logger(service="analysis-results-handlers")

# AgentCore Memory設定
AGENTCORE_MEMORY_ID = os.environ.get('AGENTCORE_MEMORY_ID', '')
AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))

# AgentCore Memory Client（遅延初期化）
_memory_client = None


def get_memory_client():
    """AgentCore Memory Clientを取得（遅延初期化）"""
    global _memory_client
    if _memory_client is not None:
        return _memory_client
    
    if not AGENTCORE_MEMORY_ID:
        logger.warning("AGENTCORE_MEMORY_ID is not configured")
        return None
    
    try:
        from bedrock_agentcore.memory import MemoryClient
        _memory_client = MemoryClient(region_name=AWS_REGION)
        logger.info("AgentCore Memory Client initialized", extra={
            "memory_id": AGENTCORE_MEMORY_ID,
            "region": AWS_REGION
        })
        return _memory_client
    except ImportError:
        logger.warning("bedrock_agentcore package not available")
        return None
    except Exception as e:
        logger.error("Failed to create AgentCore Memory client", extra={"error": str(e)})
        return None


def get_session_data_from_memory(session_id: str, actor_id: str):
    """
    AgentCore Memoryからセッションの会話履歴を取得
    
    注意: リアルタイムメトリクスはDynamoDBに保存されるため、
    この関数では会話履歴のみを取得します。
    
    Args:
        session_id: セッションID
        actor_id: アクターID（NPC会話エージェントでは'default_user'を使用）
        
    Returns:
        list: 会話メッセージのリスト
    """
    client = get_memory_client()
    if not client or not AGENTCORE_MEMORY_ID:
        logger.warning("AgentCore Memory not available, returning empty data", extra={
            "memory_id": AGENTCORE_MEMORY_ID,
            "client_available": client is not None
        })
        return []
    
    try:
        logger.info("Fetching session data from AgentCore Memory", extra={
            "session_id": session_id,
            "actor_id": actor_id,
            "memory_id": AGENTCORE_MEMORY_ID
        })
        
        # AgentCore Memoryからイベントを取得
        # actor_idは必須パラメータ
        events = client.list_events(
            memory_id=AGENTCORE_MEMORY_ID,
            session_id=session_id,
            actor_id=actor_id,
            max_results=100,  # 十分な数のイベントを取得
        )
        
        # レスポンス形式を判定（リストまたは辞書）
        # bedrock_agentcore MemoryClientはリストを直接返す場合がある
        if isinstance(events, list):
            events_list = events
        elif isinstance(events, dict):
            events_list = events.get('events', [])
        else:
            events_list = []
        
        logger.info("AgentCore Memory list_events raw response", extra={
            "session_id": session_id,
            "response_type": type(events).__name__,
            "events_count": len(events_list),
            "first_event_keys": list(events_list[0].keys()) if events_list and isinstance(events_list[0], dict) else "empty_or_not_dict",
        })
        
        messages = []
        
        for event in events_list:
            # イベントタイプは'eventType'または'event_type'キーで取得
            event_type = event.get('eventType', event.get('event_type', ''))
            timestamp_raw = event.get('eventTimestamp', event.get('timestamp', event.get('createdAt', '')))
            event_id = event.get('eventId', event.get('event_id', ''))
            
            # timestampをISO文字列に変換（datetimeオブジェクトの場合）
            if hasattr(timestamp_raw, 'isoformat'):
                timestamp = timestamp_raw.isoformat()
            elif isinstance(timestamp_raw, (int, float)):
                # Unix timestampの場合
                from datetime import datetime, timezone
                timestamp = datetime.fromtimestamp(timestamp_raw / 1000 if timestamp_raw > 1e12 else timestamp_raw, tz=timezone.utc).isoformat()
            else:
                timestamp = str(timestamp_raw) if timestamp_raw else ''
            
            # ペイロードの取得（リストまたは辞書）
            payload = event.get('payload', {})
            
            # Strands Agents Session Managerのペイロード形式を処理
            # 形式: [{"conversational": {"content": {"text": "..."}, "role": "USER"}}]
            role_from_payload = ''
            content_text = ''
            
            if isinstance(payload, list) and len(payload) > 0:
                first_item = payload[0]
                if isinstance(first_item, dict):
                    conversational = first_item.get('conversational', {})
                    if conversational:
                        role_from_payload = conversational.get('role', '').upper()
                        content_obj = conversational.get('content', {})
                        if isinstance(content_obj, dict):
                            text_json = content_obj.get('text', '')
                            # textフィールドにはJSON文字列が入っている
                            if text_json:
                                try:
                                    parsed = json.loads(text_json)
                                    # Strands Agentsのメッセージ形式: {"message": {"role": "...", "content": [{"text": "..."}]}}
                                    message_obj = parsed.get('message', parsed)
                                    if isinstance(message_obj, dict):
                                        content_list = message_obj.get('content', [])
                                        if isinstance(content_list, list):
                                            content_text = ''.join(
                                                item.get('text', '') if isinstance(item, dict) else str(item)
                                                for item in content_list
                                            )
                                        elif isinstance(content_list, str):
                                            content_text = content_list
                                except json.JSONDecodeError:
                                    content_text = text_json
            elif isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError:
                    payload = {'content': payload}
            
            logger.debug("Processing event from AgentCore Memory", extra={
                "event_type": event_type,
                "role_from_payload": role_from_payload,
                "timestamp": timestamp,
                "event_id": event_id,
                "payload_type": type(payload).__name__,
                "content_text_preview": content_text[:100] if content_text else "empty",
            })
            
            # Strands Agents Session Managerのペイロード形式を優先的に処理
            if role_from_payload:
                if role_from_payload in ['USER', 'HUMAN']:
                    if content_text:
                        messages.append({
                            'messageId': event_id,
                            'sessionId': session_id,
                            'sender': 'user',
                            'content': content_text,
                            'timestamp': timestamp,
                        })
                elif role_from_payload in ['ASSISTANT', 'AI', 'AGENT']:
                    if content_text:
                        messages.append({
                            'messageId': event_id,
                            'sessionId': session_id,
                            'sender': 'npc',
                            'content': content_text,
                            'timestamp': timestamp,
                        })
                continue  # ペイロードから処理できた場合は次のイベントへ
            
            # 従来のイベントタイプベースの処理（フォールバック）
            event_type_lower = event_type.lower() if event_type else ''
            
            # ユーザーメッセージの判定
            if event_type_lower in ['user_message', 'usermessage', 'user', 'human', 'human_message', 'humanmessage']:
                content = _extract_content_from_payload(payload)
                if content:
                    messages.append({
                        'messageId': event_id,
                        'sessionId': session_id,
                        'sender': 'user',
                        'content': content,
                        'timestamp': timestamp,
                    })
            # アシスタント/NPCメッセージの判定
            elif event_type_lower in ['assistant_message', 'assistantmessage', 'assistant', 'ai', 'ai_message', 'aimessage', 'agent', 'agent_message']:
                content = _extract_content_from_payload(payload)
                if content:
                    messages.append({
                        'messageId': event_id,
                        'sessionId': session_id,
                        'sender': 'npc',
                        'content': content,
                        'timestamp': timestamp,
                    })
            # 汎用MESSAGEタイプの処理（roleフィールドで判定）
            elif event_type_lower in ['message', 'chat', 'conversation']:
                role = payload.get('role', payload.get('sender', '')).lower()
                content = _extract_content_from_payload(payload)
                if content:
                    if role in ['user', 'human', 'customer']:
                        messages.append({
                            'messageId': event_id,
                            'sessionId': session_id,
                            'sender': 'user',
                            'content': content,
                            'timestamp': timestamp,
                        })
                    elif role in ['assistant', 'ai', 'npc', 'agent', 'bot']:
                        messages.append({
                            'messageId': event_id,
                            'sessionId': session_id,
                            'sender': 'npc',
                            'content': content,
                            'timestamp': timestamp,
                        })
        
        # メッセージをタイムスタンプでソート
        messages.sort(key=lambda x: x.get('timestamp', ''))
        
        logger.info("Session data retrieved from AgentCore Memory", extra={
            "session_id": session_id,
            "messages_count": len(messages),
            "message_senders": [m.get('sender') for m in messages[:5]]  # 最初の5件のsenderをログ
        })
        
        return messages
        
    except Exception as e:
        logger.error("Failed to get session data from AgentCore Memory", extra={
            "error": str(e),
            "error_type": type(e).__name__,
            "session_id": session_id,
            "actor_id": actor_id
        })
        import traceback
        logger.error("Traceback", extra={"traceback": traceback.format_exc()})
        return []



def _extract_content_from_payload(payload: dict) -> str:
    """ペイロードからコンテンツを抽出"""
    if not isinstance(payload, dict):
        return str(payload) if payload else ''
    
    # 様々なキー名に対応
    for key in ['content', 'message', 'text', 'body', 'data']:
        value = payload.get(key)
        if value:
            if isinstance(value, str):
                return value
            elif isinstance(value, list):
                # Bedrockのcontent形式（リスト）に対応
                texts = []
                for item in value:
                    if isinstance(item, dict):
                        texts.append(item.get('text', ''))
                    elif isinstance(item, str):
                        texts.append(item)
                return ''.join(texts)
            elif isinstance(value, dict):
                # ネストされた構造に対応
                return value.get('text', str(value))
    
    return ''

def calculate_audio_analysis_metrics(messages, scenario_goals, session_id, language):
    """
    音声分析結果のメッセージに対してリアルタイムスコアリングを実行
    既存のrealtime_scoringモジュールを使用
    
    Args:
        messages: 音声分析から構築されたメッセージリスト
        scenario_goals: シナリオのゴール定義
        session_id: セッションID
        language: 言語設定
        
    Returns:
        dict: 最終メトリクス (angerLevel, trustLevel, progressLevel, analysis)
    """
    logger.info("音声分析メッセージのメトリクス計算開始", extra={
        "session_id": session_id,
        "messages_count": len(messages)
    })
    
    # ユーザーメッセージのみを抽出
    user_messages = [msg for msg in messages if msg.get("sender") == "user"]
    if not user_messages:
        raise InternalServerError(f"音声分析結果にユーザーメッセージが含まれていません: session_id={session_id}")
    
    # 最後のユーザーメッセージを使用してリアルタイムスコアリング実行
    last_user_message = user_messages[-1]
    previous_messages_content = []
    
    # 前のメッセージを適切な形式に変換
    for msg in messages[:-1]:
        previous_messages_content.append({
            "sender": msg.get("sender"),
            "content": msg.get("content", ""),
            "timestamp": msg.get("timestamp")
        })
    
    # 既存のリアルタイムスコアリング関数を使用
    try:
        scores = calculate_realtime_scores(
            user_input=last_user_message.get("content", ""),
            previous_messages=previous_messages_content,
            session_id=session_id,
            scenario_goals=scenario_goals or [],
            current_goal_statuses=[],  # 音声分析では初期状態
            language=language
        )
        
        logger.info("既存モジュールでスコアリング完了", extra={
            "session_id": session_id,
            "scores": scores
        })
        
        return {
            "angerLevel": scores.get("angerLevel", 1),
            "trustLevel": scores.get("trustLevel", 5),
            "progressLevel": scores.get("progressLevel", 5),
            "analysis": scores.get("analysis", f"音声分析による評価: {len(messages)}メッセージ")
        }
        
    except Exception as scoring_error:
        logger.error("既存スコアリングモジュールエラー", extra={
            "error": str(scoring_error),
            "session_id": session_id
        })
        raise InternalServerError(f"リアルタイムスコアリング処理に失敗しました: {str(scoring_error)}")

def create_goal_results_from_feedback(feedback_data, scenario_goals, session_id):
    """
    AIフィードバックデータからゴール結果を生成
    
    Args:
        feedback_data: AIが生成したフィードバックデータ
        scenario_goals: シナリオのゴール定義
        session_id: セッションID
        
    Returns:
        dict: ゴール評価結果
    """
    if not scenario_goals:
        return {
            "scenarioGoals": [],
            "goalStatuses": [],
            "goalScore": 0
        }
    
    logger.info("フィードバックからゴール結果生成開始", extra={
        "session_id": session_id,
        "goals_count": len(scenario_goals)
    })
    
    # AIフィードバックからゴール関連データを取得
    goal_achievement_score = feedback_data.get("scores", {}).get("goalAchievement", 5)
    goal_feedback = feedback_data.get("goalFeedback", {})
    
    achieved_goals = goal_feedback.get("achievedGoals", [])
    partially_achieved_goals = goal_feedback.get("partiallyAchievedGoals", [])
    missed_goals = goal_feedback.get("missedGoals", [])
    
    goal_statuses = []
    total_progress = 0
    current_time = int(time.time() * 1000)
    
    for goal in scenario_goals:
        goal_id = goal.get("id")
        goal_description = goal.get("description", "")
        
        # AIフィードバックに基づく達成度判定
        progress = 0
        achieved = False
        
        # AIが明示的に達成したゴールとして挙げている場合
        achieved_match = any(goal_description in achieved_goal for achieved_goal in achieved_goals)
        if achieved_match:
            progress = 100
            achieved = True
        else:
            # AIが部分的達成として挙げている場合
            partial_match = any(goal_description in partial_goal for partial_goal in partially_achieved_goals)
            if partial_match:
                progress = 65
                achieved = False
            else:
                # AIが未達成として挙げている場合
                missed_match = any(goal_description in missed_goal for missed_goal in missed_goals)
                if missed_match:
                    progress = 0
                    achieved = False
                else:
                    # AIの総合ゴール達成度スコアに基づく（0-10を0-100%に変換）
                    progress = max(0, min(100, goal_achievement_score * 10))
                    achieved = progress >= 80
        
        goal_status = {
            "goalId": goal_id,
            "progress": int(progress),
            "achieved": achieved,
            "achievedAt": current_time if achieved else None
        }
        
        goal_statuses.append(goal_status)
        total_progress += progress
    
    # 総合ゴールスコアを計算
    goal_score = int(total_progress / len(scenario_goals)) if scenario_goals else 0
    
    logger.info("フィードバックからゴール結果生成完了", extra={
        "session_id": session_id,
        "goal_score": goal_score,
        "achieved_goals": len([g for g in goal_statuses if g["achieved"]])
    })
    
    return {
        "scenarioGoals": scenario_goals,
        "goalStatuses": goal_statuses,
        "goalScore": goal_score
    }

def handle_audio_analysis_session(session_id: str, user_id: str, audio_analysis_item: dict):
    """
    音声分析セッション専用のデータ処理
    
    Args:
        session_id: セッションID
        user_id: ユーザーID
        audio_analysis_item: 音声分析データ
        
    Returns:
        dict: 音声分析セッション用のレスポンスデータ
    """
    try:
        logger.info("音声分析セッションデータを構築中", extra={
            "session_id": session_id,
            "user_id": user_id,
            "item_user_id": audio_analysis_item.get("userId")
        })
        
        # ユーザーの所有権を確認
        item_user_id = audio_analysis_item.get("userId")
        if item_user_id != user_id:
            logger.warning("ユーザーID不一致", extra={
                "session_id": session_id,
                "request_user_id": user_id,
                "item_user_id": item_user_id
            })
            raise NotFoundError("指定されたセッションが見つかりません")
        
        # 音声分析データを取得
        audio_analysis_data = audio_analysis_item.get("audioAnalysisData", {})
        scenario_id = audio_analysis_item.get("scenarioId")
        language = audio_analysis_item.get("language", "ja")
        created_at = audio_analysis_item.get("createdAt")
        
        # シナリオ情報を取得
        scenario_info = None
        scenario_goals = []
        if scenario_id and scenarios_table:
            try:
                scenario_response = scenarios_table.get_item(Key={'scenarioId': scenario_id})
                scenario_data = scenario_response.get('Item')
                if scenario_data:
                    scenario_info = scenario_data
                    scenario_goals = scenario_data.get('goals', [])
                    logger.info("音声分析用シナリオ情報を取得", extra={
                        "session_id": session_id,
                        "scenario_id": scenario_id,
                        "goals_count": len(scenario_goals)
                    })
            except Exception as e:
                logger.warning("音声分析用シナリオ情報の取得に失敗", extra={
                    "error": str(e),
                    "scenario_id": scenario_id
                })
        
        # 音声分析データから会話メッセージを構築
        messages = []
        segments = audio_analysis_data.get("segments", [])
        for i, segment in enumerate(segments):
            # 話者の役割に基づいてsenderを決定
            sender = "user" if segment.get("role") == "customer" else "npc"
            
            message = {
                "messageId": f"audio-segment-{i+1:03d}",
                "sessionId": session_id,
                "sender": sender,
                "content": segment.get("text", ""),
                "timestamp": created_at,
                # 音声分析特有の情報も追加
                "audioSegment": {
                    "startTime": segment.get("start_time", 0),
                    "endTime": segment.get("end_time", 0),
                    "speakerLabel": segment.get("speaker_label", ""),
                    "role": segment.get("role", "")
                }
            }
            messages.append(message)
        

        # 音声分析結果に対してAI分析を実行（リアルタイムスコアリング + フィードバック生成）
        speakers = audio_analysis_data.get("speakers", [])
        customer_speaker = next((s for s in speakers if s.get("identified_role") == "customer"), None)
        salesperson_speaker = next((s for s in speakers if s.get("identified_role") == "salesperson"), None)
        
        # 音声分析メッセージに対してリアルタイムスコアリングを実行してメトリクスを取得
        # （Step Functionsで既に生成されているため、ここでは実行しない）
        
        # 既に保存されているfinal-feedbackを取得
        session_feedback_table_name = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')
        feedback_table = dynamodb.Table(session_feedback_table_name)
        existing_feedback = None
        existing_metrics = None
        try:
            feedback_response = feedback_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq('final-feedback'),
                ScanIndexForward=False,
                Limit=1
            )
            feedback_items = feedback_response.get('Items', [])
            if feedback_items:
                existing_feedback = feedback_items[0].get('feedbackData')
                existing_metrics = feedback_items[0].get('finalMetrics')
                logger.info("既存のフィードバックを使用", extra={
                    "session_id": session_id,
                    "overall_score": existing_feedback.get("scores", {}).get("overall") if existing_feedback else None
                })
            else:
                logger.warning("フィードバックが見つかりません（Step Functionsで生成されるはずです）", extra={
                    "session_id": session_id
                })
        except Exception as e:
            logger.error("既存フィードバックの取得に失敗", extra={"error": str(e)})
        
        # フィードバックデータを決定
        if existing_feedback:
            feedback_data = existing_feedback
            final_metrics = existing_metrics or {
                "angerLevel": 5,
                "trustLevel": 5,
                "progressLevel": 5,
                "analysis": ""
            }
        else:
            # フィードバックが存在しない場合はエラー
            raise InternalServerError("音声分析のフィードバックが生成されていません。Step Functionsの実行を確認してください。")
        
        # NPCキャラクター情報を構築
        npc_info = {
            "name": salesperson_speaker.get("sample_utterances", ["不明"])[0][:20] + "..." if salesperson_speaker else "営業担当者",
            "role": "営業担当者",
            "company": "分析対象企業",
            "personality": ["丁寧", "親切", "専門的"]
        }
        
        # レスポンスデータを構築
        response_data = {
            "success": True,
            "sessionType": "audio-analysis",  # セッション種別を明示
            "sessionId": session_id,
            "sessionInfo": {
                "sessionId": session_id,
                "scenarioId": scenario_id,
                "title": f"音声分析: {scenario_info.get('title', '不明なシナリオ') if scenario_info else '不明なシナリオ'}",
                "createdAt": created_at,
                "status": "completed",
                "language": language,
                "npcInfo": npc_info
            },
            "messages": messages,
            "realtimeMetrics": [],  # 音声分析セッションではリアルタイムメトリクスは空
            "feedback": feedback_data,
            "finalMetrics": final_metrics,
            "feedbackCreatedAt": created_at,
            "complianceViolations": [],  # 音声分析セッションではコンプライアンス違反は空
            "audioAnalysis": audio_analysis_data,  # 音声分析結果を追加
            "goalResults": create_goal_results_from_feedback(
                feedback_data, scenario_goals, session_id
            ) if scenario_goals else None
        }
        
        logger.info("音声分析セッションデータ構築完了", extra={
            "session_id": session_id,
            "speakers_count": len(speakers),
            "segments_count": len(segments),
            "messages_count": len(messages),
            "feedback_source": "existing" if existing_feedback else "default"
        })
        
        # JSONシリアライズ可能な形式に変換して返す
        return json_serializable(response_data)
        
    except Exception as e:
        logger.exception("音声分析セッションデータ構築エラー", extra={
            "error": str(e),
            "session_id": session_id
        })
        raise InternalServerError(f"音声分析セッションデータの構築中にエラーが発生しました: {str(e)}")

def register_analysis_results_routes(app: APIGatewayRestResolver):
    """
    セッション分析結果関連のルートを登録
    
    Args:
        app: APIGatewayRestResolverインスタンス
    """
    
    @app.get("/sessions/<session_id>/analysis-results")
    def get_session_analysis_results(session_id: str):
        """
        セッション分析結果取得APIエンドポイント
        通常セッションと音声分析セッション両方に対応
        """
        try:
            logger.info("Processing get session analysis results request", extra={
                "session_id": session_id
            })
            
            # バリデーション
            if not session_id:
                logger.error("セッションIDが不正", extra={"session_id": session_id})
                raise BadRequestError("セッションIDは必須です")
            
            # ユーザーIDを取得
            try:
                user_id = get_user_id_from_event(app)
                logger.debug("ユーザーID取得成功", extra={
                    "session_id": session_id,
                    "user_id": user_id
                })
            except Exception as user_error:
                logger.error("ユーザーID取得エラー", extra={
                    "error": str(user_error),
                    "session_id": session_id
                })
                raise InternalServerError(f"ユーザーID取得エラー: {str(user_error)}")
            
            # 各テーブル名を取得
            session_feedback_table_name = os.environ.get('SESSION_FEEDBACK_TABLE', 'dev-AISalesRolePlay-SessionFeedback')
            logger.debug("フィードバックテーブル名取得", extra={
                "table_name": session_feedback_table_name,
                "session_id": session_id
            })

            # まず音声分析セッションかどうかを確認
            try:
                feedback_table = dynamodb.Table(session_feedback_table_name)
                logger.debug("音声分析セッション判定開始", extra={
                    "session_id": session_id,
                    "user_id": user_id
                })
                
                # Limitを削除してFilterExpressionが正しく機能するようにする
                # FilterExpressionはLimit適用後に評価されるため、Limitがあると結果が0件になる可能性がある
                audio_analysis_response = feedback_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                    FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq('audio-analysis-result'),
                    ScanIndexForward=False
                )
                
                audio_analysis_items = audio_analysis_response.get('Items', [])
                logger.info("音声分析セッション判定完了", extra={
                    "session_id": session_id,
                    "items_count": len(audio_analysis_items)
                })
                
                if audio_analysis_items:
                    # 音声分析セッションの場合（最新の1件を使用）
                    logger.info("音声分析セッション処理開始", extra={"session_id": session_id})
                    return handle_audio_analysis_session(session_id, user_id, audio_analysis_items[0])
                else:
                    logger.info("通常セッション処理開始", extra={"session_id": session_id})
                    
            except Exception as audio_query_error:
                logger.error("音声分析セッション判定エラー", extra={
                    "error": str(audio_query_error),
                    "session_id": session_id
                })
                raise InternalServerError(f"音声分析セッション判定エラー: {str(audio_query_error)}")
            
            # 通常のセッション処理（AgentCore Memoryから会話履歴・メトリクスを取得）
            if not sessions_table:
                raise InternalServerError("セッションテーブル未定義")
                
            session_response = sessions_table.scan(
                FilterExpression=boto3.dynamodb.conditions.Attr('sessionId').eq(session_id) & 
                               boto3.dynamodb.conditions.Attr('userId').eq(user_id)
            )
            
            session_items = session_response.get('Items', [])
            if not session_items:
                raise NotFoundError("指定されたセッションが見つかりません")
            
            session_info = session_items[0]
            
            # AgentCore Memoryから会話履歴を取得
            # user_idをactor_idとして使用（フォールバック: default_user）
            # start_handler.pyと同じロジックを使用
            actor_id = user_id if user_id else "default_user"
            messages = get_session_data_from_memory(session_id, actor_id)
            
            # フォールバック: 既存セッション互換性のためdefault_userで再試行
            if not messages and user_id and actor_id != "default_user":
                logger.warning("user_idで取得できなかったため、default_userで再試行", extra={
                    "session_id": session_id,
                    "user_id": user_id
                })
                messages = get_session_data_from_memory(session_id, "default_user")
            
            logger.info("AgentCore Memoryからデータ取得完了", extra={
                "session_id": session_id,
                "actor_id": actor_id,
                "messages_count": len(messages)
            })
            
            # フィードバックデータをDynamoDBから取得（Step Functionsで生成済み）
            feedback_response = feedback_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                ScanIndexForward=False  # 降順ソート（最新が先頭）
            )
            
            feedback_items = feedback_response.get('Items', [])
            
            # フィードバックデータを分類
            # ScanIndexForward=Falseで降順ソート済みのため、最初に見つかったfinal-feedbackが最新
            final_feedback = None
            dynamodb_realtime_metrics = []
            
            for item in feedback_items:
                data_type = item.get('dataType')
                
                if data_type == 'final-feedback':
                    if final_feedback is None:
                        final_feedback = item
                elif data_type == 'realtime-metrics':
                    dynamodb_realtime_metrics.append(item)
            
            # コンプライアンス違反データを抽出（DynamoDBのメトリクスから）
            compliance_violations = []
            for metric in dynamodb_realtime_metrics:
                compliance_data = metric.get('complianceData', {})
                violations = compliance_data.get('violations', [])
                for violation in violations:
                    # データ構造を型定義に合わせて変換
                    compliance_violation = {
                        'rule_id': violation.get('rule_id', ''),
                        'rule_name': violation.get('rule_name', ''),
                        'severity': violation.get('severity', 'low'),
                        'message': violation.get('message', ''),
                        'context': violation.get('context', ''),
                        'confidence': float(violation.get('confidence', '0')),
                        # i18n対応フィールド
                        'rule_name_key': violation.get('rule_name_key'),
                        'rule_name_params': violation.get('rule_name_params'),
                        'message_key': violation.get('message_key'),
                        'message_params': violation.get('message_params')
                    }
                    compliance_violations.append(compliance_violation)
            
            logger.info("コンプライアンス違反データ抽出完了", extra={
                "session_id": session_id,
                "violations_count": len(compliance_violations)
            })
            # DynamoDBのリアルタイムメトリクスをレスポンス形式に変換
            formatted_realtime_metrics = []
            for metric in dynamodb_realtime_metrics:
                formatted_realtime_metrics.append({
                    'sessionId': session_id,
                    'timestamp': metric.get('createdAt', ''),
                    'messageNumber': int(metric.get('messageNumber', 0)),
                    'angerLevel': int(metric.get('angerLevel', 1)),
                    'trustLevel': int(metric.get('trustLevel', 5)),
                    'progressLevel': int(metric.get('progressLevel', 5)),
                    'analysis': metric.get('analysis', ''),
                    'dataType': 'realtime-metrics',
                })
            
            # タイムスタンプでソート（古い順）
            formatted_realtime_metrics.sort(key=lambda x: x.get('timestamp', ''))
            
            logger.info("リアルタイムメトリクス取得完了", extra={
                "session_id": session_id,
                "dynamodb_metrics_count": len(formatted_realtime_metrics),
            })
            
            # レスポンスデータを構築（DynamoDBからのメトリクスを使用）
            response_data = {
                "success": True,
                "sessionType": "regular",
                "sessionId": session_id,
                "sessionInfo": session_info,
                "messages": messages,
                "realtimeMetrics": formatted_realtime_metrics,
                "complianceViolations": compliance_violations
            }
            
            if final_feedback:
                response_data["feedback"] = final_feedback.get("feedbackData")
                response_data["finalMetrics"] = final_feedback.get("finalMetrics")
                response_data["feedbackCreatedAt"] = final_feedback.get("createdAt")
                response_data["goalResults"] = final_feedback.get("goalResults")
                
                # 動画分析結果があれば追加
                if final_feedback.get("videoAnalysis"):
                    response_data["videoAnalysis"] = final_feedback.get("videoAnalysis")
                    response_data["videoUrl"] = final_feedback.get("videoUrl")
                
                # 参照資料評価結果があれば追加
                if final_feedback.get("referenceCheck"):
                    response_data["referenceCheck"] = final_feedback.get("referenceCheck")
            else:
                # フィードバックがない場合（Step Functions未実行または処理中）
                logger.warning("フィードバックが見つかりません（Step Functions未実行の可能性）", extra={
                    "session_id": session_id
                })
                
                # DynamoDBのリアルタイムメトリクスから最終メトリクスを取得
                if formatted_realtime_metrics:
                    latest_metric = formatted_realtime_metrics[-1]  # 最新のメトリクス（ソート済み）
                    response_data["finalMetrics"] = {
                        "angerLevel": int(latest_metric.get("angerLevel", 1)),
                        "trustLevel": int(latest_metric.get("trustLevel", 5)),
                        "progressLevel": int(latest_metric.get("progressLevel", 5)),
                        "analysis": latest_metric.get("analysis", "")
                    }
            
            logger.info("通常セッション分析結果取得成功", extra={
                "session_id": session_id,
                "messages_count": len(messages),
                "realtime_metrics_count": len(formatted_realtime_metrics),
                "has_feedback": "feedback" in response_data
            })
            
            # JSONシリアライズ可能な形式に変換して返す
            return json_serializable(response_data)
            
        except NotFoundError:
            raise
        except BadRequestError:
            raise
        except InternalServerError:
            raise
        except Exception as error:
            logger.exception("Unexpected error in get session analysis results handler", extra={
                "error": str(error),
                "session_id": session_id
            })
            raise InternalServerError(f"セッション分析結果取得中にエラーが発生しました: {str(error)}")
