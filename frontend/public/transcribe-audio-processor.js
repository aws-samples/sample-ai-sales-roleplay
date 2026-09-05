/**
 * Transcribe 用 AudioWorkletProcessor
 *
 * 非推奨の ScriptProcessorNode を置き換えるためのオーディオ処理ワークレット。
 * オーディオレンダリングスレッド上で以下を行い、結果をメインスレッドへ送る:
 *   1. 入力（Float32, モノラル）から RMS ベースの音声レベルを算出
 *   2. Float32 を 16bit PCM (Int16) に変換
 *
 * メインスレッドへは { audioLevel: number, pcm: ArrayBuffer } を postMessage する。
 * pcm は Transferable として転送し、コピーを避ける。
 *
 * このファイルは public/ 配下に置き、AudioContext.audioWorklet.addModule() で
 * '/transcribe-audio-processor.js' として読み込む。
 */
class TranscribeAudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];

    // 入力チャンネルが無い場合（無音や未接続）は処理を継続
    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    // RMS ベースの音声レベル計算（0-100 スケール）
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);
    const audioLevel = rms * 100;

    // Float32 -> Int16 PCM 変換
    const pcm = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      pcm[i] = Math.max(-32768, Math.min(32767, s * 32767));
    }

    // メインスレッドへ送信（PCM バッファは Transferable として転送）
    this.port.postMessage(
      { audioLevel, pcm: pcm.buffer },
      [pcm.buffer]
    );

    // true を返してプロセッサを生かし続ける
    return true;
  }
}

registerProcessor('transcribe-audio-processor', TranscribeAudioProcessor);
