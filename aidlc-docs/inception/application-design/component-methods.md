# コンポーネントメソッド定義 - 3Dアバター機能

## 1. VRMAvatar

Three.jsを使用してVRMモデルを3Dレンダリングするメインコンポーネント。

**パス**: `frontend/src/components/avatar/VRMAvatar.tsx`

### メソッド

**初期化処理（マウント時）**

コンポーネントがマウントされた際に、Three.jsのシーン、カメラ、レンダラーを初期化する。カメラは視野角30度のPerspectiveCameraを使用し、レンダラーはアンチエイリアスと透過背景を有効にしたWebGLRendererを使用する。

VRMLoaderを使用してモデルURLからVRMファイルを非同期でロードし、ロード進捗をコールバックで通知する。ロード完了後、ExpressionController、LipSyncController、AnimationControllerの各コントローラーを初期化し、待機アニメーションを開始する。ロード成功時はonLoadコールバック、失敗時はonErrorコールバックを呼び出す。

**感情更新処理**

感情状態（emotion）プロパティが変更された際に、ExpressionControllerのsetEmotionメソッドを呼び出してVRMの表情を更新する。既存のEmotionState型（happy, satisfied, neutral, annoyed, angry）を使用する。

**リップシンク更新処理**

isSpeakingプロパティがtrueになった際に、LipSyncControllerのconnectToAudioServiceメソッドを呼び出して音声接続を開始する。falseになった際はdisconnectメソッドで接続を解除する。

**リサイズ処理**

ウィンドウサイズが変更された際に、Canvasのサイズを親要素に合わせて調整し、カメラのアスペクト比を更新してprojectionMatrixを再計算する。

**アニメーションループ**

requestAnimationFrameを使用して60fpsでレンダリングを実行する。各フレームでExpressionController、LipSyncController、AnimationControllerのupdateメソッドを呼び出し、レンダラーでシーンを描画する。

**クリーンアップ処理**

コンポーネントがアンマウントされる際に、cancelAnimationFrameでアニメーションループを停止し、各コントローラーのdisposeメソッドを呼び出す。VRMのシーンをtraverseしてすべてのMeshのgeometryとmaterialを解放し、最後にレンダラーを解放する。

---

## 2. VRMAvatarContainer

VRMAvatarのラッパーコンポーネントで、AvatarContextとの連携やエラー表示を担当。

**パス**: `frontend/src/components/avatar/VRMAvatarContainer.tsx`

### プロパティ（EmojiFeedbackContainerと同等）

- avatarId: アバターID（オプション、未指定時はデフォルト）
- angerLevel: 怒りレベル（0-10）
- trustLevel: 信頼度（0-10）
- progressLevel: 進捗度（0-10）
- isSpeaking: 発話中フラグ
- onEmotionChange: 感情変化コールバック（EmotionState型を引数に取る）

### メソッド

**WebGLサポートチェック**

ブラウザがWebGL 2.0またはWebGLに対応しているかを確認する。canvas要素を作成し、webgl2またはwebglコンテキストの取得を試みる。取得できない場合はfalseを返し、エラーメッセージを表示する。

**感情状態の計算**

useMemoを使用して、angerLevel、trustLevel、progressLevelの3つのメトリクスから感情状態を計算する。既存のemotionUtils.tsにあるcalculateEmotionState関数を使用する。感情状態が変更された際はuseEffectでonEmotionChangeコールバックを呼び出し、親コンポーネント（ConversationPage）に通知する。

**アバター情報取得**

useAvatarContextフックを使用してAvatarContextからavatarInfo、isLoading、error、loadAvatarを取得する。avatarIdプロパティが変更された際にuseEffectでloadAvatarを呼び出す。avatarIdがundefinedの場合はデフォルトアバターをロードする。

**アバターロード完了ハンドラ**

VRMモデルのロードが完了した際に呼び出され、ローディングインジケーターを非表示にする。

**アバターエラーハンドラ**

VRMモデルのロードに失敗した際に呼び出され、エラー状態を設定してエラーメッセージを表示する。

---

## 3. VRMLoader

VRMファイルを非同期でロードするユーティリティクラス。

**パス**: `frontend/src/components/avatar/VRMLoader.ts`

### メソッド

**コンストラクタ**

Three.jsのGLTFLoaderを初期化し、@pixiv/three-vrmパッケージのVRMLoaderPluginを登録する。これによりGLTFLoaderがVRM形式のファイルを解析できるようになる。

