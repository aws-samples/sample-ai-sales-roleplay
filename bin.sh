#!/bin/bash

echo ""
echo "==========================================================================="
echo "  🚀 AI営業ロールプレイアプリケーション デプロイツール                    "
echo "---------------------------------------------------------------------------"
echo "  このスクリプトは、AWS CloudShellからAI営業ロールプレイアプリケーションを"
echo "  簡単にデプロイするためのものです。                                      "
echo "                                                                           "
echo "  作業内容:                                                               "
echo "  - CloudFormationスタックの作成                                          "
echo "  - CodeBuildプロジェクトの実行                                           "
echo "  - アプリケーションのデプロイ（CDK）                                     "
echo "==========================================================================="
echo ""

# デフォルトのパラメータ
ALLOW_SELF_REGISTER="true"
BEDROCK_REGION="us-east-1"
CDK_JSON_OVERRIDE="{}"
REPO_URL="https://github.com/aws-samples/sample-ai-sales-roleplay.git"
VERSION="main"

# 個別モデル指定パラメータ
CONVERSATION_MODEL=""
SCORING_MODEL=""
FEEDBACK_MODEL=""
GUARDRAIL_MODEL=""
VIDEO_MODEL=""
REFERENCE_CHECK_MODEL=""

# コマンドライン引数の解析
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --disable-self-register) ALLOW_SELF_REGISTER="false" ;;
        --bedrock-region) BEDROCK_REGION="$2"; shift ;;
        --cdk-json-override) CDK_JSON_OVERRIDE="$2"; shift ;;
        --repo-url) REPO_URL="$2"; shift ;;
        --version) VERSION="$2"; shift ;;
        --conversation-model) CONVERSATION_MODEL="$2"; shift ;;
        --scoring-model) SCORING_MODEL="$2"; shift ;;
        --feedback-model) FEEDBACK_MODEL="$2"; shift ;;
        --guardrail-model) GUARDRAIL_MODEL="$2"; shift ;;
        --video-model) VIDEO_MODEL="$2"; shift ;;
        --reference-check-model) REFERENCE_CHECK_MODEL="$2"; shift ;;
        --help) 
            echo "使用方法: $0 [オプション]"
            echo ""
            echo "一般オプション:"
            echo "  --disable-self-register      セルフサインアップを無効化"
            echo "  --bedrock-region REGION      Bedrockリージョンを指定 (デフォルト: us-east-1)"
            echo "  --repo-url URL               GitHubリポジトリURLを指定"
            echo "  --version VERSION            デプロイするブランチ/タグを指定 (デフォルト: main)"
            echo "  --cdk-json-override JSON     CDK設定のJSONオーバーライド"
            echo ""
            echo "個別モデル指定オプション:"
            echo "  --conversation-model MODEL   対話用モデルを指定"
            echo "  --scoring-model MODEL        スコアリング用モデルを指定"
            echo "  --feedback-model MODEL       フィードバック用モデルを指定"
            echo "  --guardrail-model MODEL      ガードレール用モデルを指定"
            echo "  --video-model MODEL          動画分析用モデルを指定"
            echo "  --reference-check-model MODEL リファレンスチェック用モデルを指定"
            echo ""
            echo "モデル例:"
            echo "  us.anthropic.claude-3-5-haiku-20241022-v1:0"
            echo "  us.anthropic.claude-3-5-sonnet-20241022-v2:0"
            echo "  us.anthropic.claude-3-7-sonnet-20250219-v1:0"
            echo "  us.amazon.nova-lite-v1:0"
            echo "  us.amazon.nova-pro-v1:0"
            exit 0
            ;;
        *) echo "不明なパラメータ: $1"; echo "ヘルプを表示するには --help を使用してください"; exit 1 ;;
    esac
    shift
done

echo "以下の設定でデプロイを開始します:"
echo "- セルフサインアップ: $ALLOW_SELF_REGISTER"
echo "- Bedrockリージョン: $BEDROCK_REGION"
echo "- リポジトリURL: $REPO_URL"
echo "- バージョン/ブランチ: $VERSION"

# 個別モデル指定の表示
if [[ -n "$CONVERSATION_MODEL" || -n "$SCORING_MODEL" || -n "$FEEDBACK_MODEL" || -n "$GUARDRAIL_MODEL" || -n "$VIDEO_MODEL" || -n "$REFERENCE_CHECK_MODEL" ]]; then
    echo "- 個別モデル指定:"
    [[ -n "$CONVERSATION_MODEL" ]] && echo "  - 対話用モデル: $CONVERSATION_MODEL"
    [[ -n "$SCORING_MODEL" ]] && echo "  - スコアリング用モデル: $SCORING_MODEL"
    [[ -n "$FEEDBACK_MODEL" ]] && echo "  - フィードバック用モデル: $FEEDBACK_MODEL"
    [[ -n "$GUARDRAIL_MODEL" ]] && echo "  - ガードレール用モデル: $GUARDRAIL_MODEL"
    [[ -n "$VIDEO_MODEL" ]] && echo "  - 動画分析用モデル: $VIDEO_MODEL"
    [[ -n "$REFERENCE_CHECK_MODEL" ]] && echo "  - リファレンスチェック用モデル: $REFERENCE_CHECK_MODEL"
