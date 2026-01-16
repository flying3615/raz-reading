import { useState } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';

interface AudioRecorderProps {
    onAnalysisStart: (audioBlob: Blob) => void;
    isAnalyzing: boolean;
}

export const AudioRecorder = ({ onAnalysisStart, isAnalyzing }: AudioRecorderProps) => {
    const { isRecording, recordingTime, audioBlob, startRecording, stopRecording } = useAudioRecorder();
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePlayPreview = () => {
        if (!audioBlob) return;
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        setIsPlayingPreview(true);
        audio.play();
        audio.onended = () => setIsPlayingPreview(false);
    };

    return (
        <div style={{
            background: 'var(--bg-secondary)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
            marginTop: '20px'
        }}>
            <div style={{
                color: 'white',
                fontSize: '0.9rem',
                fontWeight: 600,
                marginBottom: '4px'
            }}>
                🎙️ 跟读录音
            </div>

            {/* Timer Display */}
            <div style={{
                fontFamily: 'monospace',
                fontSize: '1.5rem',
                color: isRecording ? '#ef4444' : 'white',
                fontWeight: 700
            }}>
                {formatTime(recordingTime)}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {!isRecording && !audioBlob && (
                    <button
                        onClick={startRecording}
                        disabled={isAnalyzing}
                        style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '8px 24px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <span>●</span> 开始录音
                    </button>
                )}

                {isRecording && (
                    <button
                        onClick={stopRecording}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'white',
                            padding: '8px 24px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        ⏹ 停止
                    </button>
                )}

                {!isRecording && audioBlob && (
                    <>
                        <button
                            onClick={handlePlayPreview}
                            disabled={isPlayingPreview || isAnalyzing}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            {isPlayingPreview ? '🔊 播放中...' : '▶ 试听'}
                        </button>

                        <button
                            onClick={startRecording} // Re-record
                            disabled={isAnalyzing}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.2)',
                                color: 'rgba(255,255,255,0.7)',
                                padding: '8px 16px',
                                borderRadius: '20px',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            重录
                        </button>

                        <button
                            onClick={() => onAnalysisStart(audioBlob)}
                            disabled={isAnalyzing}
                            style={{
                                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                border: 'none',
                                color: 'white',
                                padding: '8px 24px',
                                borderRadius: '20px',
                                cursor: isAnalyzing ? 'wait' : 'pointer',
                                fontWeight: 600,
                                boxShadow: '0 2px 10px rgba(99, 102, 241, 0.4)'
                            }}
                        >
                            {isAnalyzing ? '分析中...' : '✨ AI 点评'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};
