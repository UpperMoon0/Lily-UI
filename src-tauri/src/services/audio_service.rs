use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::HeapRb;
use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use tauri::Emitter;

#[derive(Clone)]
pub struct AudioService {
    is_recording: Arc<Mutex<bool>>,
    audio_level_tx: broadcast::Sender<f32>,
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl AudioService {
    pub fn new() -> Self {
        let (audio_level_tx, _) = broadcast::channel(100);
        Self {
            is_recording: Arc::new(Mutex::new(false)),
            audio_level_tx,
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_app_handle(&self, app_handle: tauri::AppHandle) {
        *self.app_handle.lock().unwrap() = Some(app_handle);
    }

    pub fn subscribe_audio_levels(&self) -> broadcast::Receiver<f32> {
        self.audio_level_tx.subscribe()
    }

    pub async fn start_recording(&self) -> Result<(), String> {
        let host = cpal::default_host();
        let device = host.default_input_device()
            .ok_or("No default input device found")?;

        let config = device.default_input_config()
            .map_err(|e| format!("Failed to get default input config: {}", e))?;

        println!("Audio device: {}", device.name().unwrap_or("Unknown".to_string()));
        println!("Audio config: {:?}, sample rate: {}", config.sample_format(), config.sample_rate().0);

        let mut is_recording = self.is_recording.lock().unwrap();
        if *is_recording {
            return Err("Already recording".to_string());
        }
        *is_recording = true;
        drop(is_recording);

        // Create audio buffer for RMS calculation
        let ring_buf = HeapRb::<f32>::new(8192);
        let (producer, _consumer) = ring_buf.split();

        let audio_level_tx = self.audio_level_tx.clone();
        let is_recording_clone = self.is_recording.clone();
        let app_handle = self.app_handle.lock().unwrap().clone();

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => self.create_stream::<f32>(&device, config.into(), producer, audio_level_tx, is_recording_clone, app_handle)?,
            cpal::SampleFormat::I16 => self.create_stream::<i16>(&device, config.into(), producer, audio_level_tx, is_recording_clone, app_handle)?,
            cpal::SampleFormat::U16 => self.create_stream::<u16>(&device, config.into(), producer, audio_level_tx, is_recording_clone, app_handle)?,
            _ => return Err(format!("Unsupported sample format: {:?}", config.sample_format())),
        };

        stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

        // Store the stream in a way that doesn't require Send/Sync
        // We'll let it drop when the function ends, but the audio callback will keep it alive
        std::mem::forget(stream);

        println!("Audio recording started successfully");
        Ok(())
    }

    pub async fn stop_recording(&self) -> Result<(), String> {
        let mut is_recording = self.is_recording.lock().unwrap();
        if !*is_recording {
            return Ok(());
        }
        *is_recording = false;
        drop(is_recording);

        // The stream will be stopped when the callback checks is_recording and returns early
        println!("Audio recording stopped");
        Ok(())
    }

    pub fn is_recording(&self) -> bool {
        *self.is_recording.lock().unwrap()
    }

    fn create_stream<T>(
        &self,
        device: &cpal::Device,
        config: cpal::StreamConfig,
        mut producer: ringbuf::Producer<f32, Arc<ringbuf::SharedRb<f32, Vec<std::mem::MaybeUninit<f32>>>>>,
        audio_level_tx: broadcast::Sender<f32>,
        is_recording: Arc<Mutex<bool>>,
        app_handle: Option<tauri::AppHandle>,
    ) -> Result<cpal::Stream, String>
    where
        T: cpal::Sample + Into<f32> + cpal::SizedSample,
    {
        let stream = device.build_input_stream(
            &config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                // Check if we should still be recording
                if !*is_recording.lock().unwrap() {
                    return;
                }

                // Convert samples to f32 and push to ring buffer
                for &sample in data {
                    let sample_f32 = sample.into();
                    // Try to push, ignore if buffer is full (ring buffer will overwrite oldest)
                    let _ = producer.push(sample_f32);
                }

                // Calculate RMS every 100ms worth of samples
                let sample_rate = config.sample_rate.0 as usize;
                let samples_per_100ms = (sample_rate / 10) as usize;

                if data.len() >= samples_per_100ms {
                    let mut sum_squares = 0.0;
                    let mut count = 0;

                    // Use the most recent samples for RMS calculation
                    let start_idx = if data.len() > samples_per_100ms {
                        data.len() - samples_per_100ms
                    } else {
                        0
                    };

                    for i in start_idx..data.len() {
                        let sample_f32 = data[i].into();
                        sum_squares += sample_f32 * sample_f32;
                        count += 1;
                    }

                    if count > 0 {
                        let rms = (sum_squares / count as f32).sqrt();
                        let _ = audio_level_tx.send(rms);

                        // Emit event to frontend
                        if let Some(app_handle) = &app_handle {
                            let _ = app_handle.emit("audio-level", rms);
                        }
                    }
                }
            },
            move |err| {
                eprintln!("Audio stream error: {}", err);
            },
            None,
        ).map_err(|e| format!("Failed to build input stream: {}", e))?;

        Ok(stream)
    }

    pub fn get_available_devices(&self) -> Result<Vec<String>, String> {
        let host = cpal::default_host();
        let devices = host.input_devices()
            .map_err(|e| format!("Failed to get input devices: {}", e))?
            .filter_map(|device| device.name().ok())
            .collect::<Vec<_>>();

        Ok(devices)
    }
}

// Note: Tests are disabled due to Windows audio DLL loading issues in test environment
// The audio service functionality is verified through integration tests in the frontend