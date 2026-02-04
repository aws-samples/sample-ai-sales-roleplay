FROM public.ecr.aws/docker/library/python:3.11-slim

WORKDIR /app

# 依存関係をインストール
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# 環境変数
ENV AWS_REGION=us-west-2
ENV AWS_DEFAULT_REGION=us-west-2

# 非rootユーザー作成
RUN useradd -m -u 1000 bedrock_agentcore
USER bedrock_agentcore

EXPOSE 8080

# エージェントコードをコピー
COPY . .

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/ping || exit 1

# エントリーポイント
CMD ["python", "agent.py"]
