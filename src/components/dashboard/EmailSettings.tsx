import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface EmailSettingsProps {
  userId: string;
}

const EmailSettings = ({ userId }: EmailSettingsProps) => {
  const [optedOut, setOptedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    const { data } = await supabase
      .from("teacher_preferences")
      .select("weekly_email_opt_out")
      .eq("teacher_id", userId)
      .maybeSingle();

    if (data) {
      setOptedOut(data.weekly_email_opt_out);
    }
    setLoading(false);
  };

  const toggleOptOut = async (checked: boolean) => {
    const newValue = !checked; // Switch shows "enabled", so invert for opt_out
    setOptedOut(newValue);

    const { data: existing } = await supabase
      .from("teacher_preferences")
      .select("id")
      .eq("teacher_id", userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("teacher_preferences")
        .update({ weekly_email_opt_out: newValue, updated_at: new Date().toISOString() })
        .eq("teacher_id", userId);
    } else {
      await supabase
        .from("teacher_preferences")
        .insert({ teacher_id: userId, weekly_email_opt_out: newValue });
    }

    toast.success(newValue ? "Weekly emails disabled" : "Weekly emails enabled");
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-weekly-report", {
        body: { teacher_id: userId },
      });
      if (error) throw error;
      toast.success("Report sent! Check your email.");
    } catch (err: any) {
      toast.error("Failed to send report: " + (err.message || "Unknown error"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="card-shadow border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Weekly Email Reports
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="email-toggle" className="text-sm text-muted-foreground">
            Receive weekly performance reports every Monday
          </Label>
          <Switch
            id="email-toggle"
            checked={!optedOut}
            onCheckedChange={toggleOptOut}
          />
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={sendNow}
          disabled={sending}
        >
          <Send className="h-4 w-4 mr-2" />
          {sending ? "Sending..." : "Send me this week's report now"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default EmailSettings;
