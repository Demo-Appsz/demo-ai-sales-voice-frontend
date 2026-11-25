<script>
  import { onMount, onDestroy } from 'svelte';
  import { Conversation } from '@elevenlabs/client';
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
    Radio,
    UserRound
  } from '@lucide/svelte';

  // Call states: 'waiting' | 'initializing' | 'connected' | 'disconnected'
  let callStatus = $state('waiting');
  let voiceGender = $state('female'); // 'female' (Jasmin) | 'male' (Mas Rouf)
  let activeAgentName = $derived(voiceGender === 'male' ? 'Mas Rouf' : 'Jasmin');
  let sessionId = $state(null);
  let isMicMuted = $state(false);
  let isAudioMuted = $state(false);
  let isListening = $state(false);
  let isSpeaking = $state(false);
  let isFallbackMode = $state(false);
  let fallbackNotice = $state(null);
  let errorMessage = $state(null);
  let toastMessage = $state(null);

  // Call duration timer
  let callSeconds = $state(0);
  let timerInterval = null;

  // Live audio visualizer bars (0.15 to 1.0)
  let waveBars = $state([0.2, 0.35, 0.25, 0.45, 0.3, 0.4, 0.2]);
  let visualizerInterval = null;

  // Transcripts
  let transcripts = $state([]);
  let transcriptContainer = $state(null);
  let inputMessage = $state('');
  let isProcessingFallback = $state(false);

  // Active real-time voice conversation instance & fallback browser speech
  let conversation = null;
  let recognition = null;
  let synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  let availableVoices = [];
  let currentSessionData = null;
  let callAttemptSeq = 0;

  // Auto-disconnect on user inactivity (default: 2 minutes)
  let idleTimeoutMinutes = $state(2);
  let idleTimeoutHandle = null;
  let isAutoClosingIdle = false;

  onMount(() => {
    if (synth) {
      availableVoices = synth.getVoices() || [];
      synth.onvoiceschanged = () => {
        availableVoices = synth.getVoices() || [];
      };
    }
  });

  onDestroy(() => {
    cleanupCallState();
  });

  function getIdleLimitMs() {
    if (typeof window !== 'undefined' && Number(window.__IDLE_TIMEOUT_MS) > 0) {
      return Number(window.__IDLE_TIMEOUT_MS);
    }
    return idleTimeoutMinutes > 0 ? idleTimeoutMinutes * 60_000 : 0;
  }

  function clearIdleTimerHandle() {
    if (idleTimeoutHandle) {
      clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = null;
    }
  }

  function stopIdleTimer() {
    clearIdleTimerHandle();
    isAutoClosingIdle = false;
  }

  function resetIdleTimer(attemptId = callAttemptSeq) {
    clearIdleTimerHandle();
    if (callStatus !== 'connected' || isAutoClosingIdle || attemptId !== callAttemptSeq) return;
    const limitMs = getIdleLimitMs();
    if (!limitMs || limitMs <= 0) return;

    idleTimeoutHandle = setTimeout(() => {
      triggerIdleEndCall(attemptId);
    }, limitMs);
  }

  async function triggerIdleEndCall(attemptId) {
    if (attemptId !== callAttemptSeq || callStatus !== 'connected' || isAutoClosingIdle) return;
    isAutoClosingIdle = true;
    clearIdleTimerHandle();

    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }

    if (conversation) {
      try {
        await conversation.endSession();
      } catch {}
      conversation = null;
    }

    if (attemptId !== callAttemptSeq || callStatus !== 'connected') {
      isAutoClosingIdle = false;
      return;
    }

    const durationLabel =
      idleTimeoutMinutes === 1
        ? '1 menit'
        : idleTimeoutMinutes > 0
          ? `${idleTimeoutMinutes} menit`
          : 'beberapa saat';

    const farewellMsg =
      voiceGender === 'male'
        ? `Halo? Karena belum ada respons selama ${durationLabel}, panggilan ini saya tutup dulu ya. Terima kasih, silakan hubungi kembali kapan saja.`
        : `Halo? Karena sudah ${durationLabel} belum ada respons, panggilannya aku tutup dulu ya. Makasih sudah menghubungi, sampai jumpa!`;

    transcripts = [
      ...transcripts,
      {
        eventId: Date.now(),
        speaker: 'agent',
        text: farewellMsg,
        timestamp: new Date().toISOString()
      }
    ];
    scrollTranscriptToBottom();

    speakFallbackBrowser(farewellMsg, {
      onDone: () => {
        if (attemptId === callAttemptSeq && callStatus === 'connected') {
          endCall(`Panggilan diakhiri otomatis (tidak ada respons ${durationLabel})`);
        }
      }
    });
  }

  function cleanupCallState() {
    callAttemptSeq += 1;
    stopIdleTimer();
    stopTimer();
    stopVisualizer();
    stopFallbackSpeech();
    if (conversation) {
      conversation.endSession().catch(() => {});
      conversation = null;
    }
    isListening = false;
    isSpeaking = false;
  }

  function stopFallbackSpeech() {
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
      recognition = null;
    }
    if (synth) {
      try {
        synth.cancel();
      } catch {}
    }
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

  function startVisualizer() {
    stopVisualizer();
    visualizerInterval = setInterval(() => {
      if (callStatus !== 'connected') return;

      let level = 0;
      if (isFallbackMode) {
        level = isSpeaking ? 0.65 : isListening && !isMicMuted ? 0.28 : 0.1;
      } else if (conversation) {
        try {
          level = isSpeaking
            ? conversation.getOutputVolume()
            : isMicMuted
              ? 0
              : conversation.getInputVolume();
        } catch {
          level = isSpeaking ? 0.6 : 0.15;
        }
      }

      const clamped = Math.min(1, Math.max(0.15, level * 2.2));
      waveBars = waveBars.map((_, i) => {
        const variance = 0.7 + Math.sin(Date.now() / 130 + i * 1.1) * 0.3;
        return Math.min(1, Math.max(0.18, clamped * variance));
      });
    }, 65);
  }

  function stopVisualizer() {
    if (visualizerInterval) {
      clearInterval(visualizerInterval);
      visualizerInterval = null;
    }
    waveBars = [0.2, 0.35, 0.25, 0.45, 0.3, 0.4, 0.2];
  }

  function scrollTranscriptToBottom() {
    requestAnimationFrame(() => {
      if (transcriptContainer) {
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
      }
    });
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

  function selectFallbackVoice(voices, gender) {
    const idVoices = voices.filter((v) => v.lang?.toLowerCase().startsWith('id'));
    if (idVoices.length === 0) return null;

    if (gender === 'male') {
      return (
        idVoices.find((v) => /ardi|male|pria|laki|andika|budi/i.test(v.name)) ||
        idVoices[idVoices.length - 1] ||
        idVoices[0]
      );
    }

    return (
      idVoices.find((v) => /gadis|damayanti|female|wanita|perempuan|google bahasa/i.test(v.name)) ||
      idVoices[0]
    );
  }

  function speakFallbackBrowser(text, options = {}) {
    const onDone = typeof options?.onDone === 'function' ? options.onDone : null;

    if (!synth || isAudioMuted || !text) {
      isSpeaking = false;
      if (onDone) {
        onDone();
      } else {
        startFallbackListening();
        resetIdleTimer();
      }
      return;
    }
    try {
      clearIdleTimerHandle();
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = voiceGender === 'male' ? 1.03 : 1.08;
      utterance.pitch = voiceGender === 'male' ? 0.85 : 1.12;

      const voices = availableVoices.length ? availableVoices : synth.getVoices();
      const chosenVoice = selectFallbackVoice(voices, voiceGender);
      if (chosenVoice) {
        try {
          utterance.voice = chosenVoice;
        } catch {}
      }

      let settled = false;
      const finishSpeaking = () => {
        if (settled) return;
        settled = true;
        isSpeaking = false;
        if (onDone) {
          onDone();
        } else {
          startFallbackListening();
          resetIdleTimer();
        }
      };

      utterance.onstart = () => {
        isSpeaking = true;
        isListening = false;
      };
      utterance.onend = finishSpeaking;
      utterance.onerror = finishSpeaking;

      isSpeaking = true;
      synth.speak(utterance);

      // Guard in case browser speech engine does not emit onend (e.g. headless/muted tab)
      const approxDurationMs = Math.min(18000, Math.max(2500, text.length * 75));
      setTimeout(() => {
        if (!settled && !synth.speaking) {
          finishSpeaking();
        }
      }, approxDurationMs);
    } catch {
      isSpeaking = false;
      if (onDone) onDone();
    }
  }

  function startFallbackListening() {
    if (!isFallbackMode || callStatus !== 'connected' || isMicMuted) return;
    const SpeechRecognition =
      typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      isListening = false;
      return;
    }

    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'id-ID';

      recognition.onresult = (event) => {
        const spokenText = event.results?.[0]?.[0]?.transcript?.trim();
        if (spokenText) {
          sendFallbackMessage(spokenText);
        }
      };

      recognition.onerror = () => {
        isListening = false;
      };

      recognition.onend = () => {
        isListening = false;
      };
    }

    try {
      recognition.start();
      isListening = true;
    } catch {}
  }

  function activateFallbackMode(data, reasonText) {
    isFallbackMode = true;
    fallbackNotice =
      reasonText ||
      (data?.quota
        ? `Mode cadangan aktif (kuota suara utama habis: ${data.quota.used.toLocaleString('id-ID')}/${data.quota.limit.toLocaleString('id-ID')}).`
        : 'Mode cadangan aktif karena layanan suara utama sedang tidak tersedia.');

    sessionId = `backup-${Math.random().toString(36).slice(2, 10)}`;
    callStatus = 'connected';
    errorMessage = null;
    startTimer();
    startVisualizer();
    showToast('Terhubung melalui mode cadangan');

    const greeting =
      data?.dynamicVariables?.agent_greeting ||
      (voiceGender === 'male'
        ? 'Halo! Saya Mas Rouf, Kapus Datin. Gimana, ada yang mau kita obrolin hari ini?'
        : 'Halo, aku Jasmin! Apa kabar? Ada yang bisa aku bantu hari ini?');

    transcripts = [
      ...transcripts,
      {
        eventId: Date.now(),
        speaker: 'agent',
        text: greeting,
        timestamp: new Date().toISOString()
      }
    ];
    scrollTranscriptToBottom();
    speakFallbackBrowser(greeting);
  }

  async function sendFallbackMessage(text) {
    if (!text || isProcessingFallback) return;
    isProcessingFallback = true;
    clearIdleTimerHandle();

    transcripts = [
      ...transcripts,
      {
        eventId: Date.now(),
        speaker: 'user',
        text,
        timestamp: new Date().toISOString()
      }
    ];
    scrollTranscriptToBottom();

    try {
      const res = await fetch('/api/call/fallback-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, voiceGender })
      });
      const json = await res.json();
      const reply = json?.reply || 'Maaf, silakan ulangi pertanyaan Anda.';

      transcripts = [
        ...transcripts,
        {
          eventId: Date.now() + 1,
          speaker: 'agent',
          text: reply,
          timestamp: new Date().toISOString()
        }
      ];
      scrollTranscriptToBottom();
      speakFallbackBrowser(reply);
    } catch {
      const errReply = 'Maaf, terjadi gangguan saat mengambil data. Silakan coba kembali.';
      transcripts = [
        ...transcripts,
        {
          eventId: Date.now() + 1,
          speaker: 'agent',
          text: errReply,
          timestamp: new Date().toISOString()
        }
      ];
      speakFallbackBrowser(errReply);
    } finally {
      isProcessingFallback = false;
    }
  }

  async function startCall() {
    if (callStatus === 'initializing' || callStatus === 'connected') return;

    const attemptId = ++callAttemptSeq;
    errorMessage = null;
    fallbackNotice = null;
    isFallbackMode = false;
    callStatus = 'initializing';
    isMicMuted = false;
    isAudioMuted = false;
    transcripts = [];
    currentSessionData = null;

    try {
      // Request microphone access before opening real-time voice session
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      if (attemptId !== callAttemptSeq) return;

      // Fetch short-lived session token from server endpoint
      const response = await fetch('/api/agent/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceGender })
      });
      if (attemptId !== callAttemptSeq) return;

      const data = await response.json();
      currentSessionData = data;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal terhubung ke saluran suara.');
      }

      // Automatic seamless fallback if primary voice credits are exhausted
      if (data.connectionType === 'fallback') {
        activateFallbackMode(data);
        return;
      }

      const sessionConfig =
        data.connectionType === 'webrtc' && data.conversationToken
          ? {
              conversationToken: data.conversationToken,
              connectionType: 'webrtc'
            }
          : {
              signedUrl: data.signedUrl,
              connectionType: 'websocket'
            };

      const ttsOverrides = data.voiceConfig
        ? {
            overrides: {
              tts: {
                voiceId: data.voiceConfig.voiceId,
                stability: data.voiceConfig.stability,
                speed: data.voiceConfig.speed,
                similarityBoost: data.voiceConfig.similarityBoost
              }
            }
          }
        : {};

      const agentDisplayName =
        data.voiceConfig?.agentName || (voiceGender === 'male' ? 'Mas Rouf' : 'Jasmin');

      const dynamicVariables = data.dynamicVariables || {
        agent_name: agentDisplayName
      };

      let hadConnected = false;

      const startedConversation = await Conversation.startSession({
        ...sessionConfig,
        ...ttsOverrides,
        dynamicVariables,
        onConnect: ({ conversationId }) => {
          if (attemptId !== callAttemptSeq) return;
          hadConnected = true;
          sessionId = conversationId || data.conversationId || 'aktif';
          callStatus = 'connected';
          isListening = true;
          startTimer();
          startVisualizer();
          resetIdleTimer(attemptId);
          showToast('Saluran suara AI terhubung');
        },
        onDisconnect: (details) => {
          if (attemptId !== callAttemptSeq) return;
          stopIdleTimer();
          stopTimer();
          stopVisualizer();
          isListening = false;
          isSpeaking = false;
          conversation = null;

          const isAgentUnavailable =
            details?.closeCode === 3000 ||
            (details?.closeReason && details.closeReason.toLowerCase().includes('not available'));

          if (isAgentUnavailable || (!hadConnected && details?.reason === 'error')) {
            activateFallbackMode(
              currentSessionData,
              isAgentUnavailable
                ? 'Saluran suara utama sedang tidak tersedia / kuota habis. Beralih ke mode cadangan.'
                : 'Gagal tersambung ke saluran suara utama. Beralih ke mode cadangan.'
            );
            return;
          }

          if (callStatus !== 'waiting') {
            callStatus = 'disconnected';
          }
          if (details?.reason === 'error') {
            errorMessage =
              details?.message ||
              'Sambungan terputus karena gangguan jaringan. Silakan coba hubungi lagi.';
          }
        },
        onModeChange: ({ mode }) => {
          if (attemptId !== callAttemptSeq) return;
          isSpeaking = mode === 'speaking';
          isListening = mode === 'listening';
          if (isSpeaking) {
            clearIdleTimerHandle();
          } else {
            resetIdleTimer(attemptId);
          }
        },
        onMessage: (payload) => {
          if (attemptId !== callAttemptSeq) return;
          const text = payload?.message?.trim();
          if (!text) return;

          const speaker =
            payload.role === 'user' || payload.source === 'user' ? 'user' : 'agent';

          transcripts = [
            ...transcripts,
            {
              eventId: payload.event_id,
              speaker,
              text,
              timestamp: new Date().toISOString()
            }
          ];
          scrollTranscriptToBottom();
          if (speaker === 'user') {
            clearIdleTimerHandle();
          } else if (!isSpeaking) {
            resetIdleTimer(attemptId);
          }
        },
        onAgentResponseCorrection: (correction) => {
          if (attemptId !== callAttemptSeq) return;
          if (!correction?.corrected_agent_response) return;
          transcripts = transcripts.map((item) =>
            item.speaker === 'agent' && item.eventId === correction.event_id
              ? { ...item, text: correction.corrected_agent_response }
              : item
          );
        },
        onError: (msg) => {
          if (attemptId !== callAttemptSeq) return;
          if (!hadConnected) {
            console.warn('Voice session fallback triggered before connect:', msg);
            activateFallbackMode(currentSessionData);
          } else {
            console.error('Voice session error:', msg);
            errorMessage = 'Terjadi gangguan pada sesi suara. Silakan coba lagi.';
          }
        }
      });

      if (attemptId !== callAttemptSeq) {
        startedConversation?.endSession?.().catch(() => {});
        return;
      }
      conversation = startedConversation;
    } catch (err) {
      if (attemptId !== callAttemptSeq) return;
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        console.error(err);
        callStatus = 'disconnected';
        errorMessage = 'Izin mikrofon ditolak. Aktifkan izin mikrofon di browser Anda untuk berbicara.';
        showToast('Izin mikrofon diperlukan');
      } else if (err?.name === 'NotFoundError') {
        console.error(err);
        callStatus = 'disconnected';
        errorMessage = 'Mikrofon tidak ditemukan pada perangkat Anda.';
        showToast('Mikrofon tidak ditemukan');
      } else {
        console.warn('Voice session unavailable, switching to fallback mode:', err?.message || err);
        activateFallbackMode(currentSessionData);
      }
    }
  }

  async function endCall(toastText = 'Panggilan telepon telah diakhiri') {
    callAttemptSeq += 1;
    stopIdleTimer();
    stopTimer();
    stopVisualizer();
    stopFallbackSpeech();
    isListening = false;
    isSpeaking = false;
    callStatus = 'disconnected';

    if (conversation) {
      try {
        await conversation.endSession();
      } catch (e) {
        console.warn(e);
      }
      conversation = null;
    }
    showToast(typeof toastText === 'string' ? toastText : 'Panggilan telepon telah diakhiri');
  }

  function toggleMicMute() {
    isMicMuted = !isMicMuted;
    if (isFallbackMode) {
      if (isMicMuted) {
        try {
          recognition?.stop();
        } catch {}
        isListening = false;
      } else {
        startFallbackListening();
      }
      return;
    }
    if (conversation) {
      conversation.setMicMuted(isMicMuted);
    }
  }

  function toggleAudioOutput() {
    isAudioMuted = !isAudioMuted;
    if (isFallbackMode) {
      if (isAudioMuted && synth) {
        synth.cancel();
        isSpeaking = false;
      }
      return;
    }
    if (conversation) {
      conversation.setVolume({ volume: isAudioMuted ? 0 : 1 });
    }
  }

  function sendTypedMessage() {
    const text = inputMessage.trim();
    if (!text || callStatus !== 'connected') return;

    inputMessage = '';

    if (isFallbackMode) {
      sendFallbackMessage(text);
      return;
    }

    if (!conversation) return;

    transcripts = [
      ...transcripts,
      {
        eventId: Date.now(),
        speaker: 'user',
        text,
        timestamp: new Date().toISOString()
      }
    ];
    scrollTranscriptToBottom();

    try {
      clearIdleTimerHandle();
      conversation.sendUserActivity();
      conversation.sendUserMessage(text);
    } catch (err) {
      console.error('Send text message error:', err);
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
            <span class="text-sm font-semibold text-slate-600">Powered by AI • Siap 24/7</span>
          </div>

          <p class="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mb-5">
            Dapatkan bantuan instan dari asisten virtual profesional kami. Mulai percakapan suara dua arah secara langsung dengan teknologi AI terdepan untuk solusi cepat, cerdas, dan akurat.
          </p>

          <!-- 3 Value Pills -->
          <div class="grid grid-cols-3 gap-2 sm:gap-4 max-w-md mx-auto sm:mx-0">
            <div class="glass py-2 px-3 rounded-2xl flex items-center gap-2 border border-white/60 shadow-sm">
              <span class="font-bold text-[#264755] text-xs sm:text-sm px-1.5 py-0.5 rounded-lg bg-teal-100/70">AI</span>
              <span class="text-xs font-medium text-slate-700 truncate">Teknologi Terdepan</span>
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
                <span>Menunggu</span>
              </div>
            {:else if callStatus === 'initializing'}
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-100 text-amber-800 font-semibold text-sm">
                <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <span>Menghubungkan...</span>
              </div>
            {:else if callStatus === 'connected'}
              <div class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-100 text-emerald-800 font-semibold text-sm">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Terhubung ({formatDuration(callSeconds)})</span>
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
          <div class="glass-strong font-mono px-4 py-2 rounded-2xl text-sm font-semibold text-slate-700 border border-white/60 truncate">
            {sessionId || 'Belum tersambung'}
          </div>
        </div>
      </div>

      <!-- INTERACTIVE CALL ACTION AREA -->
      {#if callStatus === 'waiting' || callStatus === 'disconnected'}
        <!-- IDLE / DISCONNECTED STATE -->
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <!-- Voice Gender Selector -->
          <div class="mb-7 w-full max-w-xs">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-center gap-1.5">
              <UserRound class="w-3.5 h-3.5 text-teal-600" />
              <span>Pilih Asisten Suara</span>
            </div>
            <div class="grid grid-cols-2 gap-2 p-1.5 glass-strong rounded-2xl border border-white/80 shadow-sm">
              <button
                type="button"
                onclick={() => (voiceGender = 'female')}
                class="py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer flex flex-col items-center justify-center {voiceGender === 'female' ? 'bg-gradient-to-r from-[#264755] to-teal-700 text-white shadow-md' : 'text-slate-600 hover:bg-white/70'}"
              >
                <span>Jasmin</span>
                <span class="text-[10px] font-normal {voiceGender === 'female' ? 'text-emerald-200' : 'text-slate-400'}">Perempuan</span>
              </button>
              <button
                type="button"
                onclick={() => (voiceGender = 'male')}
                class="py-2.5 px-4 rounded-xl text-sm font-semibold transition-all cursor-pointer flex flex-col items-center justify-center {voiceGender === 'male' ? 'bg-gradient-to-r from-[#264755] to-teal-700 text-white shadow-md' : 'text-slate-600 hover:bg-white/70'}"
              >
                <span>Mas Rouf</span>
                <span class="text-[10px] font-normal {voiceGender === 'male' ? 'text-emerald-200' : 'text-slate-400'}">Kapus Datin</span>
              </button>
            </div>
          </div>

          <!-- Auto-End on Inactivity Selector -->
          <div class="mb-7 w-full max-w-xs">
            <div class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
              <Clock class="w-3.5 h-3.5 text-teal-600" />
              <span>Tutup Otomatis Jika Hening</span>
            </div>
            <div class="grid grid-cols-4 gap-1.5 p-1 glass-strong rounded-2xl border border-white/80 shadow-sm">
              {#each [{ v: 1, label: '1 Mnt' }, { v: 2, label: '2 Mnt' }, { v: 5, label: '5 Mnt' }, { v: 0, label: 'Off' }] as opt}
                <button
                  type="button"
                  onclick={() => (idleTimeoutMinutes = opt.v)}
                  class="py-1.5 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer {idleTimeoutMinutes === opt.v ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white/70'}"
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>

          <div class="relative group mb-6">
            <!-- Pulsing ambient glow -->
            <div class="absolute -inset-2 bg-gradient-to-r from-[#264755]/30 to-emerald-500/30 rounded-3xl blur-xl opacity-70 group-hover:opacity-100 transition duration-500 animate-pulse-glow"></div>

            <button
              onclick={startCall}
              class="relative bg-gradient-to-r from-[#264755] to-[#1a343e] hover:from-[#1d3a46] hover:to-[#142931] text-white font-bold py-7 px-12 sm:px-16 rounded-3xl shadow-2xl flex items-center gap-4 text-xl tracking-wide transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer border border-teal-600/30"
            >
              <Phone class="w-7 h-7 text-emerald-400 animate-bounce" />
              <span>{callStatus === 'disconnected' ? 'Hubungi Lagi' : 'Mulai Telepon AI'}</span>
            </button>
          </div>

          <p class="text-sm text-slate-500 max-w-md leading-relaxed">
            Klik tombol di atas untuk memulai percakapan suara dua arah secara langsung dengan asisten layanan pelanggan AI
          </p>

          {#if errorMessage}
            <div class="mt-4 flex items-center gap-2 text-rose-600 text-sm bg-rose-50 px-4 py-2 rounded-xl border border-rose-200">
              <AlertCircle class="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          {/if}

          {#if callStatus === 'disconnected' && transcripts.length > 0}
            <!-- Keep last call transcript visible after hanging up -->
            <div class="w-full mt-8 text-left glass-strong rounded-3xl p-5 border border-white/80 shadow-md">
              <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-200/60">
                <div class="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <MessageSquare class="w-4 h-4 text-teal-600" />
                  <span>Ringkasan Transkrip Telepon Terakhir</span>
                </div>
                <span class="text-xs text-slate-400">{transcripts.length} pesan</span>
              </div>
              <div class="space-y-3 max-h-60 overflow-y-auto pr-2">
                {#each transcripts as msg}
                  <div class="flex gap-3 {msg.speaker === 'user' ? 'justify-end' : 'justify-start'}">
                    {#if msg.speaker !== 'user'}
                      <div class="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow text-[10px] font-bold">
                        {activeAgentName === 'Mas Rouf' ? 'MR' : 'J'}
                      </div>
                    {/if}
                    <div class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm {msg.speaker === 'user' ? 'bg-[#264755] text-white rounded-tr-none' : 'glass border border-white/80 text-slate-800 rounded-tl-none'}">
                      <p>{msg.text}</p>
                    </div>
                    {#if msg.speaker === 'user'}
                      <div class="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0 shadow text-[11px] font-bold">
                        Anda
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
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
          <p class="text-sm text-slate-500">Mempersiapkan koneksi suara real-time dan mikrofon</p>
        </div>
      {:else if callStatus === 'connected'}
        <!-- CONNECTED ACTIVE TELEPHONE CALL STATE -->
        <div class="space-y-6">
          {#if isFallbackMode && fallbackNotice}
            <div class="flex items-center gap-2.5 text-amber-800 text-xs sm:text-sm bg-amber-50/90 px-4 py-2.5 rounded-2xl border border-amber-200/80 shadow-sm">
              <AlertCircle class="w-4 h-4 shrink-0 text-amber-600" />
              <span>{fallbackNotice}</span>
            </div>
          {/if}

          <!-- Active Call Wave Banner -->
          <div class="glass-strong rounded-3xl p-6 border border-white/70 shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-4">
              <!-- Mic Status Animation -->
              <div class="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                {#if isMicMuted}
                  <MicOff class="w-7 h-7 text-rose-500" />
                {:else}
                  <Mic class="w-7 h-7 text-emerald-600 {isSpeaking || isListening ? 'animate-pulse' : ''}" />
                  {#if isSpeaking || isListening}
                    <span class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span>
                  {/if}
                {/if}
              </div>

              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-bold text-slate-800 text-base">Saluran Telepon Aktif</h4>
                  <span class="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                    {formatDuration(callSeconds)}
                  </span>
                  <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-100/80 text-teal-800">
                    {voiceGender === 'male' ? 'Mas Rouf • Kapus Datin' : 'Jasmin'}
                  </span>
                  {#if idleTimeoutMinutes > 0}
                    <span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      Auto-tutup {idleTimeoutMinutes} mnt diam
                    </span>
                  {/if}
                </div>
                <p class="text-xs font-medium text-slate-500">
                  {#if isSpeaking}
                    <span class="text-emerald-700 font-semibold animate-pulse">🔊 {activeAgentName} sedang berbicara...</span>
                  {:else if isMicMuted}
                    <span class="text-rose-600 font-semibold">🔇 Mikrofon Anda sedang dibisukan</span>
                  {:else if isListening}
                    <span class="text-teal-700 font-semibold">🎙️ Mendengarkan — silakan berbicara langsung</span>
                  {:else}
                    <span>Terhubung — silakan berbicara atau ketik di bawah</span>
                  {/if}
                </p>
              </div>
            </div>

            <!-- Live Audio Amplitude Soundwave Visualizer -->
            <div class="flex items-center gap-1.5 h-12 px-4 py-2 glass rounded-2xl border border-white/60">
              {#each waveBars as level, idx}
                <span
                  class="w-1.5 rounded-full transition-all duration-75 {isSpeaking ? 'bg-emerald-500' : idx % 2 === 0 ? 'bg-teal-500' : 'bg-[#264755]'}"
                  style="height: {Math.round(level * 32)}px;"
                ></span>
              {/each}
            </div>

            <!-- Controls: Speaker Mute, Mic Mute & End Call -->
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

              <!-- Mic Mute Toggle Button -->
              <button
                onclick={toggleMicMute}
                class="px-4 py-3 glass-strong hover:bg-white rounded-2xl border border-slate-200/80 font-semibold text-sm flex items-center gap-2 transition cursor-pointer shadow-sm {isMicMuted ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-emerald-50/70 border-emerald-300 text-emerald-800'}"
              >
                {#if isMicMuted}
                  <MicOff class="w-4 h-4 text-rose-600" />
                  <span>Mic Mati</span>
                {:else}
                  <Mic class="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span>Mic Aktif</span>
                {/if}
              </button>

              <!-- End Call Button -->
              <button
                onclick={endCall}
                class="bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white font-bold px-6 py-3.5 rounded-2xl shadow-lg flex items-center gap-2.5 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
              >
                <PhoneOff class="w-5 h-5" />
                <span>Akhiri Panggilan</span>
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
            <div
              bind:this={transcriptContainer}
              class="space-y-4 max-h-80 overflow-y-auto pr-2"
            >
              {#if transcripts.length === 0}
                <div class="text-center py-6 text-xs text-slate-400">
                  Menunggu percakapan dimulai... Silakan sapa atau langsung berbicara di mikrofon.
                </div>
              {/if}

              {#each transcripts as msg}
                <div class="flex gap-3 {msg.speaker === 'user' ? 'justify-end' : 'justify-start'}">
                  {#if msg.speaker !== 'user'}
                    <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow text-[11px] font-bold">
                      {activeAgentName === 'Mas Rouf' ? 'MR' : 'J'}
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
            </div>

            <!-- Optional text input during call -->
            <form
              onsubmit={(e) => { e.preventDefault(); sendTypedMessage(); }}
              class="mt-4 pt-4 border-t border-slate-200/60 flex items-center gap-2"
            >
              <input
                type="text"
                bind:value={inputMessage}
                placeholder="Atau ketik pesan selama telepon berlangsung..."
                class="flex-1 glass bg-white/70 px-4 py-2.5 rounded-2xl border border-slate-200/80 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-slate-800"
              />
              <button
                type="submit"
                disabled={!inputMessage.trim() || isProcessingFallback}
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
          Berbicara langsung dua arah dengan asisten AI menggunakan teknologi suara terdepan berintonasi manusiawi.
        </p>
      </div>

      <!-- Feature 2: AI Cerdas -->
      <div class="glass-strong border border-white/70 rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
        <div class="w-14 h-14 glass rounded-2xl flex items-center justify-center mb-4 shadow-md border border-white/80">
          <Sparkles class="w-7 h-7 text-emerald-600" />
        </div>
        <h3 class="text-lg font-bold text-slate-800 mb-2">Paham Konteks</h3>
        <p class="text-sm text-slate-600 leading-relaxed">
          Pemahaman konteks yang mendalam untuk menjawab pertanyaan umum maupun kebutuhan bisnis secara akurat.
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
      <p class="font-medium text-slate-600">Asisten Layanan Pelanggan Virtual</p>
    </footer>
  </div>
</main>
