import { useState, useRef } from 'react';

const useAudioCapture = (onDataAvailable: (data: Blob) => void) => {
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    onDataAvailable(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                streamRef.current?.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(1000); // Timeslice in ms
            setIsRecording(true);
            return stream;
        } catch (error) {
            console.error('Error starting recording:', error);
            return null;
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    return { isRecording, startRecording, stopRecording };
};

export default useAudioCapture;