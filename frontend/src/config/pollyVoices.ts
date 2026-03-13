/**
 * Amazon Polly 音声モデル定義
 * 言語別のneural/generativeモデル一覧
 */

/** 音声モデル情報 */
export interface PollyVoiceModel {
  voiceId: string;
  displayName: string;
  gender: 'male' | 'female' | 'male_child' | 'female_child';
  engines: ('neural' | 'generative')[];
}

/** 言語別音声モデル一覧 */
export const POLLY_VOICES: Record<string, PollyVoiceModel[]> = {
  ja: [
    { voiceId: 'Takumi', displayName: 'Takumi', gender: 'male', engines: ['neural'] },
    { voiceId: 'Kazuha', displayName: 'Kazuha', gender: 'female', engines: ['neural'] },
    { voiceId: 'Tomoko', displayName: 'Tomoko', gender: 'female', engines: ['neural'] },
  ],
  en: [
    { voiceId: 'Danielle', displayName: 'Danielle', gender: 'female', engines: ['neural', 'generative'] },
    { voiceId: 'Gregory', displayName: 'Gregory', gender: 'male', engines: ['neural'] },
    { voiceId: 'Ivy', displayName: 'Ivy', gender: 'female_child', engines: ['neural'] },
    { voiceId: 'Joanna', displayName: 'Joanna', gender: 'female', engines: ['neural', 'generative'] },
    { voiceId: 'Kendra', displayName: 'Kendra', gender: 'female', engines: ['neural'] },
    { voiceId: 'Kimberly', displayName: 'Kimberly', gender: 'female', engines: ['neural'] },
    { voiceId: 'Salli', displayName: 'Salli', gender: 'female', engines: ['neural', 'generative'] },
    { voiceId: 'Joey', displayName: 'Joey', gender: 'male', engines: ['neural'] },
    { voiceId: 'Justin', displayName: 'Justin', gender: 'male_child', engines: ['neural'] },
    { voiceId: 'Kevin', displayName: 'Kevin', gender: 'male_child', engines: ['neural'] },
    { voiceId: 'Matthew', displayName: 'Matthew', gender: 'male', engines: ['neural', 'generative'] },
    { voiceId: 'Ruth', displayName: 'Ruth', gender: 'female', engines: ['neural', 'generative'] },
    { voiceId: 'Stephen', displayName: 'Stephen', gender: 'male', engines: ['neural', 'generative'] },
  ],
};

/**
 * generative対応モデルのセット（バックエンドのエンジン自動選択用）
 * 重要: バックエンドの cdk/lambda/textToSpeech/app.ts の GENERATIVE_VOICE_IDS と同期が必要
 */
export const GENERATIVE_VOICE_IDS = new Set(
  Object.values(POLLY_VOICES)
    .flat()
    .filter((v) => v.engines.includes('generative'))
    .map((v) => v.voiceId)
);

/**
 * 指定言語の音声モデル一覧を取得
 */
export const getVoicesForLanguage = (languageCode: string): PollyVoiceModel[] => {
  const lang = languageCode.split('-')[0];
  return POLLY_VOICES[lang] || [];
};

/**
 * voiceIdからエンジンを自動選択（generative優先）
 */
export const getPreferredEngine = (voiceId: string): 'generative' | 'neural' => {
  return GENERATIVE_VOICE_IDS.has(voiceId) ? 'generative' : 'neural';
};
