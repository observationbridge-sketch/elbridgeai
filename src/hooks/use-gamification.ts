import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { POINTS, getAnimalLevel, BADGES } from "@/components/gamification/constants";

interface PendingBadge {
  icon: string;
  name: string;
}

interface FailedBadge {
  badgeId: string;
  badgeName: string;
  badgeIcon: string;
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
  // Ref-based accumulator to prevent stale state reads on rapid point awards
  const totalPointsRef = useRef(0);
  // Accumulate points in memory; only write to DB at session end
  const pendingPointsRef = useRef(0);
  // Track evolution fires to prevent double-fire per level per session
  const evolutionFiredRef = useRef<Set<string>>(new Set());
  // Queue failed badge inserts for retry at session end
  const failedBadgesRef = useRef<FailedBadge[]>([]);

  const loadData = useCallback(async () => {
    if (!studentName || !teacherId) return;

    try {
      const { data: pointsData, error: pointsError } = await supabase
        .from("student_points")
        .select("*")
        .eq("student_name", studentName)
        .eq("teacher_id", teacherId)
        .maybeSingle();

      if (pointsError) {
        console.error("[gamification] Failed to load points:", pointsError.message);
      }

      if (pointsData) {
        setTotalPoints(pointsData.total_points);
        totalPointsRef.current = pointsData.total_points;
        prevLevelRef.current = getAnimalLevel(pointsData.total_points).name;
      } else {
        prevLevelRef.current = getAnimalLevel(0).name;
      }
    } catch (err) {
      console.error("[gamification] Points load exception:", err);
      prevLevelRef.current = getAnimalLevel(0).name;
    }

    try {
      const { data: badgeData, error: badgeError } = await supabase
        .from("student_badges")
        .select("badge_id")
        .eq("student_name", studentName)
        .eq("teacher_id", teacherId);

      if (badgeError) {
        console.error("[gamification] Failed to load badges:", badgeError.message);
      }

      if (badgeData) {
        setEarnedBadgeIds(badgeData.map((b) => b.badge_id));
      }
    } catch (err) {
      console.error("[gamification] Badges load exception:", err);
    }

    setLoaded(true);
  }, [studentName, teacherId]);

  const addPoints = useCallback((points: number) => {
    if (!studentName || !teacherId || points <= 0) return;

    // Use ref for immediate calculation to avoid stale state
    totalPointsRef.current += points;
    pendingPointsRef.current += points;
    const newTotal = totalPointsRef.current;

    setTotalPoints(newTotal);
    setSessionPoints((s) => s + points);
    setLastPointsEarned(points);
    setShowPointsAnim(true);

    // Check evolution — only fire once per level per session
    const newLevel = getAnimalLevel(newTotal);
    if (
      newLevel.name !== prevLevelRef.current &&
      !evolutionFiredRef.current.has(newLevel.name)
    ) {
      evolutionFiredRef.current.add(newLevel.name);
      setTimeout(() => {
        setEvolutionData({ emoji: newLevel.emoji, name: newLevel.name });
      }, 1600);
      prevLevelRef.current = newLevel.name;
    }

    // No DB write here — points are saved in completeSession
  }, [studentName, teacherId]);

  const completeSession = useCallback(async (finalSessionPoints?: number) => {
    if (!studentName || !teacherId) return;

    const pointsToSave = finalSessionPoints ?? pendingPointsRef.current;
    const today = new Date().toISOString().split("T")[0];

    try {
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
            total_points: existing.total_points + pointsToSave,
            sessions_completed: existing.sessions_completed + 1,
            current_streak: streak,
            last_session_date: today,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("student_points").insert({
          student_name: studentName,
          teacher_id: teacherId,
          total_points: pointsToSave,
          sessions_completed: 1,
          current_streak: 1,
          last_session_date: today,
        });
      }
    } catch (err) {
      console.error("[gamification] Failed to save session points:", err);
    }

    // Retry any failed badge inserts
    if (failedBadgesRef.current.length > 0) {
      const retries = [...failedBadgesRef.current];
      failedBadgesRef.current = [];
      for (const fb of retries) {
        try {
          await supabase.from("student_badges").insert({
            student_name: studentName,
            teacher_id: teacherId,
            badge_id: fb.badgeId,
            badge_name: fb.badgeName,
            badge_icon: fb.badgeIcon,
          });
        } catch (retryErr) {
          console.error("[gamification] Badge retry failed:", fb.badgeId, retryErr);
        }
      }
    }

    // Reset pending counter
    pendingPointsRef.current = 0;
  }, [studentName, teacherId]);

  const awardBadge = useCallback(async (badgeId: string) => {
    if (!studentName || !teacherId || earnedBadgeIds.includes(badgeId)) return;

    const badge = BADGES.find((b) => b.id === badgeId);
    if (!badge) return;

    // Optimistically update local state regardless of DB success
    setEarnedBadgeIds((prev) => [...prev, badgeId]);
    setPendingBadge({ icon: badge.icon, name: badge.name });

    try {
      const { error } = await supabase.from("student_badges").insert({
        student_name: studentName,
        teacher_id: teacherId,
        badge_id: badgeId,
        badge_name: badge.name,
        badge_icon: badge.icon,
      });

      if (error) {
        console.error("[gamification] Badge insert error:", error.message);
        failedBadgesRef.current.push({
          badgeId,
          badgeName: badge.name,
          badgeIcon: badge.icon,
        });
      }
    } catch (err) {
      console.error("[gamification] Badge insert exception:", err);
      failedBadgesRef.current.push({
        badgeId,
        badgeName: badge.name,
        badgeIcon: badge.icon,
      });
    }
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
