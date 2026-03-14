import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Brain, ArrowRight, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const StudentJoin = () => {
  const navigate = useNavigate();
  const { code: urlCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeFromUrl, setCodeFromUrl] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (urlCode) {
      const upper = urlCode.toUpperCase().trim();
      setCode(upper);
      setCodeFromUrl(true);
      validateCode(upper);
    }
  }, [urlCode]);

  const validateCode = async (c: string) => {
    setValidatingCode(true);
    setCodeError(null);
    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("code", c)
      .eq("status", "active")
      .single();

    if (error || !data) {
      setCodeError("This session code is invalid or has expired. Ask your teacher for a new link.");
      setCodeFromUrl(false);
    }
    setValidatingCode(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const upperCode = code.toUpperCase().trim();

      const { data: session, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("code", upperCode)
        .eq("status", "active")
        .single();

      if (error || !session) {
        toast.error("Session not found. Check the code and try again.");
        setLoading(false);
        return;
      }

      const { data: student, error: joinError } = await supabase
        .from("session_students")
        .insert({ session_id: session.id, student_name: name.trim() })
        .select()
        .single();

      if (joinError) {
        toast.error("Could not join session. Try again.");
        setLoading(false);
        return;
      }

      toast.success(`Welcome, ${name}! 🎉`);
      navigate(`/student/theme/${session.id}/${student.id}`);
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md card-shadow">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <Brain className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join a Session</CardTitle>
          <CardDescription>
            {codeFromUrl ? "Enter your first name to join" : "Enter the code your teacher shared"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {codeError && (
            <div className="flex items-start gap-3 p-4 mb-4 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
              <p className="text-sm">{codeError}</p>
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            {codeFromUrl ? (
              <div className="space-y-2">
                <Label htmlFor="code">Session Code</Label>
                <div className="bg-muted rounded-lg p-4 text-center">
                  <span className="text-3xl font-mono font-bold tracking-[0.15em] text-primary">
                    {code}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="code">Session Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="text-center text-2xl font-mono tracking-[0.15em] h-14"
                  maxLength={6}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-base">Your First Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What's your name?"
                required
                maxLength={30}
                className="h-14 text-lg"
                autoFocus={!!codeFromUrl}
              />
            </div>
            <Button
              type="submit"
              variant="hero"
              className="w-full h-14 text-lg"
              size="lg"
              disabled={loading || validatingCode || !!codeError}
            >
              {loading ? "Joining..." : "Join Session"}
              {!loading && <ArrowRight className="h-5 w-5 ml-2" />}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-primary">
              ← Back to home
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentJoin;