fi

if [[ "$CDK_JSON_OVERRIDE" != "{}" ]]; then
    echo "- CDK設定オーバーライド: $CDK_JSON_OVERRIDE"
fi

echo ""
read -p "続行しますか？ (y/N): " answer
case ${answer:0:1} in
    y|Y )
        echo "デプロイを開始します..."
        ;;
    * )
        echo "デプロイをキャンセルしました"
        exit 1
        ;;
esac

# テンプレートの検証
aws cloudformation validate-template --template-body file://deploy.yml > /dev/null 2>&1
if [[ $? -ne 0 ]]; then
    echo "テンプレートの検証に失敗しました"
    exit 1
fi

# モデルIDの基本形式をバリデーション
validate_model_id() {
    local model_id="$1"
    local model_type="$2"
    
    if [[ -z "$model_id" ]]; then
        return 0  # 空の場合はスキップ
    fi
    
    # 基本的なBedrockモデルIDの形式チェック（region.provider.model:version）
    if [[ ! "$model_id" =~ ^[a-z-]+\.[a-z]+\.[a-z0-9.-]+:[0-9]+$ ]]; then
        echo "警告: $model_type モデルID '$model_id' の形式が正しくない可能性があります"
        echo "  期待される形式: region.provider.model-name:version"
        echo "  例: us.anthropic.claude-3-5-haiku-20241022-v1:0"
        echo ""
        read -p "このまま続行しますか？ (y/N): " confirm
        case ${confirm:0:1} in
            y|Y ) return 0 ;;
            * ) echo "デプロイをキャンセルしました"; exit 1 ;;
        esac
    fi
    
    return 0
}

# Bedrockリージョンからリージョンタイプを判定
determine_region_type() {
    local region="$1"
    case $region in
        us-*) echo "us-regions" ;;
        ap-*) echo "ap-regions" ;;
        eu-*) echo "eu-regions" ;;
        *) echo "us-regions" ;; # デフォルトはUSリージョン
    esac
}

# 個別モデル指定からCDK JSONオーバーライドを生成
generate_model_override_json() {
    local model_override="{}"
    
    # bedrockModelsの部分的オーバーライドを構築
    if [[ -n "$CONVERSATION_MODEL" || -n "$SCORING_MODEL" || -n "$FEEDBACK_MODEL" || -n "$GUARDRAIL_MODEL" || -n "$VIDEO_MODEL" || -n "$REFERENCE_CHECK_MODEL" ]]; then
        local region_type=$(determine_region_type "$BEDROCK_REGION")
        
        # リージョンタイプに対応したモデル設定の基本構造を作成
        model_override=$(jq -n --arg region_type "$region_type" '{
            "context": {
                "default": {
                    "bedrockModels": {
                        ($region_type): {}
                    }
                }
            }
        }')
        
        # 指定されたモデルのみをリージョンタイプ配下に設定
        [[ -n "$CONVERSATION_MODEL" ]] && model_override=$(echo "$model_override" | jq --arg region_type "$region_type" --arg model "$CONVERSATION_MODEL" '.context.default.bedrockModels[$region_type].conversation = $model')
        [[ -n "$SCORING_MODEL" ]] && model_override=$(echo "$model_override" | jq --arg region_type "$region_type" --arg model "$SCORING_MODEL" '.context.default.bedrockModels[$region_type].scoring = $model')
        [[ -n "$FEEDBACK_MODEL" ]] && model_override=$(echo "$model_override" | jq --arg region_type "$region_type" --arg model "$FEEDBACK_MODEL" '.context.default.bedrockModels[$region_type].feedback = $model')
        [[ -n "$GUARDRAIL_MODEL" ]] && model_override=$(echo "$model_override" | jq --arg region_type "$region_type" --arg model "$GUARDRAIL_MODEL" '.context.default.bedrockModels[$region_type].guardrail = $model')
        [[ -n "$VIDEO_MODEL" ]] && model_override=$(echo "$model_override" | jq --arg region_type "$region_type" --arg model "$VIDEO_MODEL" '.context.default.bedrockModels[$region_type].video = $model')
        [[ -n "$REFERENCE_CHECK_MODEL" ]] && model_override=$(echo "$model_override" | jq --arg region_type "$region_type" --arg model "$REFERENCE_CHECK_MODEL" '.context.default.bedrockModels[$region_type].referenceCheck = $model')
    fi
    
    echo "$model_override"
}

