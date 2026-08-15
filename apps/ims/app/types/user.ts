export type UserRole = "CASHIER" | "BARISTA" | "MANAGER" | "ADMIN";

export interface StaffUser {
  id: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string | null;
}

export interface UserCreatePayload {
  name: string;
  pin: string;
  role: UserRole;
  isActive: boolean;
}

export interface UserUpdatePayload {
  name: string;
  role: UserRole;
  isActive: boolean;
  pin?: string;
}
