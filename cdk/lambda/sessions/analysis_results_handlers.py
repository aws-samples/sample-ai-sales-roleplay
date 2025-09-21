"""
セッション分析結果関連のAPIハンドラー

通常セッションと音声分析セッションの両方に対応した
分析結果取得機能を提供します。
"""

import os
import time
import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver
from aws_lambda_powertools.event_handler.exceptions import (
    InternalServerError, NotFoundError, BadRequestError
)
import boto3.dynamodb.conditions

from utils import get_user_id_from_event, sessions_table, messages_table, scenarios_table, dynamodb
from feedback_service import generate_feedback_with_bedrock, save_feedback_to_dynamodb
from realtime_scoring import calculate_realtime_scores

# ロガー設定
logger = Logger(service="analysis-results-handlers")

# Bedrockクライアント初期化
bedrock_runtime = boto3.client('bedrock-runtime')

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
            "user_id": user_id
        })
        
        # ユーザーの所有権を確認
        if audio_analysis_item.get("userId") != user_id:
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
        final_metrics = calculate_audio_analysis_metrics(messages, scenario_goals, session_id, language)
        
        # 取得したメトリクスを使用してBedrockでフィードバック生成
        logger.info("音声分析データでAIフィードバック生成開始", extra={
            "session_id": session_id,
            "messages_count": len(messages),
            "scenario_goals_count": len(scenario_goals),
            "final_metrics": final_metrics
        })
        
        feedback_data = generate_feedback_with_bedrock(
            session_id=session_id,
            metrics=final_metrics,
            messages=messages,
            goal_statuses=None,  # 音声分析では事前の達成状況なし
            scenario_goals=scenario_goals,
            language=language
        )
        
        logger.info("音声分析AIフィードバック生成完了", extra={
            "session_id": session_id,
            "overall_score": feedback_data.get("scores", {}).get("overall")
        })
        
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
            "messages_count": len(messages)
        })
        
        # 音声分析結果をDynamoDBに保存（リファレンスチェックAPI用）
        try:
            
            # ゴール結果を取得
            goal_results = create_goal_results_from_feedback(
                feedback_data, scenario_goals, session_id
            ) if scenario_goals else None
            
            # final-feedbackとしてDynamoDBに保存
            save_success = save_feedback_to_dynamodb(
                session_id=session_id,
                feedback_data=feedback_data,
                final_metrics=final_metrics,
                messages=messages,
                goal_data=goal_results
            )
            
            if save_success:
                logger.info("音声分析結果をDynamoDBに保存完了", extra={
                    "session_id": session_id,
                    "overall_score": feedback_data.get("scores", {}).get("overall")
                })
            else:
                logger.warning("音声分析結果のDynamoDB保存に失敗", extra={
                    "session_id": session_id
                })
                
        except Exception as save_error:
            logger.error("音声分析結果の保存中にエラー", extra={
                "error": str(save_error),
                "session_id": session_id
            })
            # 保存エラーでもレスポンスは返す
        
        return response_data
        
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
                
                audio_analysis_response = feedback_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                    FilterExpression=boto3.dynamodb.conditions.Attr('dataType').eq('audio-analysis-result'),
                    ScanIndexForward=False,
                    Limit=1
                )
                
                audio_analysis_items = audio_analysis_response.get('Items', [])
                logger.info("音声分析セッション判定完了", extra={
                    "session_id": session_id,
                    "items_count": len(audio_analysis_items)
                })
                
                if audio_analysis_items:
                    # 音声分析セッションの場合
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
            
            # 通常のセッション処理（既存のcomplete_data_handlers.pyのロジックを継承）
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
            
            # 通常セッションのメッセージ履歴を取得
            if not messages_table:
                raise InternalServerError("メッセージテーブル未定義")
                
            messages_response = messages_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                ScanIndexForward=True  # 時系列順
            )
            
            messages = messages_response.get('Items', [])
            
            # 通常セッションのフィードバックデータを取得
            feedback_response = feedback_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('sessionId').eq(session_id),
                ScanIndexForward=False  # 降順ソート（最新が先頭）
            )
            
            feedback_items = feedback_response.get('Items', [])
            
            # 通常セッション用のデータ分類
            final_feedback = None
            realtime_metrics = []
            
            for item in feedback_items:
                data_type = item.get('dataType')
                
                if data_type == 'final-feedback':
                    final_feedback = item
                elif data_type == 'realtime-metrics':
                    realtime_metrics.append(item)
            
            # コンプライアンス違反データを抽出
            compliance_violations = []
            for metric in realtime_metrics:
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
            
            # フィードバックが存在しない場合は新規生成
            if not final_feedback and realtime_metrics:
                logger.info("通常セッション用フィードバック生成開始", extra={
                    "session_id": session_id,
                    "realtime_metrics_count": len(realtime_metrics)
                })
                
                # シナリオ情報を取得
                scenario_info = None
                scenario_goals = []
                scenario_id = session_info.get('scenarioId')
                if scenario_id and scenarios_table:
                    try:
                        scenario_response = scenarios_table.get_item(Key={'scenarioId': scenario_id})
                        scenario_data = scenario_response.get('Item')
                        if scenario_data:
                            scenario_info = scenario_data
                            scenario_goals = scenario_data.get('goals', [])
                            logger.info("通常セッション用シナリオ情報を取得", extra={
                                "session_id": session_id,
                                "scenario_id": scenario_id,
                                "goals_count": len(scenario_goals)
                            })
                    except Exception as e:
                        logger.warning("通常セッション用シナリオ情報の取得に失敗", extra={
                            "error": str(e),
                            "scenario_id": scenario_id
                        })
                
                # リアルタイムメトリクスから最終メトリクスを計算
                latest_realtime_metric = realtime_metrics[0] if realtime_metrics else None
                if latest_realtime_metric:
                    final_metrics = {
                        "angerLevel": int(latest_realtime_metric.get("angerLevel", 1)),
                        "trustLevel": int(latest_realtime_metric.get("trustLevel", 5)),
                        "progressLevel": int(latest_realtime_metric.get("progressLevel", 5)),
                        "analysis": latest_realtime_metric.get("analysis", "")
                    }
                    
                    # 最新のゴール状況を取得
                    current_goal_statuses = latest_realtime_metric.get("goalStatuses", [])
                    
                    # フィードバック生成
                    try:
                        feedback_data = generate_feedback_with_bedrock(
                            session_id=session_id,
                            metrics=final_metrics,
                            messages=messages,
                            goal_statuses=current_goal_statuses,
                            scenario_goals=scenario_goals,
                            language=session_info.get('language', 'ja')
                        )
                        
                        logger.info("通常セッションフィードバック生成完了", extra={
                            "session_id": session_id,
                            "overall_score": feedback_data.get("scores", {}).get("overall")
                        })
                        
                        # ゴール結果を生成
                        goal_results = create_goal_results_from_feedback(
                            feedback_data, scenario_goals, session_id
                        ) if scenario_goals else None
                        
                        # 通常セッションのフィードバックをDynamoDBに保存（リファレンスチェックAPI用）
                        try:
                            save_success = save_feedback_to_dynamodb(
                                session_id=session_id,
                                feedback_data=feedback_data,
                                final_metrics=final_metrics,
                                messages=messages,
                                goal_data=goal_results
                            )
                            
                            if save_success:
                                logger.info("通常セッションフィードバックをDynamoDBに保存完了", extra={
                                    "session_id": session_id,
                                    "overall_score": feedback_data.get("scores", {}).get("overall")
                                })
                            else:
                                logger.warning("通常セッションフィードバックのDynamoDB保存に失敗", extra={
                                    "session_id": session_id
                                })
                                
                        except Exception as save_error:
                            logger.error("通常セッションフィードバックの保存中にエラー", extra={
                                "error": str(save_error),
                                "session_id": session_id
                            })
                            # 保存エラーでもレスポンスは返す
                        
                        # 通常セッション用のレスポンスデータを構築（フィードバック付き）
                        response_data = {
                            "success": True,
                            "sessionType": "regular",
                            "sessionId": session_id,
                            "sessionInfo": session_info,
                            "messages": messages,
                            "realtimeMetrics": realtime_metrics,
                            "feedback": feedback_data,
                            "finalMetrics": final_metrics,
                            "feedbackCreatedAt": latest_realtime_metric.get("createdAt"),
                            "complianceViolations": compliance_violations,
                            "goalResults": goal_results
                        }
                        
                    except Exception as feedback_error:
                        logger.error("通常セッションフィードバック生成エラー", extra={
                            "error": str(feedback_error),
                            "session_id": session_id
                        })
                        # フィードバック生成に失敗した場合でも基本データは返す
                        response_data = {
                            "success": True,
                            "sessionType": "regular",
                            "sessionId": session_id,
                            "sessionInfo": session_info,
                            "messages": messages,
                            "realtimeMetrics": realtime_metrics,
                            "finalMetrics": final_metrics,
                            "complianceViolations": compliance_violations
                        }
                else:
                    # リアルタイムメトリクスがない場合
                    response_data = {
                        "success": True,
                        "sessionType": "regular",
                        "sessionId": session_id,
                        "sessionInfo": session_info,
                        "messages": messages,
                        "realtimeMetrics": realtime_metrics,
                        "complianceViolations": []
                    }
            else:
                # 既存のフィードバックがある場合
                response_data = {
                    "success": True,
                    "sessionType": "regular",
                    "sessionId": session_id,
                    "sessionInfo": session_info,
                    "messages": messages,
                    "realtimeMetrics": realtime_metrics,
                    "complianceViolations": compliance_violations
                }
                
                if final_feedback:
                    response_data["feedback"] = final_feedback.get("feedbackData")
                    response_data["finalMetrics"] = final_feedback.get("finalMetrics")
                    response_data["feedbackCreatedAt"] = final_feedback.get("createdAt")
                    
                    # 既存フィードバックからゴール結果も生成
                    feedback_data = final_feedback.get("feedbackData")
                    if feedback_data:
                        scenario_id = session_info.get('scenarioId')
                        scenario_goals = []
                        if scenario_id and scenarios_table:
                            try:
                                scenario_response = scenarios_table.get_item(Key={'scenarioId': scenario_id})
                                scenario_data = scenario_response.get('Item')
                                if scenario_data:
                                    scenario_goals = scenario_data.get('goals', [])
                            except Exception as e:
                                logger.warning("既存フィードバック用シナリオ情報の取得に失敗", extra={
                                    "error": str(e),
                                    "scenario_id": scenario_id
                                })
                        
                        if scenario_goals:
                            goal_results = create_goal_results_from_feedback(
                                feedback_data, scenario_goals, session_id
                            )
                            response_data["goalResults"] = goal_results
            
            logger.info("通常セッション分析結果取得成功", extra={
                "session_id": session_id,
                "messages_count": len(messages),
                "realtime_metrics_count": len(realtime_metrics),
                "has_feedback": "feedback" in response_data
            })
            
            return response_data
            
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
