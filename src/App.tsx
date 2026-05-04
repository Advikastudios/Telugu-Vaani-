import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Volume2, 
  Languages, 
  Info,
  RefreshCcw,
  Copy,
  CheckCircle2,
  Sparkles,
  Zap,
  Mic2,
  Share2,
  History,
  Trash2,
  Download,
  Pause,
  ArrowRight,
  TrendingUp,
  Cpu,
  Layers,
  Hexagon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateGeminiSpeech } from './services/geminiService';

const SAMPLE_TEXT = "నమస్కారం! తెలుగు వాణికి స్వాగతం. ఇది ఒక అధునాతన టెక్స్ట్-టు-స్పీచ్ అప్లికేషన్. మీకు ఇష్టమైన వాయిస్‌ని ఎంచుకోండి మరియు వినండి.";

const QUICK_PHRASES = [
  { label: "Greetings", text: "నమస్కారం, ఎలా ఉన్నారు?" },
  { label: "Welcome", text: "తెలుగు వాణికి స్వాగతం!" },
  { label: "Appreciate", text: "చాలా ధన్యవాదాలు, ఇది చాలా బాగుంది." },
  { label: "Inquiry", text: "దీని గురించి నాకు మరింత సమాచారం ఇవ్వగలరా?" }
];

export default function App() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [engine, setEngine] = useState<'browser' | 'gemini'>('gemini');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [geminiVoice, setGeminiVoice] = useState<string>('Kore');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [lastBase64Audio, setLastBase64Audio] = useState<string | null>(null);
  
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const teluguVoices = availableVoices.filter(v => v.lang.includes('te-'));
      setVoices(teluguVoices);
      
      if (teluguVoices.length > 0 && !selectedVoice) {
        const googleVoice = teluguVoices.find(v => v.name.includes('Google'));
        setSelectedVoice(googleVoice ? googleVoice.name : teluguVoices[0].name);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    const savedHistory = localStorage.getItem('telugu_vaani_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const addToHistory = (txt: string) => {
    if (!txt.trim()) return;
    const cleanTxt = txt.trim();
    if (history[0] === cleanTxt) return;
    const newHistory = [cleanTxt, ...history.filter(h => h !== cleanTxt).slice(0, 4)];
    setHistory(newHistory);
    localStorage.setItem('telugu_vaani_history', JSON.stringify(newHistory));
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('telugu_vaani_history');
  };

  const handlePlayBrowser = () => {
    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find(v => v.name === selectedVoice);
    
    if (voice) utterance.voice = voice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = 'te-IN';

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    addToHistory(text);
    setLastBase64Audio(null);
  };

  const handlePlayGemini = async () => {
    if (isPaused && audioContextRef.current) {
      await audioContextRef.current.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    try {
      setIsLoading(true);
      const base64Audio = await generateGeminiSpeech(text, geminiVoice);
      setLastBase64Audio(base64Audio);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const binaryData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryData.length; i++) {
        view[i] = binaryData.charCodeAt(i);
      }

      const pcm16 = new Int16Array(arrayBuffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e) {}
      }
      
      sourceNodeRef.current = source;
      source.start();
      setIsPlaying(true);
      setIsPaused(false);
      addToHistory(text);
    } catch (error) {
      console.error('Failed to play Gemini audio:', error);
      alert('AI voice generation failed. Check your API key or connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = () => {
    if (!text.trim()) return;

    if (engine === 'browser') {
      handlePlayBrowser();
    } else {
      handlePlayGemini();
    }
  };

  const handlePause = () => {
    if (engine === 'browser') {
      window.speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
    } else {
      if (audioContextRef.current && audioContextRef.current.state === 'running') {
        audioContextRef.current.suspend();
        setIsPaused(true);
        setIsPlaying(false);
      }
    }
  };

  const handleStop = () => {
    if (engine === 'browser') {
      window.speechSynthesis.cancel();
    } else {
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch(e) {}
        sourceNodeRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  const downloadAudio = () => {
    if (!lastBase64Audio) return;
    
    const binaryData = atob(lastBase64Audio);
    const pcmData = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      pcmData[i] = binaryData.charCodeAt(i);
    }
    
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, pcmData.length, true);
    
    const blob = new Blob([header, pcmData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telugu_voice_${Date.now()}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div id="root-container" className="min-h-screen bg-[#14141F] text-white selection:bg-primary/20">
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 blur-[120px] rounded-full pointer-events-none" />

      <header id="main-header" className="max-w-[1400px] mx-auto px-6 md:px-12 py-8 flex items-center justify-between border-b border-white/5 relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-4"
        >
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white shadow-[0_0_20px_rgba(81,66,252,0.4)] relative">
             <Hexagon size={24} fill="currentColor" className="text-white/20" />
            <Mic2 size={16} className="absolute text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">TELUGU<span className="text-primary italic">VAANI</span></h1>
            <div className="flex items-center gap-1.5 opacity-50">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] uppercase font-black tracking-widest">TTS Engine Beta</span>
            </div>
          </div>
        </motion.div>
        
        <nav className="hidden xl:flex items-center gap-8 text-sm font-bold uppercase tracking-widest text-white/60">
          <a href="#" className="hover:text-primary transition-colors text-white">Home</a>
          <a href="#" className="hover:text-primary transition-colors">Explore</a>
          <a href="#" className="hover:text-primary transition-colors">Resources</a>
          <a href="#" className="hover:text-primary transition-colors">Guide</a>
        </nav>

        <div className="flex items-center gap-4">
          <button className="hidden sm:flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full border border-white/10 text-xs font-bold uppercase tracking-wider transition-all">
            <Info size={14} />
            Info
          </button>
          <button className="flex items-center gap-2 px-6 py-3 btn-gradient rounded-full text-xs font-black uppercase tracking-wider shadow-lg">
            Connect
          </button>
        </div>
      </header>

      <main id="app-main" className="max-w-[1400px] mx-auto px-6 md:px-12 py-12 md:py-20 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14">
          
          <div className="lg:col-span-8 flex flex-col gap-8">
            <div className="space-y-4">
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
                Synthesize <span className="text-gradient">Natural</span> <br /> 
                Telugu Voiceovers
              </h2>
              <p className="text-white/50 text-sm md:text-base max-w-xl font-medium">
                The world's most advanced Telugu Text-to-Speech platform. 
                Powered by Gemini Neural Engine for human-like articulation.
              </p>
            </div>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-[2rem] overflow-hidden flex flex-col min-h-[500px]"
            >
              <div className="px-6 md:px-8 py-5 border-b border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Layers size={16} className="text-primary" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">Script Workspace</span>
                </div>
                <div className="flex items-center gap-1.5 bg-black/20 p-1 rounded-xl w-full sm:w-auto">
                  <button onClick={() => setEngine('browser')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${engine === 'browser' ? 'bg-primary text-white shadow-lg' : 'text-white/40'}`}>Native</button>
                  <button onClick={() => setEngine('gemini')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${engine === 'gemini' ? 'bg-primary text-white shadow-lg' : 'text-white/40'}`}>Gemini</button>
                </div>
              </div>

              <textarea
                id="script-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="ఇక్కడ తెలుగు టెక్స్ట్ రాయండి..."
                className="flex-1 p-6 md:p-12 text-xl md:text-2xl font-medium leading-[1.8] outline-none resize-none bg-transparent placeholder:text-white/10 custom-scrollbar"
              />

              <div className="px-6 md:px-8 py-4 border-t border-white/5 flex flex-wrap gap-2 items-center">
                <div className="flex items-center gap-2 mr-4 opacity-40">
                  <TrendingUp size={14} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Shortcuts</span>
                </div>
                {QUICK_PHRASES.map((phrase) => (
                  <button
                    key={phrase.label}
                    onClick={() => setText(phrase.text)}
                    className="px-4 py-2 text-[10px] font-black uppercase tracking-wider bg-white/5 rounded-full hover:bg-primary/20 hover:text-primary border border-white/5 transition-all active:scale-95"
                  >
                    {phrase.label}
                  </button>
                ))}
              </div>

              <div className="p-6 md:p-8 border-t border-white/5 bg-white/[0.01] flex flex-col md:flex-row items-center gap-6">
                <div className="flex items-center gap-3 w-full md:w-auto">
                  {!isPlaying && !isPaused ? (
                    <button
                      onClick={handlePlay}
                      disabled={!text.trim() || isLoading}
                      className="flex-1 md:w-60 h-16 btn-gradient rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 disabled:opacity-30 active:scale-95 shadow-lg relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {isLoading ? <RefreshCcw size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                      {isLoading ? 'Synthesizing...' : 'Generate Voice'}
                    </button>
                  ) : (
                    <div className="flex flex-1 gap-3 w-full sm:w-auto">
                       <button
                        onClick={isPaused ? handlePlay : handlePause}
                        className="flex-1 sm:w-48 h-16 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all"
                      >
                        {isPaused ? (
                          <>
                            <Play size={18} fill="currentColor" className="text-primary" />
                            <span className="text-primary">Resume</span>
                          </>
                        ) : (
                          <>
                            <Pause size={18} fill="currentColor" className="text-secondary" />
                            <span className="text-secondary">Pause</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleStop}
                        className="w-16 h-16 bg-[#FF4B4B]/10 hover:bg-[#FF4B4B]/20 border border-[#FF4B4B]/20 text-[#FF4B4B] rounded-2xl flex items-center justify-center transition-all active:scale-95"
                        title="Cancel Playback"
                      >
                        <Square size={18} fill="currentColor" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto md:ml-auto">
                   <button 
                    onClick={downloadAudio}
                    disabled={!lastBase64Audio}
                    className="flex-1 md:w-auto px-10 h-16 glass-card rounded-2xl flex items-center justify-center gap-3 text-[11px] font-black uppercase tracking-[0.2em] hover:text-primary transition-all disabled:opacity-10 active:scale-95 border border-white/5"
                  >
                    <Download size={18} />
                    Export
                  </button>
                  <div className="flex gap-2">
                    <button 
                      onClick={copyToClipboard}
                      className="w-16 h-16 glass-card rounded-2xl flex items-center justify-center text-white/40 hover:text-white transition-all active:scale-95 border border-white/5"
                    >
                      {isCopied ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
                    </button>
                    <button 
                      onClick={() => setText('')}
                      className="w-16 h-16 glass-card rounded-2xl flex items-center justify-center text-white/40 hover:text-red-500 transition-all active:scale-95 border border-white/5"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-8">
            <section className="glass-card rounded-[2.5rem] p-8 space-y-10">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Configuration</h3>
                <Cpu size={18} className="text-primary" />
              </div>

              <div className="space-y-8">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20 block mb-4">Voice Model</label>
                  {engine === 'gemini' ? (
                    <div className="grid grid-cols-2 gap-2">
                       {['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr', 'Aoede'].map(v => (
                          <button
                            key={v}
                            onClick={() => setGeminiVoice(v)}
                            className={`py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all border ${geminiVoice === v ? 'bg-primary border-primary text-white' : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20'}`}
                          >
                            {v}
                          </button>
                        ))}
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-xs font-bold appearance-none outline-none focus:border-primary transition-all cursor-pointer"
                      >
                         {voices.length > 0 ? (
                            voices.map((voice) => (
                              <option key={voice.name} value={voice.name} className="bg-[#14141F]">
                                {voice.name.replace('Google ', '').split(' - ')[0]}
                              </option>
                            ))
                          ) : (
                            <option value="">System Default</option>
                          )}
                      </select>
                      <ArrowRight size={14} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none rotate-90" />
                    </div>
                  )}
                </div>

                <div className="space-y-8 pt-4">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Playback Speed</span>
                      <span className="text-sm font-bold text-primary">{rate.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={rate}
                      onChange={(e) => setRate(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">Harmonic Pitch</span>
                      <span className="text-sm font-bold text-secondary">{pitch.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={pitch}
                      onChange={(e) => setPitch(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-secondary"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5 flex items-center gap-4">
                 <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Sparkles size={18} />
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest">Pro Tip</p>
                    <p className="text-[10px] text-white/30 font-medium">Use 'Kore' or 'Charon' for business scripts.</p>
                 </div>
              </div>
            </section>

            {history.length > 0 && (
              <section className="glass-card rounded-[2.5rem] p-8 overflow-hidden relative">
                 <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Recent Active</h3>
                    <History size={18} className="text-white/20" />
                 </div>
                 <div className="space-y-3 relative z-10">
                   {history.map((h, i) => (
                      <button 
                        key={i} 
                        onClick={() => setText(h)}
                        className="w-full text-left p-4 bg-white/5 rounded-2xl hover:bg-white/10 border border-white/5 transition-all text-[10px] font-medium leading-relaxed truncate opacity-60 hover:opacity-100"
                      >
                        {h}
                      </button>
                   ))}
                   <button 
                    onClick={clearHistory}
                    className="w-full py-2 text-[8px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-red-500 transition-colors"
                  >
                    Wipe session data
                  </button>
                 </div>
              </section>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 border-t border-white/5 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="space-y-4 text-center md:text-left">
            <h4 className="text-xl font-black italic tracking-tighter">TELUGU VAANI</h4>
            <p className="text-xs text-white/30 font-medium max-w-sm leading-relaxed">
              The premier destination for high-quality Indian regional synthetic voiceovers. 
              Built for creators, by designers.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
            <a href="#" className="hover:text-primary transition-colors">Documentation</a>
            <a href="#" className="hover:text-primary transition-colors">API Reference</a>
            <a href="#" className="hover:text-primary transition-colors">Safety Guidelines</a>
            <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
           <p className="text-[8px] font-bold text-white/20 uppercase tracking-[0.4em]">
             © {new Date().getFullYear()} VAANI LABS • ALL RIGHTS RESERVED
           </p>
           <div className="flex gap-4">
             <div className="w-8 h-8 rounded-full border border-white/5 flex items-center justify-center text-white/20 hover:text-white transition-colors cursor-pointer">
               <Share2 size={12} />
             </div>
           </div>
        </div>
      </footer>
    </div>
  );
}
