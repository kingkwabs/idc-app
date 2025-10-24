import { Search, User, LogOut, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

interface UserInfo {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function Header() {
  const [user, setUser] = useState<UserInfo | null>(null);

  useEffect(() => {
    fetchUserInfo();
  }, []);

  const fetchUserInfo = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    window.location.reload();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <header className="h-16 glass-header flex items-center justify-between px-6 relative z-50">
      <div className="flex items-center">
        <img
          src={"/idce_logo.avif"}
          alt="IDC Energy"
          className="h-10 w-auto"
        />
      </div>

      <div className="flex items-center gap-4">
        <button className="p-2 hover:bg-white/20 rounded-md transition-all duration-200 backdrop-blur-sm">
          <Search className="h-5 w-5 text-gray-600" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 hover:bg-white/20 rounded-md transition-all duration-200 backdrop-blur-sm p-2">
              <Avatar className="h-8 w-8 ring-2 ring-white/20">
                <AvatarFallback className="bg-teal-600 text-white text-xs font-semibold">
                  {user ? getInitials(user.name) : <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              {user && (
                <div className="flex flex-col items-start">
                  <span className="text-sm font-medium text-gray-700">{user.name}</span>
                  <span className="text-xs text-gray-500 capitalize">{user.role}</span>
                </div>
              )}
              <ChevronDown className="h-4 w-4 text-gray-600" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}