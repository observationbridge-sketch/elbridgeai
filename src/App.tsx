import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import TeacherAuth from "./pages/TeacherAuth.tsx";
import TeacherDashboard from "./pages/TeacherDashboard.tsx";
import StudentJoin from "./pages/StudentJoin.tsx";
import StudentSession from "./pages/StudentSession.tsx";
import StudentThemePicker from "./pages/StudentThemePicker.tsx";
import SessionSummary from "./pages/SessionSummary.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/teacher/auth" element={<TeacherAuth />} />
          <Route path="/teacher/dashboard" element={<TeacherDashboard />} />
          <Route path="/teacher/session/:sessionId" element={<SessionSummary />} />
          <Route path="/student/join" element={<StudentJoin />} />
          <Route path="/join/:code" element={<StudentJoin />} />
          <Route path="/student/theme/:sessionId/:studentId" element={<StudentThemePicker />} />
          <Route path="/student/session/:sessionId/:studentId" element={<StudentSession />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
