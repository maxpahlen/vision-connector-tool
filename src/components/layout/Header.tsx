import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, LogOut, Scale, TestTube, Settings, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const Header = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success("Signed out successfully");
      navigate("/auth");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign out");
    }
  };

  const getUserInitials = () => {
    if (!user?.email) return "U";
    return user.email[0].toUpperCase();
  };

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate("/")}>
              <Scale className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">SOU Radar</h1>
                <p className="text-xs text-muted-foreground">Legislative Intelligence Platform</p>
              </div>
            </div>
            
            {/* Navigation */}
            {user && (
              <nav className="hidden md:flex items-center space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/")}
                  className="text-sm"
                >
                  Hem
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/search")}
                  className="text-sm"
                >
                  Sök
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/insights/participation")}
                  className="text-sm"
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  Insikter
                </Button>
              </nav>
            )}
          </div>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar>
                    <AvatarFallback>{getUserInitials()}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">Account</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/admin/pdf-test")}>
                  <TestTube className="mr-2 h-4 w-4" />
                  PDF Test
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/admin/scraper")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Scraper Control
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
