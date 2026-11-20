import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Auth from "./pages/Auth";
import Banned from "./pages/Banned";
import NotFound from "./pages/NotFound";
import Post from "./pages/Post";
import { AppShell } from "./components/layout/AppShell";
import { AppView } from "./pages/AppViews";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/banned" element={<Banned />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<AppView view="feed" />} />
              <Route path="/feed" element={<AppView view="feed" />} />
              <Route path="/chats" element={<AppView view="chats" />} />
              <Route path="/chats/:id" element={<AppView view="chats" />} />
              <Route path="/messages" element={<AppView view="chats" />} />
              <Route path="/ai" element={<AppView view="ai" />} />
              <Route path="/search" element={<AppView view="search" />} />
              <Route path="/marketplace" element={<AppView view="marketplace" />} />
              <Route path="/workshop" element={<AppView view="workshop" />} />
              <Route path="/profile" element={<AppView view="profile" />} />
              <Route path="/settings" element={<AppView view="settings" />} />
              <Route path="/profile/:username" element={<AppView view="user" />} />
              <Route path="/users/:id" element={<AppView view="user" />} />
              <Route path="/p/:id" element={<Post />} />
              <Route path="/post/:id" element={<Post />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </LanguageProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
