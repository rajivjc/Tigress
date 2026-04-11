export type UserRole = "member" | "staff" | "manager" | "owner";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Table {
  id: string;
  number: number;
  status: "available" | "occupied" | "reserved" | "maintenance";
}

export interface Booking {
  id: string;
  userId: string;
  tableId: string;
  startsAt: string;
  endsAt: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
}
