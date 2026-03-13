/**
 * VRMファイルローダー
 * GLTFLoader + VRMLoaderPluginを使用してVRMファイルを非同期ロード
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';

export type LoadProgressCallback = (progress: number) => void;

export class VRMLoader {
  private loader: GLTFLoader;
  private currentVRM: VRM | null = null;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));
  }

  /**
   * VRMファイルを非同期ロード
   */
  async load(url: string, onProgress?: LoadProgressCallback): Promise<VRM> {
    console.log('VRMLoader: Loading VRM from URL:', url);
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm as VRM;
          if (!vrm) {
            reject(new Error('VRMデータが見つかりません'));
            return;
          }

          // @pixiv/three-vrm v3.xでは VRMUtils.rotateVRM0 を使用
          // VRM 0.x形式の場合のみ回転処理が必要
          // VRM 1.0形式の場合は回転処理不要
          try {
            // VRMUtilsが存在し、rotateVRM0メソッドがある場合のみ実行
            if (typeof VRMUtils?.rotateVRM0 === 'function') {
              VRMUtils.rotateVRM0(vrm);
            }
          } catch {
            // 回転処理に失敗しても続行（VRM 1.0の場合は不要なため）
          }

          this.currentVRM = vrm;
          resolve(vrm);
        },
        (progress) => {
          if (onProgress && progress.total > 0) {
            const percent = (progress.loaded / progress.total) * 100;
            onProgress(percent);
          }
        },
        (error) => {
          console.error('VRMロードエラー:', error);
          reject(error instanceof Error ? error : new Error('VRMロードに失敗しました'));
        }
      );
    });
  }

  /**
   * 現在のVRMを取得
   */
  getCurrentVRM(): VRM | null {
    return this.currentVRM;
  }

  /**
   * リソース解放
   */
  dispose(): void {
    if (this.currentVRM) {
      // VRMのシーンからすべてのオブジェクトを削除
      this.currentVRM.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else {
            object.material?.dispose();
          }
        }
      });
      this.currentVRM = null;
    }
  }
}

export default VRMLoader;
