/**
 * アバター管理APIサービス
 * VRMアバターのCRUD操作を提供
 */
import { post, del, put, get } from "aws-amplify/api";
import { getCurrentUser, fetchAuthSession, signOut } from "aws-amplify/auth";

/** アバターメタデータ */
export interface AvatarMetadata {
  userId: string;
  avatarId: string;
  name: string;
  fileName: string;
  s3Key: string;
  contentType: string;
  status: 'uploading' | 'active';
  createdAt: number;
  updatedAt: number;
}

/** アバター作成レスポンス */
export interface AvatarCreateResponse {
  success: boolean;
  avatarId: string;
  uploadUrl: string;
  formData: Record<string, string>;
  avatar: AvatarMetadata;
}

export class AvatarService {
  private static instance: AvatarService;

  private constructor() { }

  public static getInstance(): AvatarService {
    if (!AvatarService.instance) {
      AvatarService.instance = new AvatarService();
    }
    return AvatarService.instance;
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      await getCurrentUser();
      const authSession = await fetchAuthSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authSession.tokens?.idToken) {
        headers["Authorization"] = authSession.tokens.idToken.toString();
        const payload = authSession.tokens.idToken.payload;
        const expectedClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;
        if (payload.aud !== expectedClientId) {
          await signOut();
          throw new Error("設定が更新されました。再ログインしてください。");
        }
      }
      return headers;
    } catch {
      throw new Error("ユーザーがログインしていません");
    }
  }

  /** アバター作成（メタデータ登録 + アップロードURL取得） */
  public async createAvatar(
    fileName: string,
    name: string,
    contentType: string = 'application/octet-stream'
  ): Promise<AvatarCreateResponse> {
    const headers = await this.getAuthHeaders();
    const restOperation = post({
      apiName: "AISalesRoleplayAPI",
      path: "/avatars",
      options: {
        body: { fileName, name, contentType } as never,
        headers,
      },
    });
    const response = await restOperation.response;
    return JSON.parse(await response.body.text()) as AvatarCreateResponse;
  }

  /** VRMファイルをS3にアップロード */
  public async uploadVrmFile(
    uploadUrl: string,
    formData: Record<string, string>,
    file: File
  ): Promise<void> {
    const formDataObj = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      formDataObj.append(key, value);
    });
    formDataObj.append("file", file);

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: formDataObj,
    });

    if (!response.ok) {
      throw new Error(`アップロード失敗: ${response.status}`);
    }
  }

  /** アップロード完了確認 */
  public async confirmUpload(avatarId: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const restOperation = put({
      apiName: "AISalesRoleplayAPI",
      path: `/avatars/${avatarId}/confirm`,
      options: {
        body: {} as never,
        headers,
      },
    });
    await restOperation.response;
  }

  /** アバター詳細取得 */
  public async getAvatarDetail(avatarId: string): Promise<AvatarMetadata | null> {
    try {
      const headers = await this.getAuthHeaders();
      const restOperation = get({
        apiName: "AISalesRoleplayAPI",
        path: `/avatars/${avatarId}`,
        options: { headers },
      });
      const response = await restOperation.response;
      const data = JSON.parse(await response.body.text()) as { success: boolean; avatar?: AvatarMetadata };
      return data.success && data.avatar ? data.avatar : null;
    } catch {
      console.warn("アバター詳細取得失敗（共有アバターの可能性）:", avatarId);
      return null;
    }
  }

  /** アバター削除 */
  public async deleteAvatar(avatarId: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const restOperation = del({
      apiName: "AISalesRoleplayAPI",
      path: `/avatars/${avatarId}`,
      options: { headers },
    });
    await restOperation.response;
  }
}
