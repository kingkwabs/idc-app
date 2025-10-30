import { useState, useEffect } from "react";
import { User } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5001';

interface UserProfile {
  id: number;
  name: string;
  email: string;
  role: string;
}

export function ProfilePage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setFormData({
          name: data.user.name,
          email: data.user.email,
          password: ''
        });
      } else {
        toast.error('Failed to fetch profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Error fetching profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) return;

    // Only send fields that have changed
    const updatePayload: any = {};
    if (formData.name && formData.name !== user.name) {
      updatePayload.name = formData.name;
    }
    if (formData.email && formData.email !== user.email) {
      updatePayload.email = formData.email;
    }
    if (formData.password) {
      updatePayload.password = formData.password;
    }

    if (Object.keys(updatePayload).length === 0) {
      toast.error('No changes to save');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatePayload)
      });

      if (response.ok) {
        const data = await response.json();
        // Update token if it changed
        if (data.access_token) {
          localStorage.setItem('access_token', data.access_token);
        }
        toast.success('Profile updated successfully');
        setFormData({ ...formData, password: '' }); // Clear password field
        fetchProfile(); // Refresh data
      } else {
        const data = await response.json();
        toast.error(data.error === 'email_exists' ? 'Email already exists' : 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Error updating profile');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Failed to load profile</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 bg-teal-100 rounded-full flex items-center justify-center">
          <span className="text-teal-600 font-bold text-2xl">
            {user.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2)}
          </span>
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{user.name}</h1>
          <p className="text-gray-600 capitalize">{user.role}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Edit Profile</h2>

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="John Doe"
            />
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              placeholder="john@example.com"
            />
          </div>

          <div>
            <Label htmlFor="password">New Password (leave blank to keep current)</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              minLength={6}
            />
            <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
          </div>

          <div>
            <Label>Role</Label>
            <Input
              value={user.role}
              disabled
              className="bg-gray-100 cursor-not-allowed capitalize"
            />
            <p className="text-xs text-gray-500 mt-1">Contact an administrator to change your role</p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={fetchProfile}>
              Reset
            </Button>
            <Button type="submit" className="bg-teal-600 hover:bg-teal-700">
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
