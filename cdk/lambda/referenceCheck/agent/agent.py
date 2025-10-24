import os
from strands import Agent
from strands.models import BedrockModel
from aws_lambda_powertools import Logger
from botocore.config import Config as BotocoreConfig
from agent.tools import check_single_message_reference
from agent.types import QueryKnowledgeBaseOutput

BEDROCK_MODEL_REFERENCE_CHECK = os.environ.get("BEDROCK_MODEL_REFERENCE_CHECK")
REGION = os.environ["AWS_REGION"]

# ロガー
logger = Logger(service="referenceCheck-agent")

# Create a BedrockModel
boto_config = BotocoreConfig(
    retries={"max_attempts": 3, "mode": "standard"},
    connect_timeout=5,
    read_timeout=300,
)

# システムプロンプトは言語に応じて動的に設定するため、ここでは基本設定のみ
bedrock_model_base = BedrockModel(
    model_id=BEDROCK_MODEL_REFERENCE_CHECK,
    region_name=REGION,
    boto_client_config=boto_config,
)


def call_agent(
    user_message: str, context: str, scenario_id: str, language: str = "ja"
) -> QueryKnowledgeBaseOutput:
    """
    Strands Agentを使用してリファレンスチェックを実行する

    Args:
      user_message: ユーザーのメッセージ
      context: 会話のコンテキスト
      scenario_id: シナリオID
      language: 使用言語 ("ja" または "en")

    Returns:
      リファレンスチェック結果の辞書
    """
    try:
        # 言語に応じたシステムプロンプトとプロンプトを設定
        if language == "en":
            system_prompt = "Please respond in English."
            
            prompt = f"""
Please verify the accuracy of the following user statement by referencing the Knowledge Base.
If no related documents are found in the Knowledge Base, evaluate based on general knowledge and sales best practices.

## Scenario ID
{scenario_id}

## Conversation Context
{context}

## Message to Verify
{user_message}

## Examples of Issues
- User explained "housing loan interest rate is 2-3%" but the document states "1%".
- User explained about group credit life insurance that "insurance pays out even if diagnosed with skin cancer", but the document states "skin cancer is excluded".
- User explained about summer air conditioner power consumption as "about 0.2kWh", but according to the document, this is for maintenance operation when room temperature reaches the set temperature, while power consumption immediately after turning on the air conditioner on extremely hot days is 1kWh. The explanation was insufficient.
- No related documents were found, but generally in sales, it's important to provide specific numerical evidence, and ambiguous expressions like "probably" or "maybe" should be avoided.

## Tools
check_single_message_reference: Can query the Knowledge Base. Searches for documents that support the user's statement.

## Processing Steps
1. Understand the conversation context to grasp what the conversation is about
2. Understand the user's statement intent based on the conversation context
3. Research documents that support the "Message to Verify" using the "check_single_message_reference" tool
4. Evaluate the validity of the "Message to Verify" based on the tool results
5. If no related documents are found in the Knowledge Base, evaluate based on general sales knowledge and best practices

## Evaluation Criteria
- **If documents are found and there are contradictions**: related=false, point out specific contradictions
- **If documents are found and there are no contradictions**: related=true, no issues
- **If no documents are found**: Evaluate based on general sales knowledge
  - If there are ambiguous expressions, unfounded assertions, inappropriate sales techniques, etc., then related=false
  - If there are no particular issues, then related=true

## Output Requirements
Generate structured output that must include the following 4 fields:
- message: User message to be verified
- relatedDocument: Quote evidence of contradictions between user's statement and document content. Empty string if no related information is found in Knowledge Base.
- reviewComment: Explain issues with reasons. Document-based issues or issues based on general sales knowledge. Empty string if no issues.
- related: Whether there are issues with the user's statement. False if contradicts documents or general sales best practices, true otherwise (true/false)

Note: Must generate structured output including the above 4 fields.
"""
            
            structured_output_instruction = """
Generate structured output that must include the following 4 fields:
- message: User message to be verified
- relatedDocument: Quote evidence of contradictions between user's statement and document content. Empty string if no related information is found in Knowledge Base.
- reviewComment: Explain issues with reasons. Document-based issues or issues based on general sales knowledge. Empty string if no issues.
- related: Whether there are issues with the user's statement. False if contradicts documents or general sales best practices, true otherwise (true/false)
"""
        else:
            # Japanese (default)
            system_prompt = "日本語で回答します"
            
            prompt = f"""
以下のユーザーの発言について、Knowledge Baseを参照して内容の正確性を検証してください。
Knowledge Baseに関連ドキュメントが見つからない場合は、一般的な知識や営業のベストプラクティスに基づいて評価してください。

## シナリオID
{scenario_id}

## 会話のコンテキスト
{context}

## 検証対象のメッセージ
{user_message}

## 指摘の例
- ユーザーは「住宅ローン金利は2-3%です」と説明したが、ドキュメントには「1%」と記載されている。
- ユーザーは団体信用生命保険の説明で「表皮ガンと診断されても保険金が出る」と説明したが、ドキュメントには「表皮ガンは対象外」と記載されている。
- ユーザーは夏のエアコンの消費電力について「0.2kWh程度」と説明したが、ドキュメントを参照すると、これは室温が設定温度になった場合の維持運転の場合の例であって、猛暑日にエアコンの電源を入れた直後の消費電力は1kWhである。説明が不足している。
- 関連ドキュメントは見つからなかったが、一般的に営業では具体的な数値の根拠を示すことが重要であり、「多分」「たぶん」といった曖昧な表現は避けるべきである。

## ツール
check_single_message_reference: Knowledge Baseのクエリが可能。ユーザー発言の根拠となるドキュメントを検索します。

## 処理ステップ
1. 会話のコンテキストを理解して、何についての会話が行われているかを理解する
2. 会話のコンテキストを踏まえて、ユーザーの発言の意図を理解する
3. 「検証対象のメッセージ」の根拠となるドキュメントを「check_single_message_reference」のツールで調査する
4. ツールの結果を踏まえて、「検証対象のメッセージ」の妥当性を評価する
5. Knowledge Baseで関連ドキュメントが見つからない場合は、一般的な営業知識・ベストプラクティスに基づいて評価する

## 判定基準
- **ドキュメントが見つかり矛盾がある場合**: related=false、具体的な矛盾点を指摘
- **ドキュメントが見つかり矛盾がない場合**: related=true、問題なし
- **ドキュメントが見つからない場合**: 一般的な営業知識に基づいて評価
  - 曖昧な表現、根拠のない断言、不適切な営業手法等があればrelated=false
  - 特に問題がなければrelated=true

## 出力要件
以下の4つのフィールドを必ず含む構造化された出力を生成してください
- message: 検証対象のユーザーメッセージ
- relatedDocument: ユーザーの発言とドキュメントに記載されている内容の矛盾の根拠を引用する。Knowledge Baseで関連情報が見つからない場合は空文字列。
- reviewComment: 指摘事項を理由をつけて説明する。ドキュメントベースの指摘、または一般的な営業知識に基づく指摘。問題がない場合は空文字列。
- related: ユーザーの発言に問題があるかどうか。ドキュメントとの矛盾、または一般的な営業ベストプラクティスに反する場合はfalse、それ以外はtrue（true/false）

注意: 必ず上記の4つのフィールドを含む構造化された出力を生成してください。
"""
            
            structured_output_instruction = """
以下の4つのフィールドを必ず含む構造化された出力を生成してください
- message: 検証対象のユーザーメッセージ
- relatedDocument: ユーザーの発言とドキュメントに記載されている内容の矛盾の根拠を引用する。Knowledge Baseで関連情報が見つからない場合は空文字列。
- reviewComment: 指摘事項を理由をつけて説明する。ドキュメントベースの指摘、または一般的な営業知識に基づく指摘。問題がない場合は空文字列。
- related: ユーザーの発言に問題があるかどうか。ドキュメントとの矛盾、または一般的な営業ベストプラクティスに反する場合はfalse、それ以外はtrue（true/false）
"""
        
        # 言語に応じたBedrockModelを作成
        bedrock_model = BedrockModel(
            model_id=bedrock_model_base.model_id,
            region_name=bedrock_model_base.region_name,
            system_prompt=system_prompt,
            boto_client_config=bedrock_model_base.boto_client_config,
        )

        logger.debug(f"prompt: {prompt}")

        agent = Agent(
            tools=[check_single_message_reference],
            model=bedrock_model,
        )

        agent(prompt)

        result = agent.structured_output(
            QueryKnowledgeBaseOutput,
            structured_output_instruction,
        )

        return result

    except Exception as e:
        logger.error(f"Error in call_agent: {str(e)}")
        raise e
