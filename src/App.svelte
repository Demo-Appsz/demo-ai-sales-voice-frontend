<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    Headphones,
    Sparkles,
    Zap,
    Shield,
    Phone,
    PhoneOff,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    Loader2,
    Clock,
    Send,
    MessageSquare,
    CheckCircle2,
    AlertCircle,
    Radio
  } from '@lucide/svelte';

  // State runes in Svelte 5
  let callStatus = $state('waiting'); // 'waiting' | 'initializing' | 'connected' | 'disconnected'
  let sessionId = $state(null);
  let isMuted = $state(false);
  let isAudioMuted = $state(false);
  let isListening = $state(false);
  let isSpeaking = $state(false);
  let errorMessage = $state(null);
  let toastMessage = $state(null);

  // Call duration timer
  let callSeconds = $state(0);
  let timerInterval = null;

  // Transcripts
  let transcripts = $state([]);
  let inputMessage = $state('');
  let isProcessingMessage = $state(false);

  // ElevenLabs Audio Player
  let currentAudio = null;

  // Speech Recognition reference
  let recognition = null;
  let synth = null;

  onMount(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synth = window.speechSynthesis;
    }

    // Initialize Web Speech API Recognition
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'id-ID';

      recognition.onresult = (event) => {
        const spokenText = event.results[0][0].transcript;
        if (spokenText.trim()) {
          sendMessage(spokenText);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        isListening = false;
      };

      recognition.onend = () => {
        isListening = false;
      };
    }
  });

  onDestroy(() => {
    stopTimer();
    stopAudio();
    if (recognition) {
      recognition.stop();
    }
  });

  function stopAudio() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if (synth) {
      synth.cancel();
    }
    isSpeaking = false;
  }

  function startTimer() {
    callSeconds = 0;
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      callSeconds += 1;
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function formatDuration(sec) {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  }

  function showToast(msg) {
    toastMessage = msg;
    setTimeout(() => {
      toastMessage = null;
    }, 3500);
  }

  // Play natural AI Voice with ElevenLabs Neural Audio
  async function speakWithElevenLabs(text) {
    if (isAudioMuted || !text || !text.trim()) return;

    stopAudio();
    isSpeaking = true;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voiceId: 'EXAVITQu4vr4xnSDxMaL' // Sarah (Warm, Natural, Professional)
        })
      });

      if (!response.ok) {
        throw new Error('ElevenLabs TTS API request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      currentAudio = new Audio(audioUrl);
      currentAudio.onended = () => {
        isSpeaking = false;
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;

        // Auto listen after AI finishes speaking in phone call
        if (callStatus === 'connected' && !isMuted && recognition && !isListening) {
          try {
            recognition.start();
            isListening = true;
          } catch (e) {
            // Ignore if already running
          }
        }
      };

      currentAudio.onerror = (e) => {
        console.warn('Audio playback error', e);
        isSpeaking = false;
        fallbackSpeechSynthesis(text);
      };

      await currentAudio.play();
    } catch (err) {
      console.warn('Falling back to local SpeechSynthesis:', err);
      fallbackSpeechSynthesis(text);
    }
  }

  // Fallback to local browser TTS if network is disconnected
  function fallbackSpeechSynthesis(text) {
    if (!synth || isAudioMuted) return;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.05;

    const voices = synth.getVoices();
    const idVoice = voices.find(
      (v) => v.lang.startsWith('id') || v.lang.includes('ID')
    );
    if (idVoice) utterance.voice = idVoice;

    utterance.onstart = () => { isSpeaking = true; };
    utterance.onend = () => {
      isSpeaking = false;
      if (callStatus === 'connected' && !isMuted && recognition && !isListening) {
        try {
          recognition.start();
          isListening = true;
        } catch (e) {}
      }
    };
    utterance.onerror = () => { isSpeaking = false; };

    synth.speak(utterance);
  }

  async function startCall() {
    errorMessage = null;
    callStatus = 'initializing';

    try {
      const response = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Gagal terhubung ke server.');
      }

      const data = await response.json();
      sessionId = data.callDetails.callId;
      callStatus = 'connected';
      startTimer();
      showToast('Panggilan suara AI terhubung');

      // Initial greeting
      const greeting =
        'Halo! Saya asisten virtual layanan pelanggan AI. Ada yang bisa saya bantu hari ini?';
      transcripts = [
        {
          speaker: 'agent',
          text: greeting,
          timestamp: new Date().toISOString()
        }
      ];

      // Speak greeting with ElevenLabs
      speakWithElevenLabs(greeting);
    } catch (err) {
      console.error(err);
      callStatus = 'disconnected';
      errorMessage = 'Koneksi gagal. Pastikan backend server aktif.';
      showToast('Koneksi panggilan gagal');
    }
  }

  async function endCall() {
    stopAudio();
    if (recognition) {
      recognition.stop();
    }
    isListening = false;
    isSpeaking = false;
    stopTimer();

    const currentId = sessionId;
    callStatus = 'disconnected';
    showToast('Panggilan telepon telah diakhiri');

    if (currentId) {
      try {
        await fetch(`/api/call/${currentId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.warn(e);
      }
    }
  }

  async function sendMessage(textToSend) {
    const text = textToSend || inputMessage;
    if (!text || !text.trim() || !sessionId || isProcessingMessage) return;

    const userText = text.trim();
    inputMessage = '';
    isProcessingMessage = true;

    // Add user message to transcripts immediately
    transcripts = [
      ...transcripts,
      {
        speaker: 'user',
        text: userText,
        timestamp: new Date().toISOString()
      }
    ];

    try {
      const response = await fetch(`/api/call/${sessionId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText })
      });

      if (!response.ok) {
        throw new Error('Gagal mendapatkan respon AI.');
      }

      const data = await response.json();
      const reply = data.reply;

      transcripts = [
        ...transcripts,
        {
          speaker: 'agent',
          text: reply,
          timestamp: new Date().toISOString()
        }
      ];

      // Speak with ElevenLabs Neural Indonesian Voice
      speakWithElevenLabs(reply);
    } catch (e) {
      console.error(e);
      const fallbackReply =
        'Maaf, sedang ada kendala jaringan. Asisten kami tetap siap membantu Anda kembali.';
      transcripts = [
        ...transcripts,
        {
          speaker: 'agent',
          text: fallbackReply,
          timestamp: new Date().toISOString()
        }
      ];
      speakWithElevenLabs(fallbackReply);
    } finally {
      isProcessingMessage = false;
    }
  }

  function toggleSpeechRecognition() {
    if (!recognition) {
      alert(
        'Browser Anda belum mendukung input suara Web Speech API. Silakan gunakan microphone headset atau ketik pesan.'
      );
      return;
    }

    if (isListening) {
      recognition.stop();
      isListening = false;
    } else {
      try {
        recognition.start();
        isListening = true;
      } catch (err) {
        console.warn('Recognition start error:', err);
      }
    }
  }

  function toggleAudioOutput() {
    isAudioMuted = !isAudioMuted;
    if (isAudioMuted) {
      stopAudio();
    }
  }
