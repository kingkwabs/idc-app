import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  changeCurrentUserPassword,
  updateCurrentUser,
  type Employee,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAccountErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.payload.error) {
    case "email_exists":
      return "That email address is already in use.";
    case "current_password_required":
    case "invalid_current_password":
      return "Your current password is incorrect.";
    case "password_reuse_not_allowed":
      return "Your new password must be different from your current password.";
    case "weak_password":
      return error.message;
    default:
      return fallback;
  }
}

interface ProfileFormsProps {
  user: Employee;
  onUserChange: (user: Employee) => void;
}

function ProfileForms({ user, onUserChange }: ProfileFormsProps) {
  const [profile, setProfile] = useState({
    name: user.name,
    email: user.email,
    currentPassword: "",
  });
  const [password, setPassword] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const normalizedName = profile.name.trim().replace(/\s+/g, " ");
  const normalizedEmail = profile.email.trim().toLowerCase();
  const emailChanged = normalizedEmail !== user.email;
  const profileChanged = normalizedName !== user.name || emailChanged;

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError(null);

    if (!profileChanged) {
      setProfileError("Make a change to your name or email before saving.");
      return;
    }
    if (emailChanged && !profile.currentPassword) {
      setProfileError("Enter your current password to change your email address.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await updateCurrentUser({
        ...(normalizedName !== user.name ? { name: normalizedName } : {}),
        ...(emailChanged
          ? { email: normalizedEmail, current_password: profile.currentPassword }
          : {}),
      });
      onUserChange(response.user);
      setProfile((current) => ({
        ...current,
        name: response.user.name,
        email: response.user.email,
        currentPassword: "",
      }));
      toast.success("Profile updated");
    } catch (error) {
      setProfileError(getAccountErrorMessage(error, "We could not update your profile. Please try again."));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);

    if (password.next.length < 12) {
      setPasswordError("Your new password must be at least 12 characters.");
      return;
    }
    if (password.next !== password.confirm) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }
    if (password.current === password.next) {
      setPasswordError("Your new password must be different from your current password.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const response = await changeCurrentUserPassword({
        current_password: password.current,
        new_password: password.next,
      });
      onUserChange(response.user);
      setPassword({ current: "", next: "", confirm: "" });
      toast.success("Password changed");
    } catch (error) {
      setPasswordError(getAccountErrorMessage(error, "We could not change your password. Please try again."));
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-xl font-semibold text-card-foreground shadow-sm">
          {getInitials(user.name)}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{user.name}</h1>
            <Badge variant="secondary" className="capitalize">{user.role}</Badge>
          </div>
          <p className="text-muted-foreground">Manage your identity and account security.</p>
        </div>
      </header>

      {user.must_change_password && (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Password change required</AlertTitle>
          <AlertDescription>
            Your account is using a temporary password. Choose a new password before continuing regular work.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card/95 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <UserRound aria-hidden="true" className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Profile details</CardTitle>
                <CardDescription>Update the name and email shown across the workspace.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleProfileSubmit}>
              {profileError && (
                <Alert variant="destructive">
                  <AlertDescription>{profileError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="profile-name">Full name</Label>
                <Input
                  id="profile-name"
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={120}
                  required
                  value={profile.name}
                  onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email">Email address</Label>
                <Input
                  id="profile-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={profile.email}
                  onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                />
              </div>

              {emailChanged && (
                <div className="space-y-2">
                  <Label htmlFor="profile-current-password">Current password</Label>
                  <Input
                    id="profile-current-password"
                    name="current-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={profile.currentPassword}
                    onChange={(event) => setProfile({ ...profile, currentPassword: event.target.value })}
                    aria-describedby="profile-current-password-help"
                  />
                  <p id="profile-current-password-help" className="text-xs text-muted-foreground">
                    Required to verify an email address change.
                  </p>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setProfile({ name: user.name, email: user.email, currentPassword: "" });
                    setProfileError(null);
                  }}
                  disabled={isSavingProfile}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={isSavingProfile || !profileChanged}>
                  {isSavingProfile ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
                  {isSavingProfile ? "Saving..." : "Save profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-card/95 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <KeyRound aria-hidden="true" className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Change password</CardTitle>
                <CardDescription>Use at least 12 characters and avoid personal details.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handlePasswordSubmit}>
              {passwordError && (
                <Alert variant="destructive">
                  <AlertDescription>{passwordError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="password-current">Current password</Label>
                <Input
                  id="password-current"
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password.current}
                  onChange={(event) => setPassword({ ...password, current: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password-new">New password</Label>
                <Input
                  id="password-new"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password.next}
                  onChange={(event) => setPassword({ ...password, next: event.target.value })}
                  aria-describedby="password-new-help"
                />
                <p id="password-new-help" className="text-xs text-muted-foreground">12 to 128 characters.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password-confirm">Confirm new password</Label>
                <Input
                  id="password-confirm"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password.confirm}
                  onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={isSavingPassword || !password.current || !password.next || !password.confirm}
                >
                  {isSavingPassword ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <KeyRound aria-hidden="true" />}
                  {isSavingPassword ? "Updating..." : "Update password"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, isLoading, refreshUser, syncUser } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground" role="status">
        <LoaderCircle aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />
        Loading profile...
      </div>
    );
  }

  if (!user) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl">
        <AlertTitle>Profile unavailable</AlertTitle>
        <AlertDescription className="gap-3">
          <p>We could not load your account details.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refreshUser().catch(() => toast.error("We still could not load your profile."));
            }}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ProfileForms
      key={`${user.id}:${user.updated_at}:${user.email}:${user.must_change_password}`}
      user={user}
      onUserChange={syncUser}
    />
  );
}
