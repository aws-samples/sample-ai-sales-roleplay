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

# コマンドライン引数の解析
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --disable-self-register) ALLOW_SELF_REGISTER="false" ;;
        --bedrock-region) BEDROCK_REGION="$2"; shift ;;
        --cdk-json-override) CDK_JSON_OVERRIDE="$2"; shift ;;
        --repo-url) REPO_URL="$2"; shift ;;
        --version) VERSION="$2"; shift ;;
        *) echo "不明なパラメータ: $1"; exit 1 ;;
    esac
    shift
done

echo "以下の設定でデプロイを開始します:"
echo "- セルフサインアップ: $ALLOW_SELF_REGISTER"
echo "- Bedrockリージョン: $BEDROCK_REGION"
echo "- リポジトリURL: $REPO_URL"
echo "- バージョン/ブランチ: $VERSION"

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