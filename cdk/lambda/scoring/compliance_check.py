"""
コンプライアンスチェックモジュール

このモジュールは、会話内容がコンプライアンス規則に違反していないか
Amazon Bedrockを使用してチェックします。

Functions:
    check_compliance_violations: 会話データに基づいてコンプライアンス違反を検出
    load_scenario_guardrail: シナリオに対応するGuardrailを取得
    analyze_with_bedrock: Bedrockモデルを使用してコンプライアンス分析を実行
    normalize_compliance_score: コンプライアンススコアを正規化して有効な範囲に収める
"""

import json
import os
import boto3
from typing import Dict, Any, List, Optional
from datetime import datetime

# AWS Lambda Powertools
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities import parameters

# Powertools 初期化
logger = Logger(service="compliance-check-service")

# Bedrockクライアント初期化
bedrock_runtime = boto3.client('bedrock-runtime')

def check_compliance_violations(
    user_messages: List[str],
    session_id: str,
    scenario_id: Optional[str] = None,
    previous_results: Optional[Dict[str, Any]] = None,
    language: Optional[str] = 'ja'
) -> Dict[str, Any]:
    """
    会話データに基づいてコンプライアンス違反を検出
    
    ユーザーのメッセージを分析し、コンプライアンスルールに違反する内容がないかチェックします。
    Amazon Bedrockを使用して分析を行い、結果をJSON形式で返します。
    
    Args:
        user_messages (List[str]): ユーザーのメッセージリスト
        session_id (str): セッションID
        scenario_id (Optional[str]): シナリオID（指定があればシナリオ固有のGuardrailを使用）
        previous_results (Optional[Dict[str, Any]]): 過去の分析結果（増分分析用）
        
    Returns:
        Dict[str, Any]: コンプライアンスチェック結果を含む辞書
        {
            "complianceScore": float,  # コンプライアンススコア (0-100)
            "violations": [  # 違反リスト
                {
                    "rule_id": str,     # 違反ルールID
                    "rule_name": str,   # 違反ルール名
                    "severity": str,    # 重大度 (high, medium, low)
                    "message": str,     # 違反メッセージ
                    "context": str,     # 違反が検出された文脈
                    "confidence": float # 信頼度 (0-1)
                }
            ],
            "sessionId": str,           # セッションID
            "timestamp": int,           # タイムスタンプ（ミリ秒）
            "analysis": str             # 簡潔な分析テキスト
        }
    """
    logger.debug(f"check_compliance_violations 開始: session_id={session_id}, scenario_id={scenario_id}, メッセージ数={len(user_messages) if user_messages else 0}")
    if user_messages and len(user_messages) > 0:
        logger.debug(f"最初のメッセージ: {user_messages[0][:50]}...")
    if previous_results:
        logger.debug(f"過去の結果あり: violations={len(previous_results.get('violations', []))}, score={previous_results.get('complianceScore', 'なし')}")
    logger.debug(f"言語設定: {language}")
    """
    会話データに基づいてコンプライアンス違反を検出
    
    ユーザーのメッセージを分析し、コンプライアンスルールに違反する内容がないかチェックします。
    Amazon Bedrockを使用して分析を行い、結果をJSON形式で返します。
    
    Args:
        user_messages (List[str]): ユーザーのメッセージリスト
        session_id (str): セッションID
        scenario_id (Optional[str]): シナリオID（指定があればシナリオ固有のGuardrailを使用）
        previous_results (Optional[Dict[str, Any]]): 過去の分析結果（増分分析用）
        
    Returns:
        Dict[str, Any]: コンプライアンスチェック結果を含む辞書
        {
            "complianceScore": float,  # コンプライアンススコア (0-100)
            "violations": [  # 違反リスト
                {
                    "rule_id": str,     # 違反ルールID
                    "rule_name": str,   # 違反ルール名
                    "severity": str,    # 重大度 (high, medium, low)
                    "message": str,     # 違反メッセージ
                    "context": str,     # 違反が検出された文脈
                    "confidence": float # 信頼度 (0-1)
                }
            ],
            "sessionId": str,           # セッションID
            "timestamp": int,           # タイムスタンプ（ミリ秒）
            "analysis": str             # 簡潔な分析テキスト
        }
    """
    try:
        # ユーザーメッセージがない場合は問題なし
        if not user_messages or len(user_messages) == 0:
            logger.debug(f"ユーザーメッセージがないため、コンプライアンスチェックをスキップします: session_id={session_id}")
            return {
                "complianceScore": 100,
                "violations": [],
                "sessionId": session_id,
                "timestamp": int(datetime.now().timestamp() * 1000),
                "analysis": "ユーザーメッセージがありません"
            }
        
        # ユーザーのメッセージをテキスト形式に整形
        user_text = "\n".join([f"- {msg}" for msg in user_messages])
        logger.debug(f"分析対象テキストサンプル: {user_text[:200]}...")
        
        # シナリオに対応するGuardrailを取得（言語情報も渡す）
        guardrail_info = load_scenario_guardrail(scenario_id, language)
        logger.debug(f"取得したガードレール情報: ARN={guardrail_info.get('guardrail_arn', 'なし')}, バージョン={guardrail_info.get('guardrail_version', 'なし')}")
        
        # Amazon Bedrockを使用して分析
        try:
            logger.debug(f"Bedrock分析を開始します: session_id={session_id}")
            analysis_result = analyze_with_bedrock(user_text, guardrail_info)
            logger.debug(f"Bedrock分析結果: スコア={analysis_result.get('complianceScore', 'なし')}, 違反数={len(analysis_result.get('violations', []))}")
        except Exception as bedrock_error:
            logger.error(f"Bedrock分析エラー: {str(bedrock_error)}")
            raise bedrock_error
        
        # タイムスタンプを追加
        analysis_result["sessionId"] = session_id
        analysis_result["timestamp"] = int(datetime.now().timestamp() * 1000)
        
        # 過去の結果がある場合は統合
        if previous_results and "violations" in previous_results:
            # 新しい違反のみ追加する（rule_id + message の組み合わせで重複除去）
            existing_violations = set()
            for violation in previous_results["violations"]:
                key = f"{violation.get('rule_id', '')}:{violation.get('message', '')}"
                existing_violations.add(key)
            
            new_violations = []
            for violation in analysis_result["violations"]:
                key = f"{violation.get('rule_id', '')}:{violation.get('message', '')}"
                if key not in existing_violations:
                    new_violations.append(violation)
            
            # 過去の違反と新しい違反を統合
            combined_violations = previous_results["violations"] + new_violations
            analysis_result["violations"] = combined_violations
            
            # コンプライアンススコアを再計算
            if combined_violations:
                # 違反の重大度に基づいてスコアを計算
                severity_impacts = {
                    "high": 30,
                    "medium": 15,
                    "low": 5
                }
                
                total_impact = 0
                for violation in combined_violations:
                    severity = violation.get("severity", "medium")
                    impact = severity_impacts.get(severity, 15)
                    total_impact += impact
                
                # 最大100点から違反の影響を差し引く
                compliance_score = max(0, 100 - total_impact)
                analysis_result["complianceScore"] = compliance_score
        
        logger.info(f"コンプライアンスチェック完了: {json.dumps(analysis_result, ensure_ascii=False)}")
        
        # 違反情報があるかどうかを明示的にログ出力
        if analysis_result.get("violations") and len(analysis_result["violations"]) > 0:
            logger.info(f"違反が検出されました: {len(analysis_result['violations'])}件")
        else:
            logger.warning("違反が検出されませんでした。Guardrailが正しく機能しているか確認してください。")
        
        return analysis_result
        
    except Exception as e:
        logger.error(f"コンプライアンスチェックエラー: {str(e)}")
        return create_default_compliance_result(session_id)