</script>

<main class="min-h-screen bg-gradient-to-br from-[#f4fbfb] via-[#e8f6f8] to-[#e4f3f5] relative overflow-hidden py-10 px-4 sm:px-6 lg:px-8">
  <!-- Glowing ambient light orbs -->
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-emerald-300/25 rounded-full blur-3xl pointer-events-none"></div>
  <div class="absolute top-1/3 -right-40 w-96 h-96 bg-teal-300/20 rounded-full blur-3xl pointer-events-none"></div>
  <div class="absolute -bottom-40 left-1/3 w-96 h-96 bg-cyan-200/25 rounded-full blur-3xl pointer-events-none"></div>

  <!-- Toast Notification -->
  {#if toastMessage}
    <div class="fixed top-6 right-6 z-50 glass-strong shadow-2xl px-5 py-3 rounded-2xl border border-white/80 flex items-center gap-3 transition-all animate-bounce">
      <CheckCircle2 class="w-5 h-5 text-emerald-600" />
      <span class="text-sm font-medium text-slate-800">{toastMessage}</span>
    </div>
  {/if}

  <div class="max-w-4xl mx-auto relative z-10">
    <!-- HERO HEADER CARD -->
    <header class="glass-strong border border-white/70 shadow-2xl rounded-3xl p-6 sm:p-8 mb-8 backdrop-blur-2xl">
      <div class="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
        <!-- Avatar / Icon with Sparkle Badge -->
        <div class="relative shrink-0">
          <div class="w-20 h-20 glass rounded-3xl flex items-center justify-center shadow-xl border border-white/80">
            <Headphones class="w-10 h-10 text-[#264755]" />
          </div>
          <div class="absolute -top-1 -right-1 w-7 h-7 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full flex items-center justify-center shadow-md animate-pulse">
            <Sparkles class="w-4 h-4 text-white" />
          </div>
        </div>

        <div class="flex-1">
          <!-- Title & Live Badges -->
          <div class="flex flex-wrap items-center justify-center sm:justify-between gap-3 mb-2">
            <h1 class="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-[#264755] to-emerald-600 bg-clip-text text-transparent">
              Asisten Layanan Pelanggan
            </h1>
            <div class="glass px-3.5 py-1 rounded-full flex items-center gap-2 border border-emerald-500/30 shadow-sm">
              <Zap class="w-3.5 h-3.5 text-emerald-600 fill-emerald-500" />
              <span class="text-xs font-bold text-emerald-700 tracking-wider">LIVE VOICE</span>
            </div>
          </div>

          <!-- Subtitle with Animated Green Dots -->
          <div class="flex items-center justify-center sm:justify-start gap-2 mb-3">
            <div class="flex items-center gap-1">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            </div>
            <span class="text-sm font-semibold text-slate-600">ElevenLabs AI Voice • Siap 24/7</span>
          </div>

          <p class="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mb-5">
            Dapatkan bantuan instan melalui percakapan suara telepon langsung dengan asisten AI. Menggunakan teknologi suara natural ElevenLabs untuk percakapan manusiawi yang lancar.
          </p>

          <!-- 3 Value Pills -->
          <div class="grid grid-cols-3 gap-2 sm:gap-4 max-w-md mx-auto sm:mx-0">
            <div class="glass py-2 px-3 rounded-2xl flex items-center gap-2 border border-white/60 shadow-sm">
              <span class="font-bold text-[#264755] text-xs sm:text-sm px-1.5 py-0.5 rounded-lg bg-teal-100/70">AI</span>
              <span class="text-xs font-medium text-slate-700 truncate">ElevenLabs Voice</span>
            </div>
            <div class="glass py-2 px-3 rounded-2xl flex items-center gap-2 border border-white/60 shadow-sm">
              <span class="font-bold text-emerald-600 text-xs sm:text-sm px-1.5 py-0.5 rounded-lg bg-emerald-100/70">24</span>
              <span class="text-xs font-medium text-slate-700 truncate">Jam Layanan</span>
            </div>
            <div class="glass py-2 px-3 rounded-2xl flex items-center gap-2 border border-white/60 shadow-sm">
              <span class="font-bold text-cyan-600 text-xs sm:text-sm px-1.5 py-0.5 rounded-lg bg-cyan-100/70">∞</span>
              <span class="text-xs font-medium text-slate-700 truncate">Telepon Langsung</span>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- MAIN INTERACTIVE CALL CARD -->
    <section class="glass border border-white/80 shadow-2xl rounded-3xl p-6 sm:p-8 mb-8 backdrop-blur-xl">
      <!-- Metadata Top Bar -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-6 mb-6 border-b border-slate-200/60">
        <!-- Status Panggilan -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Radio class="w-3.5 h-3.5 text-teal-600" />
            <span>Status Sambungan Telepon</span>
          </div>
          <div>
            {#if callStatus === 'waiting'}
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-200/80 text-slate-700 font-semibold text-sm">
                <span class="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
                <span>Standby (Siap Memulai)</span>
              </div>
            {:else if callStatus === 'initializing'}
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-100 text-amber-800 font-semibold text-sm">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <span>Menghubungi Saluran Suara...</span>
              </div>
            {:else if callStatus === 'connected'}
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-100 text-emerald-800 font-semibold text-sm">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Telepon Terhubung ({formatDuration(callSeconds)})</span>
              </div>
            {:else if callStatus === 'disconnected'}
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-rose-100 text-rose-800 font-semibold text-sm">
                <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span>Telepon Berakhir</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- ID Sesi -->
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Shield class="w-3.5 h-3.5 text-teal-600" />
            <span>ID Sesi Panggilan</span>
          </div>
          <div class="glass-strong font-mono px-4 py-2 rounded-2xl text-sm font-semibold text-slate-700 border border-white/60">
            {sessionId || 'Belum tersambung'}
          </div>
        </div>
      </div>

      <!-- INTERACTIVE CALL ACTION AREA -->
      {#if callStatus === 'waiting' || callStatus === 'disconnected'}
        <!-- IDLE / DISCONNECTED STATE -->
        <div class="flex flex-col items-center justify-center py-10 text-center">
          <div class="relative group mb-6">
            <!-- Pulsing ambient glow -->
            <div class="absolute -inset-2 bg-gradient-to-r from-[#264755]/30 to-emerald-500/30 rounded-3xl blur-xl opacity-70 group-hover:opacity-100 transition duration-500 animate-pulse-glow"></div>

            <button
              onclick={startCall}
              class="relative bg-gradient-to-r from-[#264755] to-[#1a343e] hover:from-[#1d3a46] hover:to-[#142931] text-white font-bold py-7 px-12 sm:px-16 rounded-3xl shadow-2xl flex items-center gap-4 text-xl tracking-wide transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer border border-teal-600/30"
            >
              <Phone class="w-7 h-7 text-emerald-400 animate-bounce" />
              <span>Mulai Telepon AI</span>
            </button>
          </div>

          <p class="text-sm text-slate-500 max-w-md leading-relaxed">
            Klik tombol di atas untuk memulai percakapan suara telepon langsung dengan asisten AI berteknologi ElevenLabs
          </p>

          {#if errorMessage}
            <div class="mt-4 flex items-center gap-2 text-rose-600 text-sm bg-rose-50 px-4 py-2 rounded-xl border border-rose-200">
              <AlertCircle class="w-4 h-4" />
              <span>{errorMessage}</span>
            </div>
          {/if}
        </div>
      {:else if callStatus === 'initializing'}
        <!-- INITIALIZING STATE -->
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <div class="w-16 h-16 rounded-3xl glass flex items-center justify-center mb-4 shadow-lg">
            <Loader2 class="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
          <h3 class="text-xl font-bold text-slate-800 mb-1">Menghubungkan Saluran Telepon...</h3>
          <p class="text-sm text-slate-500">Mempersiapkan audio streaming ElevenLabs</p>
        </div>
      {:else if callStatus === 'connected'}
        <!-- CONNECTED ACTIVE TELEPHONE CALL STATE -->
        <div class="space-y-6">
          <!-- Active Call Wave Banner -->
          <div class="glass-strong rounded-3xl p-6 border border-white/70 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-4">
              <!-- Mic Status Animation -->
              <div class="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <Mic class="w-7 h-7 text-emerald-600 {isSpeaking || isListening ? 'animate-pulse' : ''}" />
                {#if isSpeaking || isListening}
                  <span class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span>
                {/if}
              </div>

              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-slate-800 text-base">Saluran Telepon Aktif</h4>
                  <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {formatDuration(callSeconds)}
                  </span>
                </div>
                <p class="text-xs font-medium text-slate-500">
                  {#if isSpeaking}
                    <span class="text-emerald-700 font-semibold animate-pulse">🔊 ElevenLabs AI sedang berbicara...</span>
                  {:else if isListening}
                    <span class="text-teal-700 font-semibold">🎙️ Sedang mendengarkan ucapan Anda...</span>
                  {:else}
                    <span>Bicara langsung di mic atau ketik di bawah</span>
                  {/if}
                </p>
              </div>
            </div>

            <!-- Dynamic Animated Soundwave Visualizer -->
            <div class="flex items-center gap-1.5 h-10 px-4 py-2 glass rounded-2xl border border-white/60">
              <span class="w-1.5 bg-emerald-500 rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.1s;"></span>
              <span class="w-1.5 bg-teal-500 rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.3s;"></span>
              <span class="w-1.5 bg-emerald-400 rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.2s;"></span>
              <span class="w-1.5 bg-[#264755] rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.4s;"></span>
              <span class="w-1.5 bg-emerald-600 rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.15s;"></span>
              <span class="w-1.5 bg-teal-600 rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.35s;"></span>
              <span class="w-1.5 bg-emerald-500 rounded-full {isSpeaking ? 'wave-bar' : 'h-2'}" style="animation-delay: 0.25s;"></span>
            </div>

            <!-- Controls: Mute, Audio & End Call -->
            <div class="flex items-center gap-3">
              <!-- Audio Output Mute -->
              <button
                onclick={toggleAudioOutput}
                class="p-3.5 glass-strong hover:bg-white rounded-2xl border border-slate-200/80 text-slate-700 transition cursor-pointer shadow-sm"
                title={isAudioMuted ? 'Nyalakan Suara AI' : 'Bisukan Suara AI'}
              >
                {#if isAudioMuted}
                  <VolumeX class="w-5 h-5 text-rose-500" />
                {:else}
                  <Volume2 class="w-5 h-5 text-[#264755]" />
                {/if}
              </button>

              <!-- Mic Recognition Toggle Button -->
              <button
                onclick={toggleSpeechRecognition}
                class="px-4 py-3 glass-strong hover:bg-white rounded-2xl border border-slate-200/80 font-semibold text-sm flex items-center gap-2 transition cursor-pointer shadow-sm {isListening ? 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-300' : 'text-slate-700'}"
              >
                <Mic class="w-4 h-4 {isListening ? 'text-emerald-600 animate-pulse' : 'text-slate-600'}" />
                <span>{isListening ? 'Mendengarkan...' : 'Bicara Mic'}</span>
              </button>

              <!-- End Call Button -->
              <button
                onclick={endCall}
                class="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-bold px-6 py-3.5 rounded-2xl shadow-lg flex items-center gap-2.5 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <PhoneOff class="w-5 h-5" />
                <span>Tutup Telepon</span>
              </button>
            </div>
          </div>

          <!-- Live Phone Call Transcripts Feed -->
          <div class="glass-strong rounded-3xl p-5 border border-white/80 shadow-md">
            <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
              <div class="flex items-center gap-2 text-sm font-bold text-slate-700">
                <MessageSquare class="w-4 h-4 text-teal-600" />
                <span>Transkrip Percakapan Telepon</span>
              </div>
              <span class="text-xs text-slate-400">{transcripts.length} pesan</span>
            </div>

            <!-- Messages list -->
            <div class="space-y-4 max-h-80 overflow-y-auto pr-2">
              {#each transcripts as msg}
                <div class="flex gap-3 {msg.speaker === 'user' ? 'justify-end' : 'justify-start'}">
                  {#if msg.speaker !== 'user'}
                    <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow text-xs font-bold">
                      AI
                    </div>
                  {/if}

                  <div class="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm {msg.speaker === 'user' ? 'bg-[#264755] text-white rounded-tr-none' : 'glass border border-white/80 text-slate-800 rounded-tl-none'}">
                    <p>{msg.text}</p>
                    <span class="block text-[10px] mt-1 opacity-60 text-right">
                      {new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>

                  {#if msg.speaker === 'user'}
                    <div class="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 shadow text-xs font-bold">
                      Anda
                    </div>
                  {/if}
                </div>
              {/each}

              {#if isProcessingMessage}
                <div class="flex gap-3 justify-start items-center">
                  <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow text-xs font-bold">
                    AI
                  </div>
                  <div class="glass border border-white/80 rounded-2xl px-4 py-2.5 text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 class="w-3.5 h-3.5 animate-spin text-emerald-600" />
                    <span>AI sedang memproses suara ElevenLabs...</span>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Direct speech / text input form -->
            <form
              onsubmit={(e) => { e.preventDefault(); sendMessage(); }}
              class="mt-4 pt-4 border-t border-slate-200/60 flex items-center gap-2"
            >
              <input
                type="text"
                bind:value={inputMessage}
                placeholder="Ketik ucapan Anda atau klik Bicara Mic..."
                class="flex-1 glass bg-white/70 px-4 py-2.5 rounded-2xl border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-800"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isProcessingMessage}
                class="bg-[#264755] hover:bg-[#1a343e] disabled:opacity-50 text-white p-2.5 rounded-2xl transition cursor-pointer shadow"
                title="Kirim Pesan"
              >
                <Send class="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      {/if}
    </section>

    <!-- 3 FEATURE CARDS -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
      <!-- Feature 1: Panggilan Suara -->
      <div class="glass-strong border border-white/70 rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
        <div class="w-14 h-14 glass rounded-2xl flex items-center justify-center mb-4 shadow-md border border-white/80">
          <Phone class="w-7 h-7 text-[#264755]" />
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Panggilan Suara Natural</h3>
        <p class="text-sm text-slate-600 leading-relaxed">
          Menggunakan ElevenLabs Multilingual Neural Voice yang menghasilkan intonasi suara ramah dan manusiawi.
        </p>
      </div>

      <!-- Feature 2: AI Cerdas -->
      <div class="glass-strong border border-white/70 rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
        <div class="w-14 h-14 glass rounded-2xl flex items-center justify-center mb-4 shadow-md border border-white/80">
          <Sparkles class="w-7 h-7 text-emerald-600" />
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">AI Cerdas & Tanggap</h3>
        <p class="text-sm text-slate-600 leading-relaxed">
          Pemahaman konteks yang mendalam untuk memberikan solusi yang tepat, akurat, dan personal untuk bisnis Anda.
        </p>
      </div>

      <!-- Feature 3: Respons Cepat -->
      <div class="glass-strong border border-white/70 rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
        <div class="w-14 h-14 glass rounded-2xl flex items-center justify-center mb-4 shadow-md border border-white/80">
          <Clock class="w-7 h-7 text-teal-600" />
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Respons Real-Time</h3>
        <p class="text-sm text-slate-600 leading-relaxed">
          Dapatkan jawaban instan seperti berbicara di telepon sungguhan tanpa jeda antrian antarmuka konvensional.
        </p>
      </div>
    </div>

    <!-- FOOTER -->
    <footer class="text-center text-xs text-slate-500 py-4 space-y-1 border-t border-slate-200/50">
      <p>© 2025 Hak Cipta Dilindungi.</p>
      <p class="font-medium text-slate-600">Asisten Layanan Pelanggan Virtual • ElevenLabs Voice Engine</p>
    </footer>
  </div>
</main>
