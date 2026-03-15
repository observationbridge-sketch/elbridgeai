// Web Audio API reward sounds for student sessions — no external files needed

import { useCallback, useRef, useState, useEffect } from "react";

const STORAGE_KEY = "elbridge-sound-muted";

export function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch {}
  }, [muted]);

  const getCtx = useCallback(() => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === "suspended") {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const stopAll = useCallback(() => {
    // closing and recreating is simplest way to stop all scheduled sounds
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
  }, []);

  const playTone = useCallback((ctx: AudioContext, freq: number, startTime: number, duration: number, gain = 0.3) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, startTime);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }, []);

  const playCorrect = useCallback(() => {
    if (muted) return;
    stopAll();
    const ctx = getCtx();
    const now = ctx.currentTime;
    // C-E-G ascending arpeggio
    playTone(ctx, 523, now, 0.18, 0.25);
    playTone(ctx, 659, now + 0.15, 0.18, 0.25);
    playTone(ctx, 784, now + 0.30, 0.25, 0.3);
  }, [muted, getCtx, stopAll, playTone]);

  const playPartiallyCorrect = useCallback(() => {
    if (muted) return;
    stopAll();
    const ctx = getCtx();
    const now = ctx.currentTime;
    playTone(ctx, 440, now, 0.2, 0.2);
    playTone(ctx, 523, now + 0.2, 0.2, 0.2);
  }, [muted, getCtx, stopAll, playTone]);

  const playWrong = useCallback(() => {
    if (muted) return;
    stopAll();
    const ctx = getCtx();
    const now = ctx.currentTime;
    // Gentle low tone, not harsh
    playTone(ctx, 330, now, 0.3, 0.15);
  }, [muted, getCtx, stopAll, playTone]);

  const playBadge = useCallback(() => {
    if (muted) return;
    stopAll();
    const ctx = getCtx();
    const now = ctx.currentTime;
    // 5-tone celebration fanfare
    const freqs = [523, 587, 659, 784, 1047];
    freqs.forEach((f, i) => {
      const dur = i === freqs.length - 1 ? 0.4 : 0.18;
      playTone(ctx, f, now + i * 0.2, dur, 0.25);
    });
  }, [muted, getCtx, stopAll, playTone]);

  const playPoints = useCallback(() => {
    if (muted) return;
    stopAll();
    const ctx = getCtx();
    playTone(ctx, 880, ctx.currentTime, 0.2, 0.15);
  }, [muted, getCtx, stopAll, playTone]);

  const playSessionComplete = useCallback(() => {
    if (muted) return;
    stopAll();
    const ctx = getCtx();
    const now = ctx.currentTime;
    // Elaborate ascending celebration
    const melody = [523, 587, 659, 784, 880, 988, 1047, 1175, 1319, 1397, 1568];
    melody.forEach((f, i) => {
      const dur = i === melody.length - 1 ? 0.6 : 0.18;
      const gain = 0.15 + (i / melody.length) * 0.15;
      playTone(ctx, f, now + i * 0.2, dur, gain);
    });
  }, [muted, getCtx, stopAll, playTone]);

  const toggleMute = useCallback(() => setMuted(m => !m), []);

  return {
    muted,
    toggleMute,
    playCorrect,
    playPartiallyCorrect,
    playWrong,
    playBadge,
    playPoints,
    playSessionComplete,
  };
}