def load_scenario_guardrail(scenario_id: Optional[str] = None, language: Optional[str] = 'ja') -> Dict[str, str]:
    logger.debug(f"load_scenario_guardrail 開始: scenario_id={scenario_id}, language={language}")
    """
    シナリオに対応するGuardrailを設定から取得
    
    シナリオIDに基づいて適切なGuardrailを選択します。
    1. DynamoDBからシナリオデータを取得し、guardrailフィールドを確認
    2. シナリオデータにguardrailフィールドがあれば、それを使用
    3. なければデフォルトの"GeneralCompliance"を使用
    4. Parameter Storeからガードレール情報を取得
    
    Args:
        scenario_id (Optional[str]): シナリオID
        
    Returns:
        Dict[str, str]: Guardrail情報
        {
            "guardrail_arn": str,  # GuardrailのARN
            "guardrail_version": str  # Guardrailのバージョン
        }
    """
    try:
        # デフォルトのGuardrail ID
        default_guardrail_id = "GeneralCompliance"
        
        # シナリオIDがない場合はデフォルトを使用
        if not scenario_id:
            logger.info("シナリオIDが指定されていないため、デフォルトのガードレールを使用します")
            guardrail_id = default_guardrail_id
        else:
            # DynamoDBからシナリオデータを取得
            guardrail_id = default_guardrail_id  # デフォルト値を設定
            try:
                # DynamoDBクライアントの初期化
                dynamodb = boto3.resource('dynamodb')
                
                # 環境変数からテーブル名を取得
                scenarios_table_name = os.environ.get('SCENARIOS_TABLE_NAME')
                logger.debug(f"DynamoDB テーブル名: {scenarios_table_name}")
                table = dynamodb.Table(scenarios_table_name)
                
                # シナリオIDでデータを取得
                logger.debug(f"DynamoDBからシナリオ取得: scenarioId={scenario_id}")
                response = table.get_item(
                    Key={
                        'scenarioId': scenario_id
                    }
                )
                logger.debug(f"DynamoDB レスポンスキー: {list(response.keys())}")
                
                # シナリオデータが存在し、guardrailフィールドがあれば使用
                if 'Item' in response and 'guardrail' in response['Item'] and response['Item']['guardrail']:
                    guardrail_id = response['Item']['guardrail']
                    logger.info(f"DynamoDBからシナリオ {scenario_id} のguardrail情報を取得: {guardrail_id}")
                    
                    # シナリオの言語情報を確認し、guardrail_idにロギング
                    scenario_language = response['Item'].get('language', 'ja')
                    logger.info(f"シナリオ {scenario_id} の言語設定: {scenario_language}, パラメータから受け取った言語設定: {language}")
                else:
                    # guardrailフィールドがない場合はデフォルトを使用
                    logger.info(f"シナリオ {scenario_id} にguardrailフィールドがないため、デフォルトのガードレールを使用します")
            except Exception as db_error:
                logger.error(f"DynamoDBからのシナリオデータ取得エラー: {str(db_error)}")
                logger.info(f"DynamoDBエラーのため、デフォルトのガードレールを使用します")
        
        # Parameter Storeからガードレール情報を取得（環境プレフィックスを考慮）
        base_parameter_prefix = '/aisalesroleplay/guardrails'
        environment_prefix = os.environ.get('ENVIRONMENT_PREFIX', '')
        logger.debug(f"環境変数: ENVIRONMENT_PREFIX={environment_prefix}")
        
        # 環境プレフィックスがある場合はパラメータパスに追加
        if environment_prefix:
            parameter_prefix = f"{base_parameter_prefix}/{environment_prefix}"
        else:
            parameter_prefix = base_parameter_prefix
            
        logger.debug(f"Parameter Storeのパラメータプレフィックス: {parameter_prefix}")
            
        # 言語に基づくデバッグ情報をログに出力
        logger.info(f"言語設定: {language}, ガードレールID: {guardrail_id}, パラメータパス: {parameter_prefix}/{guardrail_id}/arn")
        
        try:
            # ARNを取得
            parameter_name = f"{parameter_prefix}/{guardrail_id}/arn"
            logger.debug(f"Parameter Store ARN取得: パス={parameter_name}")
            guardrail_arn = parameters.get_parameter(parameter_name)
            logger.debug(f"Parameter Storeから {parameter_name} を取得: {guardrail_arn}")
            
            # バージョンを取得
            parameter_name = f"{parameter_prefix}/{guardrail_id}/version"
            logger.debug(f"Parameter Store バージョン取得: パス={parameter_name}")
            guardrail_version = parameters.get_parameter(parameter_name)
            logger.debug(f"Parameter Storeから {parameter_name} を取得: {guardrail_version}")
            
            # ARNが取得できない場合はテスト実装を使用
            if not guardrail_arn:
                logger.warning(f"Parameter Storeから {guardrail_id} のARNが取得できませんでした。テスト実装を使用します。")
                return {
                    "guardrail_arn": "",
                    "guardrail_version": "DRAFT"
                }
                
            logger.info(f"シナリオ {scenario_id} に対して {guardrail_id} ガードレールを使用します")
            return {
                "guardrail_arn": guardrail_arn,
                "guardrail_version": guardrail_version
            }
            
        except parameters.exceptions.GetParameterError as param_error:
            logger.error(f"Parameter Storeからのガードレール情報取得エラー: {str(param_error)}")
            # Parameter Storeからの取得に失敗した場合はテスト実装を使用
            return {
                "guardrail_arn": "",
                "guardrail_version": "DRAFT"
            }
        
    except Exception as e:
        logger.error(f"Guardrail設定ロードエラー: {str(e)}")
        # エラー時は空の設定を返す
        return {
            "guardrail_arn": "",
            "guardrail_version": "DRAFT"
        }

