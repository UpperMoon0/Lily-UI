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
  input_device_id?: string;
  output_device_id?: string;
}

class PersistenceService {
  // Save settings to file
  async saveSettings(
    ttsParams: TTSParameters,
    ttsEnabled: boolean,
    inputDeviceId?: string,
    outputDeviceId?: string
  ): Promise<void> {
    try {
      const settings: AppSettings = {
        tts_params: ttsParams,
        tts_enabled: ttsEnabled,
        input_device_id: inputDeviceId,
        output_device_id: outputDeviceId
      };
      await invoke('save_settings', { settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  // Load settings from file
  async loadSettings(): Promise<{
    ttsParams: TTSParameters;
    ttsEnabled: boolean;
    inputDeviceId?: string;
    outputDeviceId?: string;
  } | null> {
    try {
      const settings = await invoke<AppSettings>('load_settings');
      return {
        ttsParams: settings.tts_params,
        ttsEnabled: settings.tts_enabled,
        inputDeviceId: settings.input_device_id,
        outputDeviceId: settings.output_device_id
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return null;
    }
  }

  // Save chat history to file via Rust
  async saveChatHistory(messages: any[]): Promise<void> {
    try {
      await invoke('save_chat_history', { messages });
    } catch (error) {
      console.error('Failed to save chat history:', error);
      throw error;
    }
  }

  // Load chat history from file via Rust
  async loadChatHistory(): Promise<any[]> {
    try {
      return await invoke('load_chat_history');
    } catch (error) {
      console.error('Failed to load chat history:', error);
      return [];
    }
  }

  // Clear chat history via Rust
  async clearChatHistory(): Promise<void> {
    try {
      await invoke('clear_chat_history');
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      throw error;
    }
  }
}

// Create a singleton instance
const persistenceService = new PersistenceService();
export default persistenceService;