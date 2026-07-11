import { useState, type Ref } from "react";
import { ChevronDown, FileText, LoaderCircle, LogOut, Menu, ShieldCheck, User, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth";
import { Avatar, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function Header({
  navigationButtonRef,
  onOpenNavigation,
}: {
  navigationButtonRef?: Ref<HTMLButtonElement>;
  onOpenNavigation?: () => void;
}) {
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate("/", { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/95 px-3 shadow-[var(--shadow-control)] backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onOpenNavigation && (
          <button
            ref={navigationButtonRef}
            type="button"
            onClick={onOpenNavigation}
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-transparent text-foreground outline-none transition-[background-color,border-color,box-shadow,transform] duration-150 [transition-timing-function:var(--ease-out-ui)] hover:border-border hover:bg-secondary active:scale-[0.97] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)] motion-reduce:transition-none motion-reduce:active:scale-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-md outline-none transition-opacity duration-150 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Go to transactions"
        >
          <img src="/idce_logo.avif" alt="IDC Energy" className="h-9 w-auto sm:h-10" />
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 rounded-md border border-transparent p-1.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:border-border hover:bg-secondary focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-[var(--color-ring-soft)]"
            aria-label="Open account menu"
          >
            <Avatar className="size-8 border border-border">
              <AvatarFallback className="bg-foreground text-xs font-semibold text-background">
                {user ? getInitials(user.name) : <User aria-hidden="true" className="size-4" />}
              </AvatarFallback>
            </Avatar>
            {user && (
              <div className="hidden min-w-0 flex-col sm:flex">
                <span className="max-w-44 truncate text-sm font-medium text-foreground">{user.name}</span>
                <span className="text-xs capitalize text-muted-foreground">{user.role}</span>
              </div>
            )}
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-sm font-medium leading-none">{user?.name}</p>
              <p className="truncate text-xs font-normal leading-none text-muted-foreground">{user?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/profile")}>
            <UserCircle aria-hidden="true" />
            My profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/privacy-policy")}>
            <ShieldCheck aria-hidden="true" />
            Privacy policy
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/eula")}>
            <FileText aria-hidden="true" />
            EULA
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="text-destructive focus:text-destructive"
          >
            {isLoggingOut ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <LogOut aria-hidden="true" />}
            {isLoggingOut ? "Signing out..." : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