**ロード処理（loadメソッド）**

指定されたURLからVRMファイルを非同期でロードする。第1引数にURL、第2引数に進捗コールバック関数を受け取る。Promiseを返し、成功時はVRMインスタンスを解決する。VRM0形式の場合は互換性のためにY軸周りに180度回転する処理を適用する。

**リソース解放（disposeメソッド）**

ローダーが保持するリソースを解放する。

---

## 4. ExpressionController

VRMの表情プリセットを制御するクラス。

**パス**: `frontend/src/components/avatar/ExpressionController.ts`

### メソッド

**コンストラクタ**

VRMインスタンスを受け取り、表情制御の初期状態を設定する。現在の表情、目標の表情、トランジション進捗を管理する内部変数を初期化する。

**感情設定（setEmotionメソッド）**

既存のEmotionState型（happy, satisfied, neutral, annoyed, angry）を受け取り、types/avatar.tsで定義されたEMOTION_TO_VRM_EXPRESSIONマッピングを使用してVRMの表情プリセット（happy, relaxed, neutral, angry）と強度に変換する。オプションの第2引数で強度を上書きできる。

**更新処理（updateメソッド）**

毎フレーム呼び出され、現在の表情から目標の表情へスムーズにトランジションする。線形補間を使用し、トランジション速度は設定可能（デフォルトは0.1）。急激な表情変化を防ぎ、自然な表情遷移を実現する。

**リソース解放（disposeメソッド）**

コントローラーが保持するリソースを解放する。

---

## 5. LipSyncController

音声と同期して口形状を制御するクラス。Phase 1では音量ベース、Phase 2ではVisemeベースの制御を行う。

**パス**: `frontend/src/components/avatar/LipSyncController.ts`

### メソッド

**コンストラクタ**

VRMインスタンスを受け取り、リップシンク制御の初期状態を設定する。AudioContext、AnalyserNode、Visemeデータを管理する内部変数を初期化する。

**AudioService接続（connectToAudioServiceメソッド）**

AudioService.getInstance()から現在再生中の音声要素（HTMLAudioElement）を取得する。音声要素が存在する場合、AudioContextを作成し、AnalyserNodeを生成する。createMediaElementSourceで音声要素をソースとして接続し、AnalyserNodeを経由してdestinationに出力する。これにより音声を再生しながら音量データを取得できる。

**Visemeデータ設定（setVisemeDataメソッド）**

Phase 2で使用。Amazon Polly Speech Marks APIから取得したVisemeデータ（タイムスタンプと母音情報の配列）を設定する。

**更新処理（updateメソッド）**

毎フレーム呼び出される。Phase 1ではAnalyserNodeのgetByteFrequencyDataで周波数データを取得し、音量の平均値を計算して口の開き具合（0.0〜1.0）に変換する。Phase 2では現在の音声再生時刻に対応するVisemeを検索し、適切な口形状（aa, ih, ou, ee, oh）をVRMのBlendShapeに設定する。

**接続解除（disconnectメソッド）**

AudioContextをcloseし、AnalyserNodeへの参照を解放する。音声接続を解除する。

**リソース解放（disposeメソッド）**

disconnectを呼び出し、コントローラーが保持するすべてのリソースを解放する。

---

## 6. AnimationController

瞬きや呼吸などの待機アニメーションを制御するクラス。

**パス**: `frontend/src/components/avatar/AnimationController.ts`

### メソッド

**コンストラクタ**

VRMインスタンスを受け取り、アニメーション制御の初期状態を設定する。次の瞬きタイミングを2〜6秒のランダム値で決定する。呼吸アニメーションの位相を初期化する。

**待機アニメーション開始（startIdleAnimationsメソッド）**

瞬きと呼吸のアニメーションを有効化するフラグを設定する。

**待機アニメーション停止（stopIdleAnimationsメソッド）**

すべての待機アニメーションを無効化するフラグを設定する。

**更新処理（updateメソッド）**

毎フレーム呼び出される。瞬きは経過時間が次の瞬きタイミングを超えた場合に発生し、約0.1秒かけてblinkのBlendShapeを0から1に上げて0に戻す。瞬き完了後、次のタイミングを2〜6秒後にランダムで設定する。呼吸は4秒周期のサイン波でY軸方向に±0.5%の微小な揺れを発生させる。prefers-reduced-motionが有効な場合はアニメーションを無効化する。

