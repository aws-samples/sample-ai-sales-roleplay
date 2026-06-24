"""
コンプライアンスチェックモジュール（AgentCore Runtime版）

Amazon Bedrock Guardrails APIを使用して、ユーザーの発言が
コンプライアンスルールに違反していないかリアルタイムでチェックします。

旧scoring Lambda (cdk/lambda/scoring/compliance_check.py) から移植。
"""

import json
import os
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from pathlib import Path

import boto3

logger = logging.getLogger(__name__)

AWS_REGION = os.environ.get('AWS_REGION', os.environ.get('AWS_DEFAULT_REGION', 'us-west-2'))

# Bedrockクライアント（遅延初期化）
_bedrock_runtime = None
_ssm_client = None
_dynamodb_resource = None
_topic_definitions = None  # トピック定義キャッシュ


def _get_bedrock_runtime():
    global _bedrock_runtime
    if _bedrock_runtime is None:
        _bedrock_runtime = boto3.client('bedrock-runtime', region_name=AWS_REGION)
    return _bedrock_runtime


def _get_ssm_client():
    global _ssm_client
    if _ssm_client is None:
        _ssm_client = boto3.client('ssm', region_name=AWS_REGION)
    return _ssm_client


def _get_dynamodb_resource():
    global _dynamodb_resource
    if _dynamodb_resource is None:
        _dynamodb_resource = boto3.resource('dynamodb', region_name=AWS_REGION)
    return _dynamodb_resource


