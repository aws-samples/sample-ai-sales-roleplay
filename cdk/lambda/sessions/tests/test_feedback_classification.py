"""
フィードバックデータ分類ロジックのテスト

バグ再現: DynamoDBから降順ソートで取得したfeedback_itemsをループで処理する際、
final-feedbackレコードが複数存在すると最も古いレコード（goalResultsなし）で
上書きされ、ゴール達成状況が失われる問題の回帰テスト
"""
import pytest


def classify_feedback_items(feedback_items):
    """
    analysis_results_handlers.pyのフィードバック分類ロジックを再現
    （修正後のバージョン）
    """
    final_feedback = None
    dynamodb_realtime_metrics = []

    for item in feedback_items:
        data_type = item.get('dataType')

        if data_type == 'final-feedback':
            if final_feedback is None:
                final_feedback = item
        elif data_type == 'realtime-metrics':
            dynamodb_realtime_metrics.append(item)

    return final_feedback, dynamodb_realtime_metrics


def classify_feedback_items_buggy(feedback_items):
    """
    修正前のバグがあるバージョン（回帰テスト用）
    最後に見つかったfinal-feedbackで上書きしてしまう
    """
    final_feedback = None
    dynamodb_realtime_metrics = []

    for item in feedback_items:
        data_type = item.get('dataType')

        if data_type == 'final-feedback':
            final_feedback = item  # バグ: 上書きしてしまう
        elif data_type == 'realtime-metrics':
            dynamodb_realtime_metrics.append(item)

    return final_feedback, dynamodb_realtime_metrics


class TestFeedbackClassification:
    """フィードバック分類ロジックのテスト"""

    def test_複数のfinal_feedbackがある場合_最新のレコードが使われる(self):
        """
        バグ再現シナリオ:
        - scoring Lambdaが先にfinal-feedbackを保存（goalResultsなし）
        - sessionAnalysis Lambdaが後にfinal-feedbackを保存（goalResultsあり）
        - DynamoDBクエリは降順ソート（最新が先頭）
        - 修正後: 最初に見つかった（=最新の）レコードが使われる
        """
        # DynamoDB降順ソート: 最新（sessionAnalysis）が先頭
        feedback_items = [
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:49:07.346Z-feedback",
                "dataType": "final-feedback",
                "feedbackData": {"scores": {"overall": 15}},
                "finalMetrics": {"angerLevel": 1, "trustLevel": 4, "progressLevel": 3},
                "goalResults": {
                    "scenarioGoals": [
                        {"id": "goal-1", "description": "挨拶をする", "isRequired": True, "priority": 3}
                    ],
                    "goalStatuses": [
                        {"goalId": "goal-1", "achieved": True, "progress": 100, "achievedAt": 1770706147346}
                    ],
                    "goalScore": 100
                }
            },
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:48:35.000Z",
                "dataType": "realtime-metrics",
                "angerLevel": 1,
                "trustLevel": 4,
                "progressLevel": 3,
                "messageNumber": 1,
            },
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:48:33.000Z-feedback",
                "dataType": "final-feedback",
                "feedbackData": {"scores": {"overall": 10}},
                "finalMetrics": {"angerLevel": 1, "trustLevel": 3, "progressLevel": 2},
                # goalResultsなし（scoring Lambdaが保存した古いレコード）
            },
        ]

        final_feedback, metrics = classify_feedback_items(feedback_items)

        # 最新のfinal-feedbackが使われること
        assert final_feedback is not None
        assert final_feedback["goalResults"] is not None
        assert final_feedback["goalResults"]["goalScore"] == 100
        assert final_feedback["goalResults"]["goalStatuses"][0]["achieved"] is True
        assert final_feedback["goalResults"]["goalStatuses"][0]["progress"] == 100

    def test_バグ版では古いレコードが使われてgoalResultsが失われる(self):
        """修正前のバグを再現: 古いレコード（goalResultsなし）が使われる"""
        feedback_items = [
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:49:07.346Z-feedback",
                "dataType": "final-feedback",
                "goalResults": {
                    "goalStatuses": [{"goalId": "goal-1", "achieved": True, "progress": 100}],
                    "goalScore": 100
                }
            },
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:48:33.000Z-feedback",
                "dataType": "final-feedback",
                # goalResultsなし
            },
        ]

        final_feedback, _ = classify_feedback_items_buggy(feedback_items)

        # バグ版: 古いレコードで上書きされ、goalResultsがNoneになる
        assert final_feedback.get("goalResults") is None

    def test_final_feedbackが1つだけの場合は正常に動作する(self):
        """final-feedbackが1つだけの場合は修正前後で同じ結果"""
        feedback_items = [
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:49:07.346Z-feedback",
                "dataType": "final-feedback",
                "goalResults": {
                    "goalStatuses": [{"goalId": "goal-1", "achieved": True, "progress": 100}],
                    "goalScore": 100
                }
            },
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:48:35.000Z",
                "dataType": "realtime-metrics",
                "angerLevel": 1,
            },
        ]

        final_feedback, metrics = classify_feedback_items(feedback_items)

        assert final_feedback is not None
        assert final_feedback["goalResults"]["goalScore"] == 100
        assert len(metrics) == 1

    def test_final_feedbackがない場合はNoneが返る(self):
        """final-feedbackレコードがない場合"""
        feedback_items = [
            {
                "sessionId": "session-123",
                "createdAt": "2026-02-10T06:48:35.000Z",
                "dataType": "realtime-metrics",
                "angerLevel": 1,
            },
        ]

        final_feedback, metrics = classify_feedback_items(feedback_items)

        assert final_feedback is None
        assert len(metrics) == 1

    def test_空のfeedback_itemsの場合(self):
        """feedback_itemsが空の場合"""
        final_feedback, metrics = classify_feedback_items([])

        assert final_feedback is None
        assert len(metrics) == 0

    def test_リアルタイムメトリクスは全て収集される(self):
        """realtime-metricsは全て収集されること"""
        feedback_items = [
            {"dataType": "final-feedback", "goalResults": {"goalScore": 100}},
            {"dataType": "realtime-metrics", "messageNumber": 3},
            {"dataType": "realtime-metrics", "messageNumber": 2},
            {"dataType": "realtime-metrics", "messageNumber": 1},
        ]

        _, metrics = classify_feedback_items(feedback_items)

        assert len(metrics) == 3
