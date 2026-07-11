import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Edit3,
  KeyRound,
  LoaderCircle,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import {
  ApiError,
  createEmployeeAccount,
  disableEmployeeAccount,
  fetchEmployees,
  updateEmployeeAccount,
  type Employee,
  type EmployeeRole,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const PASSWORD_LENGTH = 16;
const PASSWORD_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
const PASSWORD_GROUPS = [
  "ABCDEFGHJKLMNPQRSTUVWXYZ",
  "abcdefghijkmnopqrstuvwxyz",
  "23456789",
  "!@#$%",
];

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

interface EmployeeForm {
  name: string;
  email: string;
  role: EmployeeRole;
}

interface CreateEmployeeForm extends EmployeeForm {
  password: string;
}

interface Credentials {
  name: string;
  email: string;
  password: string;
}

interface StatusChange {
  employee: Employee;
  makeActive: boolean;
}

function randomIndexes(length: number): Uint32Array {
  return crypto.getRandomValues(new Uint32Array(length));
}

function generateTemporaryPassword(): string {
  const values = randomIndexes(PASSWORD_LENGTH * 2);
  const characters = PASSWORD_GROUPS.map((group, index) => group[values[index] % group.length]);

  for (let index = characters.length; index < PASSWORD_LENGTH; index += 1) {
    characters.push(PASSWORD_CHARACTERS[values[index] % PASSWORD_CHARACTERS.length]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = values[PASSWORD_LENGTH + index] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

function newCreateForm(): CreateEmployeeForm {
  return {
    name: "",
    email: "",
    role: "employee",
    password: generateTemporaryPassword(),
  };
}

function sortEmployees(employees: Employee[]): Employee[] {
  return [...employees].sort((left, right) => {
    if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
}

function replaceEmployee(employees: Employee[], employee: Employee): Employee[] {
  return sortEmployees(employees.map((item) => (item.id === employee.id ? employee : item)));
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? "Unavailable" : dateTimeFormatter.format(date);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getEmployeeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.payload.error) {
    case "email_exists":
      return "That email address is already assigned to another account.";
    case "weak_password":
      return error.message;
    case "cannot_remove_own_admin_access":
      return "You cannot remove your own administrator access.";
    case "cannot_disable_self":
      return "You cannot disable your own account.";
    case "last_active_admin":
      return "Keep at least one active administrator account.";
    case "employee_not_found":
      return "This employee account no longer exists. Refresh the list and try again.";
    case "forbidden":
      return "Administrator access is required for this action.";
    default:
      return fallback;
  }
}

async function copyPassword(password: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(password);
    toast.success("Temporary password copied");
  } catch {
    toast.error("Could not copy the password. Select it manually instead.");
  }
}

export function EmployeesPage() {
  const { user, syncUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateEmployeeForm>(newCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<Credentials | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<EmployeeForm>({ name: "", email: "", role: "employee" });
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [statusChange, setStatusChange] = useState<StatusChange | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const [resetEmployee, setResetEmployee] = useState<Employee | null>(null);
  const [resetPassword, setResetPassword] = useState(generateTemporaryPassword);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetComplete, setResetComplete] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const loadEmployees = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await fetchEmployees();
      setEmployees(sortEmployees(response.employees));
    } catch (error) {
      setLoadError(getEmployeeErrorMessage(error, "We could not load employee accounts. Please try again."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const handleCreateOpenChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setCreateForm(newCreateForm());
      setCreateError(null);
      setCreatedCredentials(null);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);

    const name = createForm.name.trim().replace(/\s+/g, " ");
    const email = createForm.email.trim().toLowerCase();
    if (createForm.password.length < 12) {
      setCreateError("Temporary passwords must be at least 12 characters.");
      return;
    }

    setIsCreating(true);
    try {
      const response = await createEmployeeAccount({
        name,
        email,
        role: createForm.role,
        password: createForm.password,
      });
      setEmployees((current) => sortEmployees([...current, response.employee]));
      setCreatedCredentials({ name, email, password: createForm.password });
      toast.success("Employee account created");
    } catch (error) {
      setCreateError(getEmployeeErrorMessage(error, "We could not create this account. Please try again."));
    } finally {
      setIsCreating(false);
    }
  };

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditForm({ name: employee.name, email: employee.email, role: employee.role });
    setEditError(null);
  };

  const handleEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingEmployee) return;
    setEditError(null);

    const name = editForm.name.trim().replace(/\s+/g, " ");
    const email = editForm.email.trim().toLowerCase();
    const payload = {
      ...(name !== editingEmployee.name ? { name } : {}),
      ...(email !== editingEmployee.email ? { email } : {}),
      ...(editForm.role !== editingEmployee.role ? { role: editForm.role } : {}),
    };

    if (Object.keys(payload).length === 0) {
      setEditError("Make a change before saving.");
      return;
    }

    setIsEditing(true);
    try {
      const response = await updateEmployeeAccount(editingEmployee.id, payload);
      setEmployees((current) => replaceEmployee(current, response.employee));
      if (response.employee.id === user?.id) syncUser(response.employee);
      setEditingEmployee(null);
      toast.success("Employee account updated");
    } catch (error) {
      setEditError(getEmployeeErrorMessage(error, "We could not update this account. Please try again."));
    } finally {
      setIsEditing(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusChange) return;
    setStatusError(null);
    setIsChangingStatus(true);

    try {
      const response = statusChange.makeActive
        ? await updateEmployeeAccount(statusChange.employee.id, { is_active: true })
        : await disableEmployeeAccount(statusChange.employee.id);
      setEmployees((current) => replaceEmployee(current, response.employee));
      setStatusChange(null);
      toast.success(response.employee.is_active ? "Employee account enabled" : "Employee account disabled");
    } catch (error) {
      setStatusError(getEmployeeErrorMessage(error, "We could not change this account's status. Please try again."));
    } finally {
      setIsChangingStatus(false);
    }
  };

  const openResetDialog = (employee: Employee) => {
    setResetEmployee(employee);
    setResetPassword(generateTemporaryPassword());
    setResetError(null);
    setResetComplete(false);
  };

  const handleResetPassword = async () => {
    if (!resetEmployee) return;
    setResetError(null);
    if (resetPassword.length < 12) {
      setResetError("Temporary passwords must be at least 12 characters.");
      return;
    }

    setIsResetting(true);
    try {
      const response = await updateEmployeeAccount(resetEmployee.id, {
        temporary_password: resetPassword,
      });
      setEmployees((current) => replaceEmployee(current, response.employee));
      setResetComplete(true);
      toast.success("Temporary password set");
    } catch (error) {
      setResetError(getEmployeeErrorMessage(error, "We could not reset this password. Please try again."));
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center text-muted-foreground" role="status">
        <LoaderCircle aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />
        Loading employee accounts...
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl">
        <AlertTitle>Employee accounts unavailable</AlertTitle>
        <AlertDescription className="gap-3">
          <p>{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadEmployees()}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Administrator controls
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Employee accounts</h1>
          <p className="text-muted-foreground">Create accounts, manage access, and reset temporary credentials.</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={handleCreateOpenChange}>
          <DialogTrigger asChild>
            <Button>
              <Plus aria-hidden="true" />
              Add employee
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            {createdCredentials ? (
              <>
                <DialogHeader>
                  <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                    <Check aria-hidden="true" className="h-5 w-5" />
                  </div>
                  <DialogTitle>Account ready</DialogTitle>
                  <DialogDescription>
                    Share these credentials securely with {createdCredentials.name}. The employee must change this password after signing in.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 rounded-lg border border-border bg-muted/40 p-4">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                    <p className="break-all text-sm font-medium text-foreground">{createdCredentials.email}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="created-password">Temporary password</Label>
                    <div className="flex gap-2">
                      <Input id="created-password" value={createdCredentials.password} readOnly className="font-mono" />
                      <Button type="button" variant="outline" size="icon" onClick={() => void copyPassword(createdCredentials.password)} aria-label="Copy temporary password">
                        <Copy aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" onClick={() => handleCreateOpenChange(false)}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <form className="space-y-5" onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Add employee</DialogTitle>
                  <DialogDescription>
                    Create a company account with a temporary password that must be changed after first sign-in.
                  </DialogDescription>
                </DialogHeader>

                {createError && (
                  <Alert variant="destructive">
                    <AlertDescription>{createError}</AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="create-name">Full name</Label>
                    <Input
                      id="create-name"
                      name="name"
                      autoComplete="off"
                      minLength={2}
                      maxLength={120}
                      required
                      value={createForm.name}
                      onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="create-email">Email address</Label>
                    <Input
                      id="create-email"
                      name="email"
                      type="email"
                      autoComplete="off"
                      required
                      value={createForm.email}
                      onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-role">Role</Label>
                    <Select value={createForm.role} onValueChange={(role) => setCreateForm({ ...createForm, role: role as EmployeeRole })}>
                      <SelectTrigger id="create-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Employee</SelectItem>
                        <SelectItem value="admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="create-password">Temporary password</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setCreateForm({ ...createForm, password: generateTemporaryPassword() })}>
                        <RefreshCw aria-hidden="true" />
                        Generate new
                      </Button>
                    </div>
                    <Input
                      id="create-password"
                      name="temporary-password"
                      type="text"
                      autoComplete="off"
                      minLength={12}
                      maxLength={128}
                      required
                      value={createForm.password}
                      onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
                      aria-describedby="create-password-help"
                      className="font-mono"
                    />
                    <p id="create-password-help" className="text-xs text-muted-foreground">
                      At least 12 characters. You can share it after the account is created.
                    </p>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleCreateOpenChange(false)} disabled={isCreating}>Cancel</Button>
                  <Button type="submit" disabled={isCreating}>
                    {isCreating && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                    {isCreating ? "Creating..." : "Create account"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </header>

      <Card className="overflow-hidden bg-card/95 shadow-sm">
        <CardContent className="p-0">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-5">Employee</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="px-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-52 text-center">
                    <UserCog aria-hidden="true" className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                    <p className="font-medium text-foreground">No employee accounts</p>
                    <p className="mt-1 text-sm text-muted-foreground">Create the first account to get started.</p>
                  </TableCell>
                </TableRow>
              ) : employees.map((employee) => (
                <TableRow key={employee.id} className={!employee.is_active ? "opacity-70" : undefined}>
                  <TableCell className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-foreground">
                        {getInitials(employee.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">{employee.name}</p>
                          {employee.id === user?.id && <Badge variant="outline">You</Badge>}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{employee.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={employee.role === "admin" ? "secondary" : "outline"} className="capitalize">
                      {employee.role === "admin" ? "Administrator" : "Employee"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      <Badge variant={employee.is_active ? "default" : "outline"}>
                        {employee.is_active ? "Active" : "Disabled"}
                      </Badge>
                      {employee.must_change_password && (
                        <span className="text-xs text-muted-foreground">Password change required</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-foreground">{formatDateTime(employee.last_login_at)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">Created {formatDateTime(employee.created_at)}</span>
                  </TableCell>
                  <TableCell className="px-5">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(employee)} aria-label={`Edit ${employee.name}`}>
                        <Edit3 aria-hidden="true" />
                        <span className="hidden xl:inline">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openResetDialog(employee)}
                        disabled={employee.id === user?.id}
                        aria-label={`Reset password for ${employee.name}`}
                        title={employee.id === user?.id ? "Change your own password from Profile" : undefined}
                      >
                        <KeyRound aria-hidden="true" />
                        <span className="hidden xl:inline">Reset</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setStatusError(null);
                          setStatusChange({ employee, makeActive: !employee.is_active });
                        }}
                        disabled={employee.id === user?.id && employee.is_active}
                        aria-label={`${employee.is_active ? "Disable" : "Enable"} ${employee.name}`}
                        title={employee.id === user?.id && employee.is_active ? "You cannot disable your own account" : undefined}
                      >
                        {employee.is_active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                        <span className="hidden xl:inline">{employee.is_active ? "Disable" : "Enable"}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editingEmployee !== null} onOpenChange={(open) => !open && setEditingEmployee(null)}>
        <DialogContent>
          <form className="space-y-5" onSubmit={handleEdit}>
            <DialogHeader>
              <DialogTitle>Edit employee</DialogTitle>
              <DialogDescription>Update account details and workspace permissions.</DialogDescription>
            </DialogHeader>
            {editError && (
              <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>
            )}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full name</Label>
                <Input id="edit-name" minLength={2} maxLength={120} required value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email address</Label>
                <Input id="edit-email" type="email" required value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select value={editForm.role} onValueChange={(role) => setEditForm({ ...editForm, role: role as EmployeeRole })}>
                  <SelectTrigger id="edit-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
                {editingEmployee && editForm.role !== editingEmployee.role && (
                  <p className="text-xs text-muted-foreground">Changing a role signs this employee out of active sessions.</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingEmployee(null)} disabled={isEditing}>Cancel</Button>
              <Button type="submit" disabled={isEditing}>
                {isEditing && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                {isEditing ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={statusChange !== null} onOpenChange={(open) => !open && setStatusChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusChange?.makeActive ? "Enable" : "Disable"} {statusChange?.employee.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusChange?.makeActive
                ? "This employee will be able to sign in and access the workspace again."
                : "This immediately revokes active sessions and prevents the employee from signing in. Their account history remains available."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {statusError && (
            <Alert variant="destructive"><AlertDescription>{statusError}</AlertDescription></Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingStatus}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={statusChange?.makeActive ? undefined : "bg-destructive text-white hover:bg-destructive/90"}
              disabled={isChangingStatus}
              onClick={(event) => {
                event.preventDefault();
                void handleStatusChange();
              }}
            >
              {isChangingStatus && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {isChangingStatus ? "Updating..." : statusChange?.makeActive ? "Enable account" : "Disable account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={resetEmployee !== null}
        onOpenChange={(open) => {
          if (!open) {
            setResetEmployee(null);
            setResetError(null);
            setResetComplete(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resetComplete ? "Temporary password ready" : `Reset password for ${resetEmployee?.name}?`}</DialogTitle>
            <DialogDescription>
              {resetComplete
                ? "Share this password securely. It will not be shown again after you close this window."
                : "Resetting the password revokes active sessions and requires the employee to choose a new password after signing in."}
            </DialogDescription>
          </DialogHeader>
          {resetError && (
            <Alert variant="destructive"><AlertDescription>{resetError}</AlertDescription></Alert>
          )}
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="reset-password">Temporary password</Label>
              {!resetComplete && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setResetPassword(generateTemporaryPassword())}>
                  <RefreshCw aria-hidden="true" />
                  Generate new
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                id="reset-password"
                type="text"
                minLength={12}
                maxLength={128}
                value={resetPassword}
                readOnly={resetComplete}
                onChange={(event) => setResetPassword(event.target.value)}
                className="font-mono"
              />
              {resetComplete && (
                <Button type="button" variant="outline" size="icon" onClick={() => void copyPassword(resetPassword)} aria-label="Copy temporary password">
                  <Copy aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            {resetComplete ? (
              <Button type="button" onClick={() => setResetEmployee(null)}>Done</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setResetEmployee(null)} disabled={isResetting}>Cancel</Button>
                <Button type="button" variant="destructive" onClick={() => void handleResetPassword()} disabled={isResetting}>
                  {isResetting && <LoaderCircle aria-hidden="true" className="animate-spin" />}
                  {isResetting ? "Resetting..." : "Reset password"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