# 既存のCDK_JSON_OVERRIDEと個別モデル指定を統合
if [[ -n "$CONVERSATION_MODEL" || -n "$SCORING_MODEL" || -n "$FEEDBACK_MODEL" || -n "$GUARDRAIL_MODEL" || -n "$VIDEO_MODEL" || -n "$REFERENCE_CHECK_MODEL" ]]; then
    echo "個別モデル指定からCDK設定を生成中..."
    
    # モデルIDのバリデーション
    validate_model_id "$CONVERSATION_MODEL" "対話用"
    validate_model_id "$SCORING_MODEL" "スコアリング用"
    validate_model_id "$FEEDBACK_MODEL" "フィードバック用"
    validate_model_id "$GUARDRAIL_MODEL" "ガードレール用"
    validate_model_id "$VIDEO_MODEL" "動画分析用"
    validate_model_id "$REFERENCE_CHECK_MODEL" "リファレンスチェック用"
    
    MODEL_OVERRIDE_JSON=$(generate_model_override_json)
    
    # 既存のCDK_JSON_OVERRIDEと統合
    if [[ "$CDK_JSON_OVERRIDE" != "{}" ]]; then
        # 既存の設定と新しいモデル設定をマージ
        CDK_JSON_OVERRIDE=$(echo "$CDK_JSON_OVERRIDE" | jq --argjson models "$MODEL_OVERRIDE_JSON" '. * $models')
    else
        CDK_JSON_OVERRIDE="$MODEL_OVERRIDE_JSON"
    fi
    
    echo "生成されたCDK設定オーバーライド: $CDK_JSON_OVERRIDE"
fi

StackName="AIRoleplayDeployStack"

# CloudFormationスタックのデプロイ
echo "CloudFormationスタックのデプロイを開始します..."
aws cloudformation deploy \
  --stack-name $StackName \
  --template-file deploy.yml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    AllowSelfRegister=$ALLOW_SELF_REGISTER \
    BedrockRegion="$BEDROCK_REGION" \
    CdkJsonOverride="$CDK_JSON_OVERRIDE" \
    RepoUrl="$REPO_URL" \
    Version="$VERSION"

echo "スタック作成の完了を待機しています..."
echo "注: このスタックはCDKデプロイ用のCodeBuildプロジェクトを含みます。"
spin='-\|/'
i=0
while true; do
    status=$(aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].StackStatus' --output text 2>/dev/null)
    if [[ "$status" == "CREATE_COMPLETE" || "$status" == "UPDATE_COMPLETE" ]]; then
        break
    elif [[ "$status" == "ROLLBACK_COMPLETE" || "$status" == "DELETE_FAILED" || "$status" == "CREATE_FAILED" ]]; then
        echo "スタック作成に失敗しました: $status"
        exit 1
    fi
    printf "\r${spin:i++%${#spin}:1}"
    sleep 1
done
echo -e "\n完了しました。\n"

# スタックの出力情報を取得
outputs=$(aws cloudformation describe-stacks --stack-name $StackName --query 'Stacks[0].Outputs')
projectName=$(echo $outputs | jq -r '.[] | select(.OutputKey=="ProjectName").OutputValue')

if [[ -z "$projectName" ]]; then
    echo "CodeBuildプロジェクト名の取得に失敗しました"
    exit 1
fi

echo "CodeBuildプロジェクト $projectName を開始します..."
buildId=$(aws codebuild start-build --project-name $projectName --query 'build.id' --output text)

if [[ -z "$buildId" ]]; then
    echo "CodeBuildプロジェクトの開始に失敗しました"
    exit 1
fi

echo "CodeBuildプロジェクトの完了を待機しています..."
echo "ビルドID: $buildId"
while true; do
    buildStatus=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].buildStatus' --output text)
    if [[ "$buildStatus" == "SUCCEEDED" || "$buildStatus" == "FAILED" || "$buildStatus" == "STOPPED" ]]; then
        break
    fi
    printf "."
    sleep 10
done
echo -e "\nCodeBuildプロジェクトのステータス: $buildStatus"

if [[ "$buildStatus" == "SUCCEEDED" ]]; then
    echo "デプロイが正常に完了しました！"
    
    # ビルドログの取得
    buildDetail=$(aws codebuild batch-get-builds --ids $buildId --query 'builds[0].logs.{groupName: groupName, streamName: streamName}' --output json)
    logGroupName=$(echo $buildDetail | jq -r '.groupName')
    logStreamName=$(echo $buildDetail | jq -r '.streamName')
    
    echo "ログ情報:"
    echo "- グループ名: $logGroupName"
    echo "- ストリーム名: $logStreamName"
    
    # CDKアプリケーションのURLを抽出
    logs=$(aws logs get-log-events --log-group-name $logGroupName --log-stream-name $logStreamName)
    CloudFrontURL=$(echo "$logs" | grep -o 'CloudFrontURL = [^ ]*' | cut -d' ' -f3 | tr -d '\n,')
    
    if [[ -n "$CloudFrontURL" ]]; then
        echo -e "\n🌐 アプリケーションURL: $CloudFrontURL"
    else
        echo -e "\nアプリケーションURLが見つかりませんでした。ログを確認してください。"
    fi
else
    echo "デプロイに失敗しました。CodeBuildログを確認してください。"
fi
