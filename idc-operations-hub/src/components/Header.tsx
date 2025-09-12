import { Search, User } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import companyLogo from "figma:asset/f346f6831e16c65c85c68103ea9e8b0631322639.png";

export function Header() {
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
        <Avatar className="h-8 w-8 ring-2 ring-white/20">
          <AvatarFallback className="bg-white/20 text-gray-700 backdrop-blur-sm">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}