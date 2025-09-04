// PersistenceService.ts
import { invoke } from '@tauri-apps/api/core';

interface TTSParameters {
  speaker: number;
  sample_rate: number;
  model: string;
  lang: string;
}

interface AppSettings {
  tts_params: TTSParameters;
  tts_enabled: boolean;
}

class PersistenceService {
  // Save settings to file
  async saveSettings(ttsParams: TTSParameters, ttsEnabled: boolean): Promise<void> {
    try {
      const settings: AppSettings = {
        tts_params: ttsParams,
        tts_enabled: ttsEnabled
      };
      await invoke('save_settings', { settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  // Load settings from file
  async loadSettings(): Promise<{ ttsParams: TTSParameters; ttsEnabled: boolean } | null> {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      return {
        ttsParams: settings.tts_params,
        ttsEnabled: settings.tts_enabled
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return null;
    }
  }

  // Save chat history to localStorage (runtime persistence)
  saveChatHistory(messages: any[]): void {
    try {
      localStorage.setItem('lily_chat_history', JSON.stringify(messages));
    } catch (error) {
      console.error('Failed to save chat history to localStorage:', error);
    }
  }

  // Load chat history from localStorage (runtime persistence)
  loadChatHistory(): any[] {
    try {
      const history = localStorage.getItem('lily_chat_history');
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Failed to load chat history from localStorage:', error);
      return [];
    }
  }

  // Clear chat history from localStorage
  clearChatHistory(): void {
    try {
      localStorage.removeItem('lily_chat_history');
    } catch (error) {
      console.error('Failed to clear chat history from localStorage:', error);
    }
  }
}

// Create a singleton instance
const persistenceService = new PersistenceService();
export default persistenceService;