import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ContentHistoryProps {
  teacherId: string;
}

interface HistoryRecord {
  id: string;
  student_name: string;
  theme: string;
  topic: string;
  key_vocabulary: string[];
  vocabulary_results: Array<{ word: string; correct: boolean }>;
  activity_formats: string[];
  challenge_type: string | null;
  grade_band: string;
  is_baseline: boolean;
  session_date: string;
}

const ContentHistoryPanel = ({ teacherId }: ContentHistoryProps) => {
  const [students, setStudents] = useState<string[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const loadStudents = async () => {
      const { data } = await supabase
        .from("student_content_history")
        .select("student_name")
        .eq("teacher_id", teacherId);
      if (data) {
        const unique = [...new Set(data.map((d: any) => d.student_name))];
        setStudents(unique);
      }
    };
    loadStudents();
  }, [teacherId]);

  useEffect(() => {
    if (!selectedStudent) { setHistory([]); return; }
    const load = async () => {
      const { data } = await supabase
        .from("student_content_history")
        .select("*")
        .eq("student_name", selectedStudent)
        .eq("teacher_id", teacherId)
        .order("session_date", { ascending: false })
        .limit(10);
      if (data) setHistory(data as any);
    };
    load();
  }, [selectedStudent, teacherId]);

  // Compute vocabulary mastery
  const allVocabResults = history.flatMap((h) => h.vocabulary_results || []);
  const vocabMap = new Map<string, { correct: number; total: number }>();
  allVocabResults.forEach(({ word, correct }) => {
    const w = word.toLowerCase();
    const entry = vocabMap.get(w) || { correct: 0, total: 0 };
    entry.total++;
    if (correct) entry.correct++;
    vocabMap.set(w, entry);
  });

  const mastered = [...vocabMap.entries()].filter(([, v]) => v.correct / v.total >= 0.8);
  const learning = [...vocabMap.entries()].filter(([, v]) => v.correct / v.total < 0.8);

  const challengeTypes = [...new Set(history.map((h) => h.challenge_type).filter(Boolean))];

  if (!expanded) {
    return (
      <Card className="card-shadow border-border">
        <CardHeader className="cursor-pointer" onClick={() => setExpanded(true)}>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-accent" />
              Content History
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="card-shadow border-border">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(false)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-accent" />
            Content History
          </span>
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {students.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No content history yet. Students need to complete at least one session.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {students.map((s) => (
                <Button
                  key={s}
                  variant={selectedStudent === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedStudent(s)}
                >
                  {s}
                </Button>
              ))}
            </div>

            {selectedStudent && history.length > 0 && (
              <div className="space-y-4">
                {/* Themes covered */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">📚 Themes Covered ({history.length} sessions)</p>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set(history.map((h) => h.theme))].map((theme) => (
                      <span key={theme} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Vocabulary mastery */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-success/5 border border-success/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-success flex items-center gap-1 mb-2">
                      <CheckCircle className="h-4 w-4" /> Mastered ({mastered.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {mastered.slice(0, 20).map(([word]) => (
                        <span key={word} className="text-xs bg-success/10 text-success px-2 py-0.5 rounded">
                          {word}
                        </span>
                      ))}
                      {mastered.length > 20 && (
                        <span className="text-xs text-muted-foreground">+{mastered.length - 20} more</span>
                      )}
                    </div>
                  </div>
                  <div className="bg-warning/5 border border-warning/20 rounded-lg p-3">
                    <p className="text-sm font-medium text-warning flex items-center gap-1 mb-2">
                      <AlertCircle className="h-4 w-4" /> Still Learning ({learning.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {learning.slice(0, 20).map(([word]) => (
                        <span key={word} className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded">
                          {word}
                        </span>
                      ))}
                      {learning.length > 20 && (
                        <span className="text-xs text-muted-foreground">+{learning.length - 20} more</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Challenges completed */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">🏆 Challenges Completed</p>
                  <div className="flex gap-2">
                    {["story_builder", "speed_round", "teach_it_back"].map((ct) => (
                      <span
                        key={ct}
                        className={`text-xs px-2 py-1 rounded-full ${
                          challengeTypes.includes(ct)
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ct.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        {challengeTypes.includes(ct) ? " ✓" : ""}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Session list */}
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">📅 Recent Sessions</p>
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">{h.topic}</span>
                          <span className="text-muted-foreground ml-2">({h.theme})</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">{h.grade_band}</span>
                          {h.is_baseline && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">baseline</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(h.session_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedStudent && history.length === 0 && (
              <p className="text-muted-foreground text-center py-4">No history for this student yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ContentHistoryPanel;
