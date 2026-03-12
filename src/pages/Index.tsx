import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, Brain, Mic, Headphones, PenTool } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="ElbridgeAI Logo" className="h-10 w-auto" />
            <span className="text-xl font-bold text-foreground">ElbridgeAI</span>
          </div>
          <Button variant="ghost" onClick={() => navigate("/teacher/auth")}>
            Teacher Login
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-5" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-4xl md:text-6xl font-bold text-foreground leading-tight">
              AI-Powered English Language Learning for{" "}
              <span className="text-gradient">Every Student</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Engage your K-12 students with adaptive activities across Reading, Writing, Speaking, and Listening — aligned to WIDA standards.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button variant="hero" size="xl" onClick={() => navigate("/teacher/auth")}>
                <Users className="h-5 w-5 mr-2" />
                I'm a Teacher
              </Button>
              <Button variant="heroOutline" size="xl" onClick={() => navigate("/student/join")}>
                <BookOpen className="h-5 w-5 mr-2" />
                I'm a Student
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Domains */}
      <section className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center text-foreground mb-12">
          Four Domains of Language Acquisition
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: BookOpen, title: "Reading", desc: "Comprehension passages and vocabulary in context", color: "text-primary" },
            { icon: PenTool, title: "Writing", desc: "Guided writing prompts and sentence building", color: "text-accent" },
            { icon: Mic, title: "Speaking", desc: "Pronunciation practice and verbal responses", color: "text-success" },
            { icon: Headphones, title: "Listening", desc: "Audio comprehension and response activities", color: "text-warning" },
          ].map((domain) => (
            <div key={domain.title} className="bg-card rounded-xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 border border-border">
              <domain.icon className={`h-10 w-10 ${domain.color} mb-4`} />
              <h3 className="text-lg font-semibold text-card-foreground mb-2">{domain.title}</h3>
              <p className="text-muted-foreground text-sm">{domain.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          © {new Date().getFullYear()} ElbridgeAI. Aligned to WIDA Can-Do Descriptors for Grades 3–5.
        </div>
      </footer>
    </div>
  );
};

export default Index;
