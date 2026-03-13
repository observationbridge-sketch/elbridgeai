import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { POINTS, getAnimalLevel, BADGES } from "@/components/gamification/constants";

interface PendingBadge {
  icon: string;
  name: string;
}

export function useGamification(studentName: string, teacherId: string) {
  const [totalPoints, setTotalPoints] = useState(0);
  const [sessionPoints, setSessionPoints] = useState(0);
  const [showPointsAnim, setShowPointsAnim] = useState(false);
  const [lastPointsEarned, setLastPointsEarned] = useState(0);
  const [earnedBadgeIds, setEarnedBadgeIds] = useState<string[]>([]);
  const [pendingBadge, setPendingBadge] = useState<PendingBadge | null>(null);
  const [evolutionData, setEvolutionData] = useState<{ emoji: string; name: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const prevLevelRef = useRef<string>("");

  const loadData = useCallback(async () => {
    if (!studentName || !teacherId) return;

    // Load points
    const { data: pointsData } = await supabase
      .from("student_points")
      .select("*")
      .eq("student_name", studentName)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (pointsData) {
      setTotalPoints(pointsData.total_points);
      prevLevelRef.current = getAnimalLevel(pointsData.total_points).name;
    } else {
      prevLevelRef.current = getAnimalLevel(0).name;
    }

    // Load badges
    const { data: badgeData } = await supabase
      .from("student_badges")
      .select("badge_id")
      .eq("student_name", studentName)
      .eq("teacher_id", teacherId);

    if (badgeData) {
      setEarnedBadgeIds(badgeData.map((b) => b.badge_id));
    }

    setLoaded(true);
  }, [studentName, teacherId]);

  const addPoints = useCallback(async (points: number) => {
    if (!studentName || !teacherId || points <= 0) return;

    const newTotal = totalPoints + points;
    setTotalPoints(newTotal);
    setSessionPoints((s) => s + points);
    setLastPointsEarned(points);
    setShowPointsAnim(true);

    // Check evolution
    const newLevel = getAnimalLevel(newTotal);
    if (newLevel.name !== prevLevelRef.current) {
      setTimeout(() => {
        setEvolutionData({ emoji: newLevel.emoji, name: newLevel.name });
      }, 1600);
      prevLevelRef.current = newLevel.name;
    }

    // Upsert points
    const today = new Date().toISOString().split("T")[0];

    // Try update first
    const { data: existing } = await supabase
      .from("student_points")
      .select("id, total_points, sessions_completed, current_streak, last_session_date")
      .eq("student_name", studentName)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (existing) {
      let streak = existing.current_streak;
      if (existing.last_session_date) {
        const lastDate = new Date(existing.last_session_date);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);
        if (diffDays === 1) streak += 1;
        else if (diffDays > 1) streak = 1;
      } else {
        streak = 1;
      }

      await supabase
        .from("student_points")
        .update({
          total_points: existing.total_points + points,
          current_streak: streak,
          last_session_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("student_points").insert({
        student_name: studentName,
        teacher_id: teacherId,
        total_points: points,
        sessions_completed: 0,
        current_streak: 1,
        last_session_date: today,
      });
    }
  }, [studentName, teacherId, totalPoints]);

  const completeSession = useCallback(async () => {
    if (!studentName || !teacherId) return;

    const { data: existing } = await supabase
      .from("student_points")
      .select("id, sessions_completed")
      .eq("student_name", studentName)
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("student_points")
        .update({ sessions_completed: existing.sessions_completed + 1 })
        .eq("id", existing.id);
    }
  }, [studentName, teacherId]);

  const awardBadge = useCallback(async (badgeId: string) => {
    if (!studentName || !teacherId || earnedBadgeIds.includes(badgeId)) return;

    const badge = BADGES.find((b) => b.id === badgeId);
    if (!badge) return;

    // Insert (ignore conflict)
    await supabase.from("student_badges").insert({
      student_name: studentName,
      teacher_id: teacherId,
      badge_id: badgeId,
      badge_name: badge.name,
      badge_icon: badge.icon,
    });

    setEarnedBadgeIds((prev) => [...prev, badgeId]);
    setPendingBadge({ icon: badge.icon, name: badge.name });
  }, [studentName, teacherId, earnedBadgeIds]);

  return {
    totalPoints,
    sessionPoints,
    showPointsAnim,
    setShowPointsAnim,
    lastPointsEarned,
    earnedBadgeIds,
    pendingBadge,
    setPendingBadge,
    evolutionData,
    setEvolutionData,
    loaded,
    loadData,
    addPoints,
    completeSession,
    awardBadge,
    POINTS,
  };
}
