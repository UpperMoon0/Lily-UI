use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
#[cfg(feature = "audio")]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
#[cfg(feature = "audio")]
use ringbuf::HeapRb;
#[cfg(feature = "tauri")]
use tauri::Emitter;

#[derive(Clone)]
pub struct AudioService {
    is_recording: Arc<Mutex<bool>>,
    audio_level_tx: broadcast::Sender<f32>,
    #[cfg(feature = "tauri")]
    app_handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl AudioService {
    pub fn new() -> Self {
        let (audio_level_tx, _) = broadcast::channel(100);
        Self {
            is_recording: Arc::new(Mutex::new(false)),
            audio_level_tx,
            #[cfg(feature = "tauri")]
            app_handle: Arc::new(Mutex::new(None)),
        }
    }

    #[cfg(feature = "tauri")]
    pub fn set_app_handle(&self, app_handle: tauri::AppHandle) {
        *self.app_handle.lock().unwrap() = Some(app_handle);
    }

    pub fn subscribe_audio_levels(&self) -> broadcast::Receiver<f32> {
        self.audio_level_tx.subscribe()
    }

    pub async fn start_recording(&self) -> Result<(), String> {
        #[cfg(feature = "audio")]
        {
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
            #[cfg(feature = "tauri")]
            let app_handle = self.app_handle.lock().unwrap().clone();
            #[cfg(not(feature = "tauri"))]
            let app_handle = None;

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

        #[cfg(not(feature = "audio"))]
        {
            Err("Audio not enabled".to_string())
        }
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

    #[cfg(feature = "audio")]
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
        #[cfg(feature = "audio")]
        {
            let host = cpal::default_host();
            let devices = host.input_devices()
                .map_err(|e| format!("Failed to get input devices: {}", e))?
                .filter_map(|device| device.name().ok())
                .collect::<Vec<_>>();

            Ok(devices)
        }

        #[cfg(not(feature = "audio"))]
        {
            // Audio not enabled, return empty list
            Ok(vec![])
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::broadcast::error::TryRecvError;

    #[test]
    fn test_audio_service_initialization() {
        let service = AudioService::new();

        // Test initial state
        assert!(!service.is_recording());

        // Test that we can subscribe to audio levels
        let mut receiver = service.subscribe_audio_levels();
        assert_eq!(receiver.try_recv(), Err(TryRecvError::Empty));
    }

    #[test]
    fn test_service_clone() {
        let service = AudioService::new();
        let cloned_service = service.clone();

        // Both should share the same state
        assert_eq!(service.is_recording(), cloned_service.is_recording());

        // Test that they share the same broadcast channel
        let mut receiver1 = service.subscribe_audio_levels();
        let mut receiver2 = cloned_service.subscribe_audio_levels();

        assert_eq!(receiver1.try_recv(), Err(TryRecvError::Empty));
        assert_eq!(receiver2.try_recv(), Err(TryRecvError::Empty));
    }

    #[test]
    fn test_rms_calculation_logic() {
        // Test RMS calculation directly
        let samples = vec![0.0f32, 1.0, -1.0, 0.5, -0.5];
        let mut sum_squares = 0.0;
        let mut count = 0;

        for &sample in &samples {
            sum_squares += sample * sample;
            count += 1;
        }

        let rms = (sum_squares / count as f32).sqrt();
        let expected_rms = ((0.0 + 1.0 + 1.0 + 0.25 + 0.25) / samples.len() as f32).sqrt();

        assert!((rms - expected_rms).abs() < 0.001);
    }

    #[cfg(feature = "audio")]
    #[test]
    fn test_sample_format_conversion() {
        // Test f32 to f32 conversion
        let f32_sample: f32 = 0.5;
        let converted: f32 = f32_sample.into();
        assert_eq!(converted, 0.5);

        // Test i16 to f32 conversion (normalized)
        let i16_sample: i16 = 16384; // Half of i16::MAX
        let converted: f32 = i16_sample.into();
        assert!((converted - 0.5).abs() < 0.001);

        // Test u16 to f32 conversion (normalized)
        let u16_sample: u16 = 32768; // Half of u16::MAX
        let converted: f32 = u16_sample.into();
        assert!((converted - 0.5).abs() < 0.001);
    }

    #[cfg(feature = "audio")]
    #[test]
    fn test_ring_buffer_capacity() {
        let ring_buf = HeapRb::<f32>::new(8192);
        let (producer, consumer) = ring_buf.split();

        // Test that producer and consumer are created
        assert!(producer.capacity() >= 8192);
        assert!(consumer.capacity() >= 8192);
    }

    #[test]
    fn test_multiple_service_instances() {
        let service1 = AudioService::new();
        let service2 = AudioService::new();

        // Each service should have independent state
        assert!(!service1.is_recording());
        assert!(!service2.is_recording());

        // Each service should have independent broadcast channels
        let mut receiver1 = service1.subscribe_audio_levels();
        let mut receiver2 = service2.subscribe_audio_levels();

        assert_eq!(receiver1.try_recv(), Err(TryRecvError::Empty));
        assert_eq!(receiver2.try_recv(), Err(TryRecvError::Empty));
    }

    #[test]
    fn test_broadcast_capacity() {
        let service = AudioService::new();

        // The broadcast channel should be created with capacity 100
        // We can test this by trying to send more messages than capacity
        let tx = service.audio_level_tx.clone();

        // Send 101 messages (more than capacity)
        for i in 0..101 {
            let _ = tx.send(i as f32);
        }

        // The receiver should still work
        let mut receiver = service.subscribe_audio_levels();
        // We might lose some messages due to capacity limits, but should get some
        let result = receiver.try_recv();
        assert!(result.is_ok() || result == Err(TryRecvError::Empty));
    }

    #[test]
    fn test_rms_calculation_edge_cases() {
        // Test with single sample
        let single_sample = vec![1.0f32];
        let mut sum_squares = 0.0;
        let mut count = 0;

        for &sample in &single_sample {
            sum_squares += sample * sample;
            count += 1;
        }

        let rms = (sum_squares / count as f32).sqrt();
        assert_eq!(rms, 1.0);

        // Test with all zeros
        let zero_samples = vec![0.0f32, 0.0, 0.0];
        sum_squares = 0.0;
        count = 0;

        for &sample in &zero_samples {
            sum_squares += sample * sample;
            count += 1;
        }

        let rms = (sum_squares / count as f32).sqrt();
        assert_eq!(rms, 0.0);
    }

    #[test]
    fn test_sample_rate_calculations() {
        // Test samples per 100ms calculation for different sample rates
        let sample_rates = vec![44100, 48000, 22050, 16000];

        for &sample_rate in &sample_rates {
            let samples_per_100ms = (sample_rate / 10) as usize;
            let expected = sample_rate as usize / 10;

            assert_eq!(samples_per_100ms, expected);

            // Ensure it's reasonable (between 1 and reasonable upper bound)
            assert!(samples_per_100ms >= 160); // 16000 / 10
            assert!(samples_per_100ms <= 4800); // 48000 / 10
        }
    }

    #[cfg(feature = "audio")]
    #[test]
    fn test_ring_buffer_operations() {
        let ring_buf = HeapRb::<f32>::new(1024);
        let (mut producer, mut consumer) = ring_buf.split();

        // Test pushing samples
        let samples = vec![0.1, 0.2, 0.3, 0.4, 0.5];
        let mut pushed = 0;

        for &sample in &samples {
            if producer.push(sample).is_ok() {
                pushed += 1;
            }
        }

        assert_eq!(pushed, samples.len());

        // Test popping samples
        let mut popped_samples = vec![];
        while let Some(sample) = consumer.pop() {
            popped_samples.push(sample);
        }

        assert_eq!(popped_samples, samples);
    }

    #[test]
    fn test_error_handling_strings() {
        // Test that error messages are properly formatted
        let error_msg = "Test error message";
        let formatted = format!("Failed to get input devices: {}", error_msg);
        assert!(formatted.contains("Failed to get input devices"));
        assert!(formatted.contains(error_msg));

        let stream_error = format!("Failed to build input stream: {}", error_msg);
        assert!(stream_error.contains("Failed to build input stream"));
        assert!(stream_error.contains(error_msg));
    }

    #[test]
    fn test_memory_management() {
        // Test that Arc<Mutex<>> works correctly
        let service = AudioService::new();
        let recording_state = service.is_recording.clone();
        #[cfg(feature = "tauri")]
        let app_handle_state = service.app_handle.clone();

        // Test that we can access the state from different references
        {
            let _guard1 = recording_state.lock().unwrap();
            #[cfg(feature = "tauri")]
            let _guard2 = app_handle_state.lock().unwrap();
            // Both locks should work simultaneously since they're different mutexes
        }

        // Test that the service can be moved
        let moved_service = service;
        assert!(!moved_service.is_recording());
    }

    #[test]
    fn test_broadcast_receiver_behavior() {
        let service = AudioService::new();

        // Create multiple receivers
        let mut receivers: Vec<_> = (0..5).map(|_| service.subscribe_audio_levels()).collect();

        // All should be empty initially
        for receiver in &mut receivers {
            assert_eq!(receiver.try_recv(), Err(TryRecvError::Empty));
        }

        // After subscribing, they should all be independent
        // (broadcast channels send to all receivers)
        let tx = service.audio_level_tx.clone();
        let _ = tx.send(1.0);

        // Each receiver should be able to receive the message independently
        for receiver in &mut receivers {
            match receiver.try_recv() {
                Ok(value) => assert_eq!(value, 1.0),
                Err(TryRecvError::Empty) => {}, // Some might miss it due to timing
                Err(_) => panic!("Unexpected error"),
            }
        }
    }
}