def analyze_with_bedrock(user_text: str, guardrail_info: Dict[str, str]) -> Dict[str, Any]:
    logger.debug(f"analyze_with_bedrock 開始: text長={len(user_text)}, guardrail_arn={guardrail_info.get('guardrail_arn', '')[:20]}...")
    """
    Bedrock Guardrails APIを使用してコンプライアンス分析を実行
    
    Amazon Bedrock Guardrailsを使用して、ユーザーの発言内容を
    コンプライアンスポリシーと照合し、違反がないかを確認します。
    
    Args:
        user_text (str): 分析対象のユーザー発言テキスト
        guardrail_info (Dict[str, str]): Guardrail情報
        
    Returns:
        Dict[str, Any]: コンプライアンス分析結果
    """
    try:
        # Guardrail情報が設定されていない場合はエラー
        if not guardrail_info.get("guardrail_arn"):
            logger.error("Guardrail ARNが設定されていません")
            raise ValueError("Guardrail ARNが設定されていません")
        
        # Bedrock Guardrails APIを呼び出し
        logger.debug(f"Bedrock Guardrails APIを呼び出します。ARN: {guardrail_info['guardrail_arn']}, バージョン: {guardrail_info.get('guardrail_version', 'DRAFT')}")
        
        logger.debug(f"APIリクエスト内容: guardrailIdentifier={guardrail_info['guardrail_arn']}, source=INPUT")
        try:
            response = bedrock_runtime.apply_guardrail(
                guardrailIdentifier=guardrail_info["guardrail_arn"],
                guardrailVersion=guardrail_info.get("guardrail_version", "DRAFT"),
                source="INPUT",
                content=[{
                    "text": {
                        "text": user_text
                    }
                }]
            )
            logger.debug(f"Bedrock API呼び出し成功: レスポンスキー={list(response.keys()) if response else 'なし'}")
        except Exception as api_error:
            logger.error(f"Bedrock API呼び出しエラー: {str(api_error)}")
            logger.error(f"エラータイプ: {type(api_error).__name__}")
            raise api_error
        
        logger.debug(f"Bedrock Guardrails API レスポンスサイズ: {len(json.dumps(response, default=str)) if response else 0} バイト")
        try:
            logger.debug(f"Bedrock Guardrails API レスポンスの一部: {json.dumps(response, default=str, ensure_ascii=False)[:500]}...")
        except Exception as json_error:
            logger.error(f"レスポンスJSON出力エラー: {str(json_error)}")
        
        # レスポンスから違反情報を解析
        violations = []
        compliance_score = 100
        
        # Guardrailアクションを確認
        action = response.get('action', 'NONE')
        action_reason = response.get('actionReason', '')
        logger.debug(f"Guardrail アクション: {action}, 理由: {action_reason}")
        
        # アセスメント結果を確認
        assessments = response.get('assessments', [])
        logger.debug(f"アセスメント数: {len(assessments)}")
        for i, assessment in enumerate(assessments):
            logger.debug(f"アセスメント {i+1}: キー={list(assessment.keys()) if assessment else 'なし'}")
        
        for assessment in assessments:
            # トピックポリシー違反
            if 'topicPolicy' in assessment:
                topic_policy = assessment['topicPolicy']
                for topic in topic_policy.get('topics', []):
                    if topic.get('detected', False) and topic.get('action') == 'BLOCKED':
                        violations.append({
                            'rule_id': f"topic_{topic.get('name', 'unknown')}",
                            'rule_name_key': 'compliance.violations.topicViolation',
                            'rule_name_params': {'topicName': topic.get('name', 'Unknown')},
                            'rule_name': f"トピック違反: {topic.get('name', 'Unknown')}",  # Keep for backward compatibility
                            'severity': 'high',
                            'message_key': 'compliance.violations.prohibitedTopicDetected',
                            'message_params': {'topicName': topic.get('name', 'Unknown')},
                            'message': f"禁止されたトピックが検出されました: {topic.get('name', 'Unknown')}",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': 0.9
                        })
            
            # コンテンツポリシー違反
            if 'contentPolicy' in assessment:
                content_policy = assessment['contentPolicy']
                for filter_result in content_policy.get('filters', []):
                    if filter_result.get('detected', False) and filter_result.get('action') == 'BLOCKED':
                        filter_type = filter_result.get('type', 'unknown')
                        confidence_level = filter_result.get('confidence', 'NONE')
                        severity = 'high' if confidence_level in ['HIGH'] else 'medium' if confidence_level in ['MEDIUM'] else 'low'
                        violations.append({
                            'rule_id': f"content_{filter_type.lower()}",
                            'rule_name_key': 'compliance.violations.contentFilter',
                            'rule_name_params': {'filterType': filter_type},
                            'rule_name': f"コンテンツフィルター: {filter_type}",  # Keep for backward compatibility
                            'severity': severity,
                            'message_key': 'compliance.violations.inappropriateContentDetected',
                            'message_params': {'filterType': filter_type, 'confidence': confidence_level},
                            'message': f"不適切なコンテンツが検出されました: {filter_type} (信頼度: {confidence_level})",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': 0.8 if confidence_level == 'HIGH' else 0.6 if confidence_level == 'MEDIUM' else 0.4
                        })
            
            # ワードポリシー違反
            if 'wordPolicy' in assessment:
                word_policy = assessment['wordPolicy']
                # カスタムワード
                for custom_word in word_policy.get('customWords', []):
                    if custom_word.get('detected', False) and custom_word.get('action') == 'BLOCKED':
                        violations.append({
                            'rule_id': 'custom_word',
                            'rule_name_key': 'compliance.violations.customWordDetected',
                            'rule_name_params': {},
                            'rule_name': 'カスタムワード検出',  # Keep for backward compatibility
                            'severity': 'medium',
                            'message_key': 'compliance.violations.prohibitedWordDetected',
                            'message_params': {'match': custom_word.get('match', '')},
                            'message': f"禁止語句が検出されました: {custom_word.get('match', '')}",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': 0.9
                        })
                
                # 管理語句リスト
                for managed_word in word_policy.get('managedWordLists', []):
                    if managed_word.get('detected', False) and managed_word.get('action') == 'BLOCKED':
                        violations.append({
                            'rule_id': f"managed_word_{managed_word.get('type', 'profanity').lower()}",
                            'rule_name_key': 'compliance.violations.managedWordList',
                            'rule_name_params': {'type': managed_word.get('type', 'PROFANITY')},
                            'rule_name': f"管理語句リスト: {managed_word.get('type', 'PROFANITY')}",  # Keep for backward compatibility
                            'severity': 'medium',
                            'message_key': 'compliance.violations.managedWordDetected',
                            'message_params': {'match': managed_word.get('match', ''), 'type': managed_word.get('type', 'PROFANITY')},
                            'message': f"管理語句リストの語句が検出されました: {managed_word.get('match', '')} ({managed_word.get('type', 'PROFANITY')})",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': 0.85
                        })
            
            # 機密情報ポリシー違反
            if 'sensitiveInformationPolicy' in assessment:
                sensitive_policy = assessment['sensitiveInformationPolicy']
                # PII エンティティ
                for pii_entity in sensitive_policy.get('piiEntities', []):
                    if pii_entity.get('detected', False) and pii_entity.get('action') in ['BLOCKED', 'ANONYMIZED']:
                        severity = 'high' if pii_entity.get('action') == 'BLOCKED' else 'medium'
                        violations.append({
                            'rule_id': f"pii_{pii_entity.get('type', 'unknown').lower()}",
                            'rule_name_key': 'compliance.violations.personalInfoDetected',
                            'rule_name_params': {'type': pii_entity.get('type', 'Unknown')},
                            'rule_name': f"個人情報検出: {pii_entity.get('type', 'Unknown')}",  # Keep for backward compatibility
                            'severity': severity,
                            'message_key': 'compliance.violations.personalInfoFound',
                            'message_params': {'type': pii_entity.get('type', 'Unknown'), 'match': pii_entity.get('match', '')},
                            'message': f"個人情報が検出されました: {pii_entity.get('type', 'Unknown')} - {pii_entity.get('match', '')}",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': 0.8
                        })
                
                # 正規表現フィルター
                for regex_filter in sensitive_policy.get('regexes', []):
                    if regex_filter.get('detected', False) and regex_filter.get('action') in ['BLOCKED', 'ANONYMIZED']:
                        severity = 'high' if regex_filter.get('action') == 'BLOCKED' else 'medium'
                        violations.append({
                            'rule_id': f"regex_{regex_filter.get('name', 'unknown')}",
                            'rule_name_key': 'compliance.violations.regexFilter',
                            'rule_name_params': {'name': regex_filter.get('name', 'Unknown')},
                            'rule_name': f"正規表現フィルター: {regex_filter.get('name', 'Unknown')}",  # Keep for backward compatibility
                            'severity': severity,
                            'message_key': 'compliance.violations.regexPatternMatched',
                            'message_params': {'match': regex_filter.get('match', '')},
                            'message': f"正規表現パターンにマッチしました: {regex_filter.get('match', '')}",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': 0.7
                        })
            
            # コンテキストグラウンディングポリシー違反
            if 'contextualGroundingPolicy' in assessment:
                grounding_policy = assessment['contextualGroundingPolicy']
                for grounding_filter in grounding_policy.get('filters', []):
                    if grounding_filter.get('detected', False) and grounding_filter.get('action') == 'BLOCKED':
                        filter_type = grounding_filter.get('type', 'GROUNDING')
                        score = grounding_filter.get('score', 0)
                        threshold = grounding_filter.get('threshold', 0)
                        violations.append({
                            'rule_id': f"grounding_{filter_type.lower()}",
                            'rule_name_key': 'compliance.violations.contextualGrounding',
                            'rule_name_params': {'type': filter_type},
                            'rule_name': f"コンテキストグラウンディング: {filter_type}",  # Keep for backward compatibility
                            'severity': 'medium',
                            'message_key': 'compliance.violations.contextualGroundingViolation',
                            'message_params': {'type': filter_type, 'score': f"{score:.2f}", 'threshold': f"{threshold:.2f}"},
                            'message': f"コンテキストグラウンディング違反: {filter_type} (スコア: {score:.2f}, 閾値: {threshold:.2f})",  # Keep for backward compatibility
                            'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                            'confidence': min(1.0, max(0.0, 1.0 - score))
                        })
        
        # 違反がある場合はスコアを調整
        if violations:
            logger.debug(f"違反検出数: {len(violations)}")
            
            # 実際の違反スコアに基づいてコンプライアンススコアを計算
            total_violation_score = 0
            max_violation_score = 0
            
            for i, violation in enumerate(violations):
                violation_score = float(violation.get("confidence", 0))
                total_violation_score += violation_score
                max_violation_score = max(max_violation_score, violation_score)
                logger.debug(f"違反 {i+1}: rule_id={violation.get('rule_id', 'なし')}, severity={violation.get('severity', 'なし')}, score={violation_score}")
            
            # 最大違反スコアと累積スコアを考慮した動的計算
            # 最大違反スコアが高いほど、累積効果も考慮
            if max_violation_score > 0.8:
                # 高スコア違反: 大幅減点 + 累積効果
                compliance_score = max(0, 100 - (max_violation_score * 60 + (total_violation_score - max_violation_score) * 20))
            elif max_violation_score > 0.5:
                # 中スコア違反: 中程度減点 + 軽微な累積効果
                compliance_score = max(0, 100 - (max_violation_score * 40 + (total_violation_score - max_violation_score) * 10))
            else:
                # 低スコア違反: 軽微な減点
                compliance_score = max(0, 100 - (total_violation_score * 20))
            
            compliance_score = round(compliance_score, 1)
            analysis = f"{len(violations)}件のコンプライアンス違反が検出されました（最大スコア: {max_violation_score:.2f}）"
            logger.debug(f"調整後のコンプライアンススコア: {compliance_score}")
        else:
            analysis = "コンプライアンス違反は検出されませんでした"
            logger.debug(f"コンプライアンス違反なし、スコア: {compliance_score}")
        
        logger.info(f"コンプライアンス分析完了: スコア={compliance_score}, 違反数={len(violations)}")
        
        return {
            "complianceScore": compliance_score,
            "violations": violations,
            "analysis": analysis
        }
        
    except Exception as e:
        logger.error(f"コンプライアンス分析エラー: {str(e)}")
        # エラーは上位に伝播
        raise e

def normalize_compliance_score(score: float) -> float:
    """
    コンプライアンススコアを正規化して有効な範囲に収める
    
    Args:
        score (float): 元のスコア
        
    Returns:
        float: 0-100の範囲に正規化されたスコア
    """
    # スコアを0-100の範囲に収める
    return max(0, min(100, score))

def create_default_compliance_result(session_id: str) -> Dict[str, Any]:
    """
    デフォルトのコンプライアンス結果を生成
    
    エラーや未設定時のデフォルト結果を返します。
    
    Args:
        session_id (str): セッションID
        
    Returns:
        Dict[str, Any]: デフォルトのコンプライアンスチェック結果
    """
    return {
        "complianceScore": 100,
        "violations": [],
        "sessionId": session_id,
        "timestamp": int(datetime.now().timestamp() * 1000),
        "analysis": "コンプライアンスチェック機能は現在利用できません"
    }