def _get_topic_definitions() -> Dict[str, str]:
    """guardrails.json からトピック名 → definition のマッピングを取得（起動時に1回だけ読み込み）"""
    global _topic_definitions
    if _topic_definitions is not None:
        return _topic_definitions

    _topic_definitions = {}
    try:
        guardrails_path = Path(__file__).parent / 'guardrails.json'
        with open(guardrails_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        for guardrail in data.get('guardrails', []):
            for topic in guardrail.get('topics', []):
                name = topic.get('name', '')
                definition = topic.get('definition', '')
                if name and definition:
                    _topic_definitions[name] = definition
        
        logger.info(f"トピック定義を読み込みました: {len(_topic_definitions)}件")
    except Exception as e:
        logger.error(f"guardrails.json の読み込みエラー: {e}")

    return _topic_definitions


def check_compliance(
    user_message: str,
    session_id: str,
    scenario_id: Optional[str] = None,
    language: Optional[str] = 'ja'
) -> Dict[str, Any]:
    """
    ユーザーメッセージに対してBedrock Guardrailsによるコンプライアンスチェックを実行

    Args:
        user_message: チェック対象のユーザー発言
        session_id: セッションID
        scenario_id: シナリオID（ガードレール選択に使用）
        language: 言語設定

    Returns:
        コンプライアンスチェック結果
        {
            "complianceScore": float (0-100),
            "violations": [...],
            "analysis": str
        }
    """
    if not user_message or not user_message.strip():
        return _create_default_result(session_id)

    try:
        # シナリオに対応するGuardrailを取得
        guardrail_info = _load_scenario_guardrail(scenario_id, language)

        if not guardrail_info.get("guardrail_arn"):
            logger.warning("Guardrail ARN未設定。コンプライアンスチェックをスキップします。")
            return _create_default_result(session_id)

        # Bedrock Guardrails APIで分析
        result = _analyze_with_guardrail(user_message, guardrail_info)

        result["sessionId"] = session_id
        result["timestamp"] = int(datetime.now().timestamp() * 1000)

        if result.get("violations"):
            logger.info(f"コンプライアンス違反検出: {len(result['violations'])}件 (session={session_id})")
        else:
            logger.debug(f"コンプライアンス違反なし (session={session_id})")

        return result

    except Exception as e:
        logger.error(f"コンプライアンスチェックエラー: {e}")
        return _create_default_result(session_id)


def _load_scenario_guardrail(scenario_id: Optional[str], language: Optional[str] = 'ja') -> Dict[str, str]:
    """
    シナリオに対応するGuardrail情報をParameter Storeから取得

    1. DynamoDBからシナリオのguardrailフィールドを確認
    2. なければデフォルト (GeneralCompliance) を使用
    3. Parameter StoreからARN/バージョンを取得
    """
    default_guardrail_id = "GeneralCompliance"
    guardrail_id = default_guardrail_id

    # シナリオIDがあればDynamoDBからguardrail設定を取得
    if scenario_id:
        try:
            scenarios_table_name = os.environ.get('SCENARIOS_TABLE_NAME')
            if scenarios_table_name:
                dynamodb = _get_dynamodb_resource()
                table = dynamodb.Table(scenarios_table_name)
                response = table.get_item(Key={'scenarioId': scenario_id})

                if 'Item' in response and response['Item'].get('guardrail'):
                    guardrail_id = response['Item']['guardrail']
                    logger.info(f"シナリオ {scenario_id} のguardrail: {guardrail_id}")
                else:
                    logger.info(f"シナリオ {scenario_id} にguardrailフィールドなし。デフォルト使用。")
            else:
                logger.warning("SCENARIOS_TABLE_NAME 未設定")
        except Exception as e:
            logger.error(f"DynamoDBシナリオ取得エラー: {e}")

    # Parameter Storeからガードレール情報を取得
    base_parameter_prefix = '/aisalesroleplay/guardrails'
    environment_prefix = os.environ.get('ENVIRONMENT_PREFIX', '')

    if environment_prefix:
        parameter_prefix = f"{base_parameter_prefix}/{environment_prefix}"
    else:
        parameter_prefix = base_parameter_prefix

    try:
        ssm = _get_ssm_client()

        # Parameter Storeのガードレール名はプレフィックス付き（例: dev-FinanceCompliance）
        # DynamoDBから取得した値が既にプレフィックス付きの場合はそのまま使用
        if environment_prefix and guardrail_id.startswith(environment_prefix):
            prefixed_guardrail_id = guardrail_id
        else:
            prefixed_guardrail_id = f"{environment_prefix}{guardrail_id}" if environment_prefix else guardrail_id

        # ARNを取得
        arn_param = f"{parameter_prefix}/{prefixed_guardrail_id}/arn"
        arn_response = ssm.get_parameter(Name=arn_param)
        guardrail_arn = arn_response['Parameter']['Value']

        # バージョンを取得
        version_param = f"{parameter_prefix}/{prefixed_guardrail_id}/version"
        version_response = ssm.get_parameter(Name=version_param)
        guardrail_version = version_response['Parameter']['Value']

        if not guardrail_arn:
            logger.warning(f"Parameter Store から {guardrail_id} のARNが空です")
            return {"guardrail_arn": "", "guardrail_version": "DRAFT"}

        logger.info(f"Guardrail取得完了: id={guardrail_id}, arn={guardrail_arn[:50]}...")
        return {
            "guardrail_arn": guardrail_arn,
            "guardrail_version": guardrail_version
        }

    except Exception as e:
        logger.error(f"Parameter Storeからのガードレール情報取得エラー: {e}")
        return {"guardrail_arn": "", "guardrail_version": "DRAFT"}


def _analyze_with_guardrail(user_text: str, guardrail_info: Dict[str, str]) -> Dict[str, Any]:
    """
    Bedrock Guardrails ApplyGuardrail APIを呼び出してコンプライアンス分析を実行
    """
    bedrock_runtime = _get_bedrock_runtime()

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

    violations = []
    compliance_score = 100

    assessments = response.get('assessments', [])

    for assessment in assessments:
        # トピックポリシー違反
        if 'topicPolicy' in assessment:
            topic_policy = assessment['topicPolicy']
            topic_defs = _get_topic_definitions()
            for topic in topic_policy.get('topics', []):
                if topic.get('detected', False) and topic.get('action') == 'BLOCKED':
                    topic_name = topic.get('name', 'Unknown')
                    definition = topic_defs.get(topic_name, '')
                    message = f"禁止されたトピックが検出されました: {topic_name}"
                    if definition:
                        message = definition
                    violation_entry = {
                        'rule_id': f"topic_{topic_name}",
                        'rule_name_key': 'compliance.violations.topicViolation',
                        'rule_name_params': {'topicName': topic_name},
                        'rule_name': f"トピック違反: {topic_name}",
                        'severity': 'high',
                        'message': message,
                        'definition': definition,
                        'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                        'confidence': 0.9
                    }
                    # definitionがない場合のみi18nキーを使用
                    if not definition:
                        violation_entry['message_key'] = 'compliance.violations.prohibitedTopicDetected'
                        violation_entry['message_params'] = {'topicName': topic_name}
                    violations.append(violation_entry)

        # コンテンツポリシー違反
        if 'contentPolicy' in assessment:
            content_policy = assessment['contentPolicy']
            for filter_result in content_policy.get('filters', []):
                if filter_result.get('detected', False) and filter_result.get('action') == 'BLOCKED':
                    filter_type = filter_result.get('type', 'unknown')
                    confidence_level = filter_result.get('confidence', 'NONE')
                    severity = 'high' if confidence_level == 'HIGH' else 'medium' if confidence_level == 'MEDIUM' else 'low'
                    violations.append({
                        'rule_id': f"content_{filter_type.lower()}",
                        'rule_name_key': 'compliance.violations.contentFilter',
                        'rule_name_params': {'filterType': filter_type},
                        'rule_name': f"コンテンツフィルター: {filter_type}",
                        'severity': severity,
                        'message_key': 'compliance.violations.inappropriateContentDetected',
                        'message_params': {'filterType': filter_type, 'confidence': confidence_level},
                        'message': f"不適切なコンテンツが検出されました: {filter_type} (信頼度: {confidence_level})",
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
                        'rule_name': 'カスタムワード検出',
                        'severity': 'medium',
                        'message_key': 'compliance.violations.prohibitedWordDetected',
                        'message_params': {'match': custom_word.get('match', '')},
                        'message': f"禁止語句が検出されました: {custom_word.get('match', '')}",
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
                        'rule_name': f"管理語句リスト: {managed_word.get('type', 'PROFANITY')}",
                        'severity': 'medium',
                        'message_key': 'compliance.violations.managedWordDetected',
                        'message_params': {'match': managed_word.get('match', ''), 'type': managed_word.get('type', 'PROFANITY')},
                        'message': f"管理語句リストの語句が検出されました: {managed_word.get('match', '')} ({managed_word.get('type', 'PROFANITY')})",
                        'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                        'confidence': 0.85
                    })

        # 機密情報ポリシー違反
        if 'sensitiveInformationPolicy' in assessment:
            sensitive_policy = assessment['sensitiveInformationPolicy']
            for pii_entity in sensitive_policy.get('piiEntities', []):
                if pii_entity.get('detected', False) and pii_entity.get('action') in ['BLOCKED', 'ANONYMIZED']:
                    severity = 'high' if pii_entity.get('action') == 'BLOCKED' else 'medium'
                    violations.append({
                        'rule_id': f"pii_{pii_entity.get('type', 'unknown').lower()}",
                        'rule_name_key': 'compliance.violations.personalInfoDetected',
                        'rule_name_params': {'type': pii_entity.get('type', 'Unknown')},
                        'rule_name': f"個人情報検出: {pii_entity.get('type', 'Unknown')}",
                        'severity': severity,
                        'message_key': 'compliance.violations.personalInfoFound',
                        'message_params': {'type': pii_entity.get('type', 'Unknown'), 'match': pii_entity.get('match', '')},
                        'message': f"個人情報が検出されました: {pii_entity.get('type', 'Unknown')} - {pii_entity.get('match', '')}",
                        'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                        'confidence': 0.8
                    })

            for regex_filter in sensitive_policy.get('regexes', []):
                if regex_filter.get('detected', False) and regex_filter.get('action') in ['BLOCKED', 'ANONYMIZED']:
                    severity = 'high' if regex_filter.get('action') == 'BLOCKED' else 'medium'
                    violations.append({
                        'rule_id': f"regex_{regex_filter.get('name', 'unknown')}",
                        'rule_name_key': 'compliance.violations.regexFilter',
                        'rule_name_params': {'name': regex_filter.get('name', 'Unknown')},
                        'rule_name': f"正規表現フィルター: {regex_filter.get('name', 'Unknown')}",
                        'severity': severity,
                        'message_key': 'compliance.violations.regexPatternMatched',
                        'message_params': {'match': regex_filter.get('match', '')},
                        'message': f"正規表現パターンにマッチしました: {regex_filter.get('match', '')}",
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
                        'rule_name': f"コンテキストグラウンディング: {filter_type}",
                        'severity': 'medium',
                        'message_key': 'compliance.violations.contextualGroundingViolation',
                        'message_params': {'type': filter_type, 'score': f"{score:.2f}", 'threshold': f"{threshold:.2f}"},
                        'message': f"コンテキストグラウンディング違反: {filter_type} (スコア: {score:.2f}, 閾値: {threshold:.2f})",
                        'context': user_text[:100] + ('...' if len(user_text) > 100 else ''),
                        'confidence': min(1.0, max(0.0, 1.0 - score))
                    })

    # 違反がある場合はスコアを計算
    if violations:
        total_violation_score = 0
        max_violation_score = 0

        for violation in violations:
            violation_score = float(violation.get("confidence", 0))
            total_violation_score += violation_score
            max_violation_score = max(max_violation_score, violation_score)

        if max_violation_score > 0.8:
            compliance_score = max(0, 100 - (max_violation_score * 60 + (total_violation_score - max_violation_score) * 20))
        elif max_violation_score > 0.5:
            compliance_score = max(0, 100 - (max_violation_score * 40 + (total_violation_score - max_violation_score) * 10))
        else:
            compliance_score = max(0, 100 - (total_violation_score * 20))

        compliance_score = round(compliance_score, 1)
        analysis = f"{len(violations)}件のコンプライアンス違反が検出されました（最大スコア: {max_violation_score:.2f}）"
    else:
        analysis = "コンプライアンス違反は検出されませんでした"

    return {
        "complianceScore": compliance_score,
        "violations": violations,
        "analysis": analysis
    }


def _create_default_result(session_id: str) -> Dict[str, Any]:
    """デフォルトのコンプライアンス結果（違反なし）"""
    return {
        "complianceScore": 100,
        "violations": [],
        "sessionId": session_id,
        "timestamp": int(datetime.now().timestamp() * 1000),
        "analysis": ""
    }