**リソース解放（disposeメソッド）**

アニメーションを停止し、リソースを解放する。

---

## 7. AvatarContext

アバター情報を一元管理するReact Context。アバター固有の状態のみを管理し、感情状態やisSpeakingはConversationPageで管理する。

**パス**: `frontend/src/components/avatar/AvatarContext.tsx`

### 状態（最小限）

- currentAvatarId: 現在のアバターID（string | null）
- avatarInfo: アバター情報（AvatarInfo | null）
- isLoading: ローディング状態（boolean）
- error: エラー情報（Error | null）

### メソッド

**アバターロード（loadAvatarメソッド）**

useCallbackでメモ化された非同期関数。アバターIDを受け取り、AvatarService.getInstance()を通じてアバター情報を取得する。IDがundefinedの場合はgetDefaultAvatarでデフォルトアバターをロードする。処理開始時にisLoadingをtrue、errorをnullに設定し、成功時はavatarInfoとcurrentAvatarIdを更新、失敗時はerrorを設定する。finallyでisLoadingをfalseに戻す。

**設計理由**

以下の状態はConversationPageで既に管理されているため、AvatarContextでは管理しない：
- isSpeaking: AudioServiceの再生状態と連動してConversationPageで管理
- currentEmotion: VRMAvatarContainerからonEmotionChangeで通知されConversationPageで管理
- currentMetrics: APIから取得されConversationPageで管理
- audioElement: AudioService.getInstance().getCurrentAudioElement()から取得

これにより二重管理を避け、既存のデータフローを維持する。

---

## 8. AvatarService

アバター情報の取得と管理を行うサービスクラス。

**パス**: `frontend/src/services/AvatarService.ts`

### メソッド

**インスタンス取得（getInstanceメソッド）**

シングルトンパターンでインスタンスを取得する。インスタンスが存在しない場合は新規作成し、存在する場合は既存のインスタンスを返す。

**アバター一覧取得（getAvatarListメソッド）**

利用可能なすべてのアバター情報を取得する。manifest.jsonをfetchでロードし、avatars配列を返す。サムネイルURL、名前、説明を含む。結果はキャッシュされ、2回目以降はキャッシュから返す。

**アバター情報取得（getAvatarInfoメソッド）**

指定されたアバターIDに対応するアバター情報を取得する。まずキャッシュを確認し、存在しない場合はmanifest.jsonから検索する。モデルURLを含む。見つからない場合はエラーをスローする。

**デフォルトアバター取得（getDefaultAvatarメソッド）**

デフォルトとして設定されているアバター情報を取得する。manifest.jsonのavatars配列からisDefaultがtrueのものを検索する。見つからない場合は配列の最初の要素をフォールバックとして返す。シナリオにアバターが未設定の場合に使用される。

---

## 9. AvatarSelector

シナリオ管理画面でアバターを選択するUIコンポーネント。

**パス**: `frontend/src/components/avatar/AvatarSelector.tsx`

### メソッド

**アバター一覧ロード**

useEffectでコンポーネントマウント時にAvatarService.getInstance().getAvatarList()を呼び出し、アバター一覧を取得してstateに保存する。ローディング中はスケルトンUIを表示する。

**アバター選択ハンドラ**

ユーザーがアバターサムネイルをクリックした際に呼び出される。選択されたアバターIDをonSelectコールバックで親コンポーネントに通知する。選択状態はselectedAvatarIdプロパティで管理される。

---

## 10. AvatarThumbnail

S3に保存されたサムネイル画像を表示するコンポーネント。

**パス**: `frontend/src/components/avatar/AvatarThumbnail.tsx`

### プロパティ

- avatarId: アバターID（string）
- thumbnailUrl: S3に保存されたサムネイル画像URL（string）
- size: サイズ（number、デフォルト: 80px、オプション）
- onClick: クリックハンドラ（関数、オプション）
- selected: 選択状態（boolean、オプション）

### メソッド

**クリックハンドラ**

サムネイルがクリックされた際に、onClickプロパティが設定されていれば呼び出す。親コンポーネント（AvatarSelector）に通知する。

**サムネイル生成タイミング**

- Phase 1（MVP）: 管理者が手動でVRMファイルとサムネイル画像を配置
- 将来: アバター登録時にフロントエンドでVRMをCanvasにレンダリングし、toDataURL()でPNG画像を生成してS3にアップロード
