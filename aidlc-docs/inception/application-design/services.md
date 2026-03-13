# サービス定義 - 3Dアバター機能

## 1. 概要

本ドキュメントでは、3Dアバター機能を実現するためのサービス層の設計を記述します。

### 1.1 既存システムとの整合性

既存システムでは、ApiServiceやPollyServiceなどのサービスクラスがシングルトンパターンで実装されています。本設計でも同じパターンを踏襲し、一貫性を保ちます。

感情状態については、既存の`EmotionState`型（angry, annoyed, neutral, satisfied, happy）をそのまま使用します。

認証については、将来的にAPI化する際にCognito IDトークンによる認証方式を採用します。

---

## 2. 新規サービス

### 2.1 AvatarService

AvatarServiceは、アバター情報の取得と管理を担当する新規サービスです。`frontend/src/services/AvatarService.ts`に配置します。

このサービスの主な責務は以下の3つです。

1. アバター情報の取得と管理
2. アバター一覧のキャッシュ
3. デフォルトアバターの解決

設計パターンは既存サービスと同様にシングルトンを採用します。getInstanceメソッドでインスタンスを取得し、アプリケーション全体で単一のインスタンスを共有します。

主要なメソッドとして、getAvatarListでアバター一覧を取得し、getAvatarInfoで指定IDのアバター情報を取得します。getDefaultAvatarはデフォルトアバターを返し、resolveAvatarIdはアバターIDが未設定の場合にデフォルトを解決します。getModelUrlはアバター情報からモデルファイルのURLを生成します。

内部的にはloadManifestメソッドでmanifest.jsonを読み込み、マニフェストとアバター情報をキャッシュして重複リクエストを防止します。

データフローとしては、シナリオ選択時にavatarIdを取得し、未設定の場合はデフォルトを解決、その後モデルURLを含む詳細情報を取得してVRMAvatarContainerに渡します。

---

## 3. 既存サービスの拡張

### 3.1 PollyService拡張

PollyService（`frontend/src/services/PollyService.ts`）には、Phase 2でVisemeデータ取得機能を追加します。

追加するsynthesizeSpeechWithVisemeメソッドは、テキストとオプションのvoiceIdを受け取り、音声URLとVisemeデータを同時に返却します。

Phase 2での変更点として、既存のsynthesizeSpeech呼び出しをsynthesizeSpeechWithVisemeに置き換え、バックエンドのPolly Lambda関数でSpeech Marks APIを呼び出してVisemeデータを取得します。

Visemeデータは、音声開始からのミリ秒を示すtimeと、母音（a, i, u, e, o）またはサイレンスを示すvalueで構成されます。

---

### 3.2 ApiService拡張

ApiService（`frontend/src/services/ApiService.ts`）には、アバター関連のAPIメソッドを追加します。

getAvatarListメソッドはGET /avatarsエンドポイントを呼び出してアバター一覧を取得し、getAvatarInfoメソッドはGET /avatars/{avatarId}エンドポイントを呼び出して指定アバターの詳細情報を取得します。

ただし、初期実装ではバックエンドAPIは不要です。アバター情報はフロントエンドのpublic/models/avatars/配下のマニフェストファイルから取得します。将来的にユーザーがアバターをアップロードする機能を追加する際にAPI化します。

---

### 3.3 AudioService拡張

AudioService（`frontend/src/services/AudioService.ts`）には、LipSyncController用に現在再生中の音声要素へのアクセス機能を追加します。

追加するgetCurrentAudioElementメソッドは、現在再生中の音声要素を返却します。再生中でない場合はnullを返します。

現在のAudioService.tsにはこのメソッドが未実装のため、新規に追加が必要です。既存のaudioQueueとisPlayingプロパティを活用し、audioQueueに要素があり、かつisPlayingがtrueの場合にキューの先頭の音声要素を返却します。

また、getIsPlayingメソッドも追加し、音声が再生中かどうかを取得できるようにします。

実装時の注意点として、既存の構造を再利用し新規プロパティの追加は不要です。LipSyncControllerはgetCurrentAudioElementがnullを返す場合、リップシンクを無効化します。

---

### 3.4 AgentCoreService（変更なし）

AgentCoreService（`frontend/src/services/AgentCoreService.ts`）は変更不要です。

既存のchatWithNPCメソッドはresponse、sessionId、messageIdを含むオブジェクトを返却し、getRealtimeEvaluationメソッドはscores（angerLevel、trustLevel、progressLevel）、analysis、goalStatuses、complianceを含むオブジェクトを返却します。

感情状態はフロントエンド側で既存のcalculateEmotionState関数を使用して計算するため、バックエンドの変更は不要です。VRMAvatarContainer内でメトリクスから感情を計算し、表情に反映します。

---

## 4. サービス間の連携

### 4.1 会話フロー

会話開始時には、まずシナリオからavatarIdを取得します。AvatarServiceのresolveAvatarIdでアバターIDを解決し、getAvatarInfoでモデルURLを含む詳細情報を取得します。その後、VRMAvatarContainerにavatarIdを渡し、AvatarContextがアバター情報をロードします。

NPC応答時には、AgentCoreServiceからNPC応答を取得し、ConversationPageがcurrentMetricsを更新します。VRMAvatarContainerはpropsで受け取ったメトリクスから感情を計算し、onEmotionChangeコールバックでConversationPageに通知します。PollyServiceで音声を合成し、音声再生開始時にConversationPageがisSpeakingをtrueに設定します。LipSyncControllerがAudioServiceから音声要素を取得して接続し、音声再生終了時にisSpeakingをfalseに設定します。

リアルタイム評価時には、AgentCoreServiceからスコア情報を取得し、ConversationPageがcurrentMetricsを更新します。VRMAvatarContainerがpropsの変更を検知して感情を再計算します。

---

## 5. エラーハンドリング

### 5.1 アバターロードエラー

VRMファイルが見つからない場合はデフォルトアバターにフォールバックします。VRMファイルが破損している場合はエラーメッセージを表示します。ネットワークエラーの場合はリトライ後にエラーメッセージを表示します。

### 5.2 WebGL非対応

WebGL非対応ブラウザの場合は「お使いのブラウザは3Dアバターに対応していません」と表示します。GPUメモリ不足の場合はエラーをキャッチしてメッセージを表示します。

### 5.3 音声合成エラー

Polly APIエラーの場合は音声なしで会話を継続します。Visemeデータ取得エラーの場合はPhase 1（音量ベース）のリップシンクにフォールバックします。